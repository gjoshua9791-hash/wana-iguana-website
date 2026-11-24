#!/usr/bin/env bash
#
# verify_b3_seed.sh — Isolated, runnable verification for the B3 seed migration
# (0004_seed_taco_suave.sql).
#
# PARTIAL local test: it applies the REAL 0001 -> 0002 -> 0004 into a DISPOSABLE
# throwaway database and asserts the seeded Taco Suave rows. It deliberately does
# NOT include 0003 (access policies), which does not exist yet. This is NOT a
# verification of the full shared-database deployment sequence; that sequence is
# 0001 -> 0002 -> 0003 -> 0004 and must be followed when 0003 exists.
#
# Safety:
#   * Target validated to be an explicitly named LOCAL throwaway DB on loopback.
#   * Never touches the retained wana_iguana_schema_test database.
#   * psql uses -X, --single-transaction where a tx is needed, ON_ERROR_STOP=1.
#   * Every asserted value is checked explicitly; any mismatch/unexpected error
#     fails the run (exit 1).
#   * Cleanup drops only the uniquely named DB this run created.
#
# Usage: server/migrations/verify_b3_seed.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1
PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
THROWAWAY_DB="wana_b3_seed_verify_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0

echo "=== wana B3 seed verification — run ${RUN_ID} ==="
echo "psql:         $PSQL"
echo "migrations:   $MIGDIR"
echo "throwaway DB: $THROWAWAY_DB"
echo "(PARTIAL: applies 0001,0002,0004; 0003 does not exist yet)"
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
case "$actual_db" in wana_b3_seed_verify_*) : ;; *) echo "FATAL: not a throwaway db '$actual_db'"; exit 2;; esac
[ "$actual_host" = "127.0.0.1" ] || { echo "FATAL: non-loopback host '$actual_host'"; exit 2; }
# Extra guard: never operate on the retained database.
[ "$actual_db" != "wana_iguana_schema_test" ] || { echo "FATAL: refusing to touch retained DB"; exit 2; }
echo "Target validated: db=${actual_db} host=${actual_host}"
echo

cleanup() {
  echo
  echo "=== cleanup (resources created by this run only) ==="
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${THROWAWAY_DB};" 2>&1 | sed 's/^/  /'
}
trap cleanup EXIT

echo "=== apply ledger init + 0001 + 0002 + 0004 (real files, atomic per file) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction <<SQL >/dev/null
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
SQL
for f in 0001_create_catalog.sql 0002_one_active_default.sql 0004_seed_taco_suave.sql; do
  "$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$MIGDIR/$f" \
    -c "INSERT INTO public.schema_migrations (filename) VALUES ('$f');" >/dev/null \
    || { fail "apply $f failed"; exit 1; }
done
ledger="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$ledger" = "0001_create_catalog.sql,0002_one_active_default.sql,0004_seed_taco_suave.sql" ] \
  && pass "setup: 0001,0002,0004 applied and recorded in ledger (0003 intentionally absent)" \
  || { fail "setup: unexpected ledger '$ledger'"; exit 1; }
echo

# assert_eq LABEL EXPECTED SQL
assert_eq() {
  local label="$1" want="$2" sql="$3" got
  got="$("$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -At -c "$sql" 2>&1)" \
    || { fail "$label: query error: $got"; return; }
  [ "$got" = "$want" ] && pass "$label = '$got'" || fail "$label: expected '$want', got '$got'"
}

echo "=== 1. menu_item ==="
assert_eq "menu_item present+active+name" "Taco Suave|true" \
  "select name||'|'||is_active from public.menu_item where id='taco-suave';"
assert_eq "menu_item description" "Soft corn tortilla taco with lettuce, cheese, and pico de gallo." \
  "select description from public.menu_item where id='taco-suave';"

echo "=== 2. item_variant (default, active, 525) ==="
assert_eq "variant id|name|price|default|active" "taco-suave-base|Base|525|true|true" \
  "select id||'|'||name||'|'||base_price_cents||'|'||is_default||'|'||is_active from public.item_variant where item_id='taco-suave';"

echo "=== 3. modifier_group ==="
assert_eq "group id|name|label" "protein|Protein|Choose one" \
  "select id||'|'||name||'|'||label from public.modifier_group where id='protein';"

echo "=== 4. modifier_option (Steak, Chicken; delta 0; ordered) ==="
assert_eq "options ordered with deltas" "steak:Steak:0:1|chicken:Chicken:0:2" \
  "select string_agg(id||':'||name||':'||price_delta_cents||':'||sort_order,'|' order by sort_order) from public.modifier_option where group_id='protein';"
assert_eq "option count" "2" \
  "select count(*) from public.modifier_option where group_id='protein';"

echo "=== 5. variant_modifier_group link (min=1,max=1) ==="
assert_eq "link variant|group|min|max|sort" "taco-suave-base|protein|1|1|1" \
  "select variant_id||'|'||group_id||'|'||min_select||'|'||max_select||'|'||sort_order from public.variant_modifier_group;"

echo "=== 6. joined shape (item -> default variant -> group -> options) ==="
assert_eq "joined row count (item x active default x link x 2 options)" "2" \
  "select count(*)
     from public.menu_item mi
     join public.item_variant iv on iv.item_id=mi.id and iv.is_default and iv.is_active
     join public.variant_modifier_group vmg on vmg.variant_id=iv.id
     join public.modifier_group mg on mg.id=vmg.group_id
     join public.modifier_option mo on mo.group_id=mg.id
    where mi.id='taco-suave' and mi.is_active;"
assert_eq "joined price via default variant" "525" \
  "select iv.base_price_cents
     from public.menu_item mi
     join public.item_variant iv on iv.item_id=mi.id and iv.is_default and iv.is_active
    where mi.id='taco-suave';"

echo "=== 7. idempotency: re-applying the seed body does not error or duplicate ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction -f "$MIGDIR/0004_seed_taco_suave.sql" >/dev/null \
  && pass "seed re-apply succeeded (ON CONFLICT DO NOTHING)" \
  || fail "seed re-apply errored"
assert_eq "option count still 2 after re-apply" "2" \
  "select count(*) from public.modifier_option where group_id='protein';"
assert_eq "one active default still (no dup)" "1" \
  "select count(*) from public.item_variant where item_id='taco-suave' and is_default and is_active;"
echo

echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL SEED CHECKS PASSED"; exit 0
else echo "RESULT: FAILURES PRESENT (see FAIL lines above)"; exit 1; fi
