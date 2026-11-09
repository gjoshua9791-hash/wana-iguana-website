#!/usr/bin/env bash
#
# verify_b1_b2.sh — Isolated, runnable verification for the B1/B2 catalog
# migrations (0001_create_catalog.sql, 0002_one_active_default.sql).
#
# Focuses on checks NOT already demonstrated interactively:
#   1. Invalid-data rejection (CHECK / unique / FK), asserted by SQLSTATE.
#   2. Migration-ledger protection against a NOSUPERUSER/NOBYPASSRLS role.
#   3. Atomic failure: a mid-transaction error rolls back schema AND ledger.
# Re-applies the REAL migration files into a DISPOSABLE throwaway database
# (never the shared dev DB or the kept wana_iguana_schema_test), then tears
# that throwaway down.
#
# Safety:
#   * Target validated to be an explicitly named LOCAL throwaway DB on loopback.
#   * psql uses -X, --single-transaction where a tx is needed, ON_ERROR_STOP=1.
#   * Every expected failure is asserted against the INTENDED SQLSTATE, not "any
#     error". Unexpected errors fail the verification (exit 1).
#   * Temporary resources use exact unique names; cleanup is limited to them.
#
# Usage: server/migrations/verify_b1_b2.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1
PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
THROWAWAY_DB="wana_b1b2_verify_${RUN_ID}"
PROBE_ROLE="wana_verify_probe_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0

# Extract the 5-char SQLSTATE that psql (VERBOSITY=verbose) prints as
# "ERROR:  <CODE>: <message>". Returns empty if none found.
sqlstate_of() { printf '%s\n' "$1" | sed -n 's/^ERROR:  \([0-9A-Z]\{5\}\):.*/\1/p' | head -1; }

echo "=== wana B1/B2 verification — run ${RUN_ID} ==="
echo "psql:         $PSQL"
echo "migrations:   $MIGDIR"
echo "throwaway DB: $THROWAWAY_DB"
echo "probe role:   $PROBE_ROLE"
echo

"$PSQL" --version | grep -q "PostgreSQL" || { echo "FATAL: psql not usable"; exit 2; }
ADMIN="postgresql://${HOST}:${PORT}/postgres"

if [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_database where datname='${THROWAWAY_DB}'")" = "1" ]; then
  echo "FATAL: throwaway DB ${THROWAWAY_DB} unexpectedly already exists"; exit 2
fi
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${THROWAWAY_DB};" >/dev/null
URL="postgresql://${HOST}:${PORT}/${THROWAWAY_DB}"

actual_db="$("$PSQL" -X "$URL" -At -c "select current_database();")"
actual_host="$("$PSQL" -X "$URL" -At -c "select coalesce(host(inet_server_addr()),'local');")"
[ "$actual_db" = "$THROWAWAY_DB" ] || { echo "FATAL: connected db '$actual_db' != '$THROWAWAY_DB'"; exit 2; }
case "$actual_db" in wana_b1b2_verify_*) : ;; *) echo "FATAL: not a throwaway db '$actual_db'"; exit 2;; esac
[ "$actual_host" = "127.0.0.1" ] || { echo "FATAL: non-loopback host '$actual_host'"; exit 2; }
echo "Target validated: db=${actual_db} host=${actual_host}"
echo

cleanup() {
  echo
  echo "=== cleanup (resources created by this run only) ==="
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${THROWAWAY_DB};" 2>&1 | sed 's/^/  /'
  "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS ${PROBE_ROLE};" 2>&1 | sed 's/^/  /'
}
trap cleanup EXIT

echo "=== apply ledger init + 0001 + 0002 (real files) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction <<SQL >/dev/null
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
SQL
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f "$MIGDIR/0001_create_catalog.sql" \
  -c "INSERT INTO public.schema_migrations (filename) VALUES ('0001_create_catalog.sql');" >/dev/null
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f "$MIGDIR/0002_one_active_default.sql" \
  -c "INSERT INTO public.schema_migrations (filename) VALUES ('0002_one_active_default.sql');" >/dev/null
ledger0="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$ledger0" = "0001_create_catalog.sql,0002_one_active_default.sql" ] \
  && pass "setup: both migrations applied and recorded in ledger" \
  || { fail "setup: unexpected ledger '$ledger0'"; exit 1; }
echo

expect_sqlstate() {  # $1=label  $2=expected  $3=sql
  local label="$1" want="$2" sql="$3" out got
  out="$("$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -c "$sql" 2>&1)"
  if [ $? -eq 0 ]; then fail "$label: statement SUCCEEDED but should have been rejected"; return; fi
  got="$(sqlstate_of "$out")"
  [ "$got" = "$want" ] && pass "$label: rejected with SQLSTATE $got" \
    || fail "$label: expected $want, got '${got:-none}' — $out"
}

echo "=== 1. Invalid-data rejection (asserted by SQLSTATE) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 >/dev/null <<SQL
INSERT INTO public.menu_item (id,name) VALUES ('mi','Item');
INSERT INTO public.item_variant (id,item_id,name,base_price_cents) VALUES ('iv','mi','V',100);
INSERT INTO public.modifier_group (id,name,label) VALUES ('mg','Protein','Choose one');
INSERT INTO public.variant_modifier_group (variant_id,group_id,min_select,max_select) VALUES ('iv','mg',1,1);
SQL
expect_sqlstate "neg base_price_cents"      23514 "INSERT INTO public.item_variant (id,item_id,name,base_price_cents) VALUES ('iv_neg','mi','Neg',-1);"
expect_sqlstate "neg price_delta_cents"     23514 "INSERT INTO public.modifier_option (id,group_id,name,price_delta_cents) VALUES ('mo_neg','mg','X',-1);"
expect_sqlstate "min_select < 0"            23514 "INSERT INTO public.variant_modifier_group (variant_id,group_id,min_select,max_select) VALUES ('iv','mg',-1,1);"
expect_sqlstate "max_select < 1"            23514 "INSERT INTO public.variant_modifier_group (variant_id,group_id,min_select,max_select) VALUES ('iv','mg',0,0);"
expect_sqlstate "max_select < min_select"   23514 "INSERT INTO public.variant_modifier_group (variant_id,group_id,min_select,max_select) VALUES ('iv','mg',3,2);"
expect_sqlstate "duplicate composite PK"    23505 "INSERT INTO public.variant_modifier_group (variant_id,group_id,min_select,max_select) VALUES ('iv','mg',1,1);"
expect_sqlstate "FK item_variant->missing"  23503 "INSERT INTO public.item_variant (id,item_id,name,base_price_cents) VALUES ('iv_fk','nope','N',100);"
expect_sqlstate "FK modifier_option->missing" 23503 "INSERT INTO public.modifier_option (id,group_id,name) VALUES ('mo_fk','nope','N');"
expect_sqlstate "FK vmg->missing variant"   23503 "INSERT INTO public.variant_modifier_group (variant_id,group_id) VALUES ('nope','mg');"
expect_sqlstate "FK vmg->missing group"     23503 "INSERT INTO public.variant_modifier_group (variant_id,group_id) VALUES ('iv','nope');"
echo

echo "=== 2. Migration-ledger protection (non-owner NOSUPERUSER NOBYPASSRLS) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -v role="$PROBE_ROLE" >/dev/null <<SQL
CREATE ROLE :"role" NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO :"role";
SQL
hasins="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('${PROBE_ROLE}','public.schema_migrations','INSERT')")"
hassel="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('${PROBE_ROLE}','public.schema_migrations','SELECT')")"
echo "  ledger privileges for probe: INSERT=$hasins SELECT=$hassel (expect both 'f' under documented REVOKE)"
if [ "$hasins" = "f" ] && [ "$hassel" = "f" ]; then
  pass "ledger: probe has NO table privileges (documented REVOKE ALL FROM PUBLIC holds)"
else
  fail "ledger: probe unexpectedly has privileges INSERT=$hasins SELECT=$hassel"
fi

# Run an op as the probe role via heredoc so :"role" interpolates; ON_ERROR_STOP
# ensures a failed SET ROLE aborts before the mutation.
ledger_op_as_probe() {  # $1=sql
  "$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -v role="$PROBE_ROLE" 2>&1 <<SQL
SET ROLE :"role";
$1
SQL
}
for op in \
  "INSERT:INSERT INTO public.schema_migrations (filename) VALUES ('hacked.sql');" \
  "UPDATE:UPDATE public.schema_migrations SET filename='x' WHERE filename='0001_create_catalog.sql';" \
  "DELETE:DELETE FROM public.schema_migrations WHERE filename='0001_create_catalog.sql';" ; do
  name="${op%%:*}"; sql="${op#*:}"
  out="$(ledger_op_as_probe "$sql")"; rc=$?
  code="$(sqlstate_of "$out")"
  # Confirm SET ROLE actually took effect (no syntax/role error), then that the
  # DML was denied by PRIVILEGE (42501), distinct from an RLS policy denial.
  if printf '%s' "$out" | grep -q "42601"; then
    fail "ledger $name: SET ROLE failed to interpolate (42601) — $out"
  elif [ $rc -ne 0 ] && [ "$code" = "42501" ]; then
    pass "ledger $name denied by PRIVILEGE (SQLSTATE 42501 insufficient_privilege)"
  else
    fail "ledger $name: rc=$rc code='${code:-none}' — $out"
  fi
done
ledger_after="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$ledger_after" = "$ledger0" ] && pass "ledger unchanged after denied non-owner writes" \
  || fail "ledger CHANGED: '$ledger_after' (was '$ledger0')"
echo

echo "=== 3. Atomic failure: schema change + forced error in one transaction ==="
before_tbl="$("$PSQL" -X "$URL" -At -c "select to_regclass('public.atomic_probe') is not null")"
out="$("$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction --set=VERBOSITY=verbose \
  -c "CREATE TABLE public.atomic_probe (id int);" \
  -c "INSERT INTO public.schema_migrations (filename) VALUES (NULL);" \
  -c "INSERT INTO public.schema_migrations (filename) VALUES ('atomic_probe.sql');" 2>&1)"
rc=$?
code="$(sqlstate_of "$out")"
after_tbl="$("$PSQL" -X "$URL" -At -c "select to_regclass('public.atomic_probe') is not null")"
ledger_atomic="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
# 23502 = not_null_violation (forced NULL filename AFTER the CREATE TABLE)
if [ $rc -ne 0 ] && [ "$code" = "23502" ]; then
  pass "atomic: transaction aborted with intended SQLSTATE 23502 (not_null_violation)"
else
  fail "atomic: expected 23502, rc=$rc code='${code:-none}' — $out"
fi
[ "$after_tbl" = "f" ] && pass "atomic: schema change (atomic_probe) rolled back — table absent" \
  || fail "atomic: atomic_probe PERSISTED (before=$before_tbl after=$after_tbl)"
[ "$ledger_atomic" = "$ledger0" ] && pass "atomic: ledger unchanged (no partial 'atomic_probe.sql')" \
  || fail "atomic: ledger changed to '$ledger_atomic'"
echo

echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL CHECKS PASSED"; exit 0
else echo "RESULT: FAILURES PRESENT (see FAIL lines above)"; exit 1; fi
