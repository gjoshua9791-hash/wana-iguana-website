#!/usr/bin/env bash
#
# verify_d4_endpoint.sh — D4 invariants against an ISOLATED, disposable local
# PostgreSQL database (never Supabase, no shared data mutated).
#
# D4 "Done when":
#   1. A second active default variant for the same item is REJECTED by the
#      partial unique index (DB error expected).
#   2. Missing active default -> the endpoint's data path yields ZERO rows, which
#      the mapper turns into null and the route returns 404 (never merges another
#      variant). Verified here at the query level against the isolated DB; the
#      zero-rows -> null -> 404 chain is unit/HTTP-proven elsewhere.
#   3. Happy path -> the default-variant query returns basePriceCents 525, group
#      label "Choose one", minSelect 1 / maxSelect 1, and both protein options
#      with priceDeltaCents present.
#
# TLS note: the running Express app enforces verified TLS (rejectUnauthorized
# true), which local Postgres.app does not offer; we therefore do NOT point the
# live app at the local DB (that would require weakening TLS). Instead we exercise
# the REAL default-variant SQL (the same statement the app runs) against the
# isolated DB for the query-level invariants, and rely on the already-recorded
# live Supabase 200/404 HTTP evidence for the end-to-end endpoint behavior.
#
# Usage: server/migrations/verify_d4_endpoint.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1; PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
DB="wana_d4_verify_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://${HOST}:${PORT}/postgres"
URL="postgresql://${HOST}:${PORT}/${DB}"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0
sqlstate_of() { printf '%s\n' "$1" | sed -n 's/^ERROR:  \([0-9A-Z]\{5\}\):.*/\1/p' | head -1; }

echo "=== D4 isolated-DB verification — run ${RUN_ID} ==="
"$PSQL" --version

# menu_backend is a cluster role created by 0003; refuse if it pre-exists so we
# never touch unknown state, and track whether we created it.
MB_PRE=0; [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_roles where rolname='menu_backend'")" = "1" ] && MB_PRE=1
if [ "$MB_PRE" = "1" ]; then echo "FATAL: menu_backend already exists; refusing to touch it"; exit 2; fi

[ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_database where datname='${DB}'")" = "1" ] && { echo "FATAL: $DB exists"; exit 2; }
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};" >/dev/null
adb="$("$PSQL" -X "$URL" -At -c "select current_database()")"
case "$adb" in wana_d4_verify_*) : ;; *) echo "FATAL: not throwaway db ($adb)"; exit 2;; esac

cleanup() {
  echo; echo "=== cleanup (only this run's resources) ==="
  local cf=0
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB};" 2>&1 | sed 's/^/  /' || cf=1
  "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS menu_backend;" 2>&1 | sed 's/^/  /' || cf=1
  [ "$cf" -ne 0 ] && { echo "ERROR: cleanup failed" >&2; exit 1; }
}
trap cleanup EXIT

echo "=== provision schema+seed into isolated DB via the runner (0001-0004) ==="
DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" >/dev/null 2>&1 \
  && pass "migrations applied to isolated DB" || { fail "runner failed"; exit 1; }

# The exact statement the app runs (design §4 / queries.ts DEFAULT_VARIANT_SQL).
read -r -d '' DV_SQL <<'SQL' || true
WITH default_variant AS (
  SELECT iv.id, iv.item_id, iv.base_price_cents
  FROM public.item_variant iv
  JOIN public.menu_item mi ON mi.id = iv.item_id AND mi.is_active
  WHERE iv.item_id = $1 AND iv.is_default AND iv.is_active
  LIMIT 1
)
SELECT mi.id AS item_id, mi.name AS item_name, mi.description,
       dv.id AS variant_id, dv.base_price_cents,
       mg.id AS group_id, mg.label, vmg.min_select, vmg.max_select, vmg.sort_order AS group_sort,
       mo.id AS option_id, mo.name AS option_name, mo.price_delta_cents, mo.sort_order AS option_sort
FROM default_variant dv
JOIN public.menu_item mi ON mi.id = dv.item_id
LEFT JOIN public.variant_modifier_group vmg ON vmg.variant_id = dv.id
LEFT JOIN public.modifier_group mg ON mg.id = vmg.group_id
LEFT JOIN public.modifier_option mo ON mo.group_id = mg.id
ORDER BY vmg.sort_order, mo.sort_order
SQL

echo "=== Criterion 3: happy-path query shape (525 / Choose one / 1/1 / 2 options) ==="
summary="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 <<SQL
SELECT q.base_price_cents||'|'||q.label||'|'||q.min_select||'|'||q.max_select
FROM ( $(printf '%s' "$DV_SQL" | sed "s/\\\$1/'taco-suave'/") ) q
ORDER BY q.option_sort LIMIT 1;
SQL
)"
opts="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 <<SQL
SELECT string_agg(q.option_id||':'||q.price_delta_cents, ',' ORDER BY q.option_sort)
FROM ( $(printf '%s' "$DV_SQL" | sed "s/\\\$1/'taco-suave'/") ) q;
SQL
)"
[ "$summary" = "525|Choose one|1|1" ] && pass "happy: 525 / Choose one / minSelect 1 / maxSelect 1" || fail "happy summary='$summary'"
[ "$opts" = "steak:0,chicken:0" ] && pass "happy: options steak,chicken with priceDeltaCents=0 in order" || fail "happy opts='$opts'"

echo "=== Criterion 2: missing active default -> query returns ZERO rows ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -c "UPDATE public.menu_item SET is_active=true WHERE id='taco-suave';" >/dev/null
# Deactivate the default variant; the item stays active but has no active default.
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -c "UPDATE public.item_variant SET is_default=true, is_active=false WHERE id='taco-suave-base';" >/dev/null
zero="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 <<SQL
SELECT count(*) FROM ( $(printf '%s' "$DV_SQL" | sed "s/\\\$1/'taco-suave'/") ) q;
SQL
)"
[ "$zero" = "0" ] && pass "missing active default -> 0 rows (mapper returns null -> route 404)" || fail "expected 0 rows, got '$zero'"
# restore the default so criterion 1 can use a clean active default
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -c "UPDATE public.item_variant SET is_default=true, is_active=true WHERE id='taco-suave-base';" >/dev/null

echo "=== Criterion 1: a second ACTIVE DEFAULT for the same item is rejected ==="
out="$("$PSQL" -X "$URL" --set=VERBOSITY=verbose -c \
  "INSERT INTO public.item_variant (id,item_id,name,base_price_cents,is_default,is_active)
   VALUES ('taco-suave-second','taco-suave','Second',600,true,true);" 2>&1)"
code="$(sqlstate_of "$out")"
if [ "$code" = "23505" ] && printf '%s' "$out" | grep -q 'one_active_default_per_item'; then
  pass "second active default rejected (23505 on one_active_default_per_item)"
else
  fail "second active default: code='${code:-none}' out=$out"
fi

echo
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL D4 ISOLATED-DB CHECKS PASSED"; else echo "RESULT: FAILURES PRESENT"; fi
[ "$FAILED" -eq 0 ]
