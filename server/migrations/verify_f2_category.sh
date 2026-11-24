#!/usr/bin/env bash
#
# verify_f2_category.sh — Feature 2 (Original Tacos category) checks against an
# ISOLATED, disposable local PostgreSQL database. Never Supabase, never a shared
# or retained test DB; it creates its own throwaway database and drops it on exit.
#
# Covers (query-level, the same SQL the app runs):
#   * ORDERING      — category items come back ordered by (sort_order, id).
#   * AVAILABILITY  — an item with no active default variant is OMITTED from the
#                     category listing (authoritative), while the rest remain.
#   * GROUPING      — Duro uses protein-duro (2 opts), Del Mar protein-seafood
#                     (2 opts), Suave/Bravo/Supreme share 'protein' (5 opts).
#   * PRICES/OPTIONS— confirmed base prices (525/525/525/850/675) and $0 deltas.
#   * DOUBLE MEAT   — per-item surcharge on the link (Suave/Bravo 150, Supreme
#                     299, Duro/Del Mar NULL) and per-option double_meat_available
#                     (meats TRUE, veggies/seafood FALSE).
#
# TLS note (same as D4): the running Express app enforces verified TLS, which a
# bare local Postgres does not provide, so we do NOT point the live app at the
# local DB. We exercise the REAL default-variant SQL and the category item-id SQL
# (identical to queries.ts) against the isolated DB. End-to-end HTTP over TLS is a
# separate check against a cert-presenting DB (design §7); it is NOT done here.
#
# Usage: server/migrations/verify_f2_category.sh
#   (requires a local psql; set PSQL to its path if not on PATH)

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1; PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
DB="wana_f2_verify_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://${HOST}:${PORT}/postgres"
URL="postgresql://${HOST}:${PORT}/${DB}"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0

echo "=== F2 isolated-DB verification — run ${RUN_ID} ==="
command -v "$PSQL" >/dev/null 2>&1 || "$PSQL" --version >/dev/null 2>&1 || {
  echo "FATAL: psql not found at '$PSQL'. Set PSQL to a local psql path. (No local"
  echo "       Postgres is available in this environment; this harness is provided"
  echo "       to run where one is.)"; exit 2; }
"$PSQL" --version

# Refuse to run if menu_backend (a cluster role from 0003) already exists, so we
# never mutate unknown shared state.
MB_PRE=0; [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_roles where rolname='menu_backend'")" = "1" ] && MB_PRE=1
[ "$MB_PRE" = "1" ] && { echo "FATAL: menu_backend already exists; refusing to touch it"; exit 2; }

[ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_database where datname='${DB}'")" = "1" ] && { echo "FATAL: $DB exists"; exit 2; }
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};" >/dev/null
adb="$("$PSQL" -X "$URL" -At -c "select current_database()")"
case "$adb" in wana_f2_verify_*) : ;; *) echo "FATAL: not throwaway db ($adb)"; exit 2;; esac

cleanup() {
  echo; echo "=== cleanup (only this run's resources) ==="
  local cf=0
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB};" 2>&1 | sed 's/^/  /' || cf=1
  "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS menu_backend;" 2>&1 | sed 's/^/  /' || cf=1
  [ "$cf" -ne 0 ] && { echo "ERROR: cleanup failed" >&2; exit 1; }
}
trap cleanup EXIT

echo "=== provision schema+seed via the runner (0001-0007) ==="
DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" >/dev/null 2>&1 \
  && pass "migrations 0001-0007 applied to isolated DB" || { fail "runner failed"; exit 1; }

# Category item-id SQL (identical to queries.ts CATEGORY_ITEM_IDS_SQL).
cat_ids() { "$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT string_agg(id, ',' ORDER BY sort_order, id)
      FROM public.menu_item WHERE category='original-tacos' AND is_active;"; }

echo "=== ORDERING: all five in (sort_order, id) order ==="
got="$(cat_ids)"
exp="taco-suave,taco-duro,taco-bravo,taco-del-mar,taco-supreme"
[ "$got" = "$exp" ] && pass "order: $got" || fail "order got='$got' exp='$exp'"

echo "=== PRICES: confirmed base prices on each default variant ==="
prices="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT string_agg(iv.item_id||':'||iv.base_price_cents, ',' ORDER BY mi.sort_order)
      FROM public.item_variant iv JOIN public.menu_item mi ON mi.id=iv.item_id
      WHERE mi.category='original-tacos' AND iv.is_default AND iv.is_active;")"
exp_p="taco-suave:525,taco-duro:525,taco-bravo:525,taco-del-mar:675,taco-supreme:850"
[ "$prices" = "$exp_p" ] && pass "prices: $prices" || fail "prices got='$prices' exp='$exp_p'"

echo "=== GROUPING + OPTIONS: each item's protein group and option ids ==="
for spec in \
  "taco-suave|protein|chicken,grilled-veggies,shredded-beef,shredded-chicken,steak" \
  "taco-duro|protein-duro|duro-shredded-beef,duro-shredded-chicken" \
  "taco-bravo|protein|chicken,grilled-veggies,shredded-beef,shredded-chicken,steak" \
  "taco-del-mar|protein-seafood|grilled-fish,grilled-shrimp" \
  "taco-supreme|protein|chicken,grilled-veggies,shredded-beef,shredded-chicken,steak"; do
  item="${spec%%|*}"; rest="${spec#*|}"; grp="${rest%%|*}"; expopts="${rest#*|}"
  row="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
    -c "SELECT vmg.group_id||'|'||vmg.min_select||'|'||vmg.max_select
        FROM public.variant_modifier_group vmg
        WHERE vmg.variant_id='${item}-base';")"
  gotopts="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
    -c "SELECT string_agg(mo.id, ',' ORDER BY mo.id)
        FROM public.variant_modifier_group vmg
        JOIN public.modifier_option mo ON mo.group_id=vmg.group_id
        WHERE vmg.variant_id='${item}-base';")"
  [ "$row" = "${grp}|1|1" ] && pass "$item group=${grp} min/max 1/1" || fail "$item link='$row' exp='${grp}|1|1'"
  [ "$gotopts" = "$expopts" ] && pass "$item options=$gotopts" || fail "$item opts got='$gotopts' exp='$expopts'"
done

echo "=== PRICE DELTAS: every protein option is \$0 ==="
nonzero="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM public.modifier_option
      WHERE group_id IN ('protein','protein-duro','protein-seafood') AND price_delta_cents<>0;")"
[ "$nonzero" = "0" ] && pass "all protein options priceDeltaCents=0" || fail "$nonzero options with non-zero delta"

echo "=== DOUBLE MEAT: per-item surcharge on the link (NULL where not offered) ==="
dm="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT string_agg(variant_id||':'||COALESCE(double_meat_price_delta_cents::text,'NULL'), ',' ORDER BY variant_id)
      FROM public.variant_modifier_group
      WHERE variant_id LIKE 'taco-%-base';")"
exp_dm="taco-bravo-base:150,taco-del-mar-base:NULL,taco-duro-base:NULL,taco-suave-base:150,taco-supreme-base:299"
[ "$dm" = "$exp_dm" ] && pass "double-meat link deltas: $dm" || fail "double-meat got='$dm' exp='$exp_dm'"

echo "=== DOUBLE MEAT: per-option availability (meats TRUE; veggies/seafood FALSE) ==="
true_opts="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT string_agg(id, ',' ORDER BY id) FROM public.modifier_option WHERE double_meat_available;")"
false_opts="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 \
  -c "SELECT string_agg(id, ',' ORDER BY id) FROM public.modifier_option WHERE NOT double_meat_available;")"
exp_true="chicken,shredded-beef,shredded-chicken,steak"
exp_false="duro-shredded-beef,duro-shredded-chicken,grilled-fish,grilled-shrimp,grilled-veggies"
[ "$true_opts" = "$exp_true" ]  && pass "doubleable meats: $true_opts"      || fail "doubleable got='$true_opts' exp='$exp_true'"
[ "$false_opts" = "$exp_false" ] && pass "not doubleable: $false_opts"       || fail "not-doubleable got='$false_opts' exp='$exp_false'"

echo "=== AVAILABILITY: a default-variant-less item is OMITTED from the LIST the route builds ==="
# The route builds the list as: queryCategoryItemIds() -> per-id queryDefaultVariant()
# -> mapRowsToItem() -> drop nulls. The id query filters on menu_item.is_active only;
# authoritative availability (active DEFAULT variant) is enforced by the per-item
# default-variant resolution. So we assert at that layer: with taco-bravo's default
# variant deactivated, the default-variant query for taco-bravo returns ZERO rows
# (mapper -> null -> omitted), while the other four still return their row(s).
dv_count() { "$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 -c "
  WITH default_variant AS (
    SELECT iv.id, iv.item_id, iv.base_price_cents
    FROM public.item_variant iv
    JOIN public.menu_item mi ON mi.id = iv.item_id AND mi.is_active
    WHERE iv.item_id = '$1' AND iv.is_default AND iv.is_active
    LIMIT 1)
  SELECT count(*) FROM default_variant dv
  JOIN public.menu_item mi ON mi.id = dv.item_id;"; }

"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -c "UPDATE public.item_variant SET is_active=false WHERE id='taco-bravo-base';" >/dev/null
bravo="$(dv_count taco-bravo)"; suave="$(dv_count taco-suave)"
[ "$bravo" = "0" ] && pass "taco-bravo default-variant query -> 0 rows (route omits it)" || fail "taco-bravo dv rows='$bravo' (expected 0)"
[ "$suave" != "0" ] && pass "taco-suave still resolves ($suave row(s)) -> remains in list" || fail "taco-suave unexpectedly 0 rows"
# Build the route-equivalent available set across the category and confirm omission.
avail=""
for id in $("$PSQL" -X "$URL" -At -c "SELECT id FROM public.menu_item WHERE category='original-tacos' AND is_active ORDER BY sort_order, id"); do
  [ "$(dv_count "$id")" != "0" ] && avail="${avail:+$avail,}$id"
done
printf '%s' "$avail" | grep -q 'taco-bravo' && fail "route-equivalent list still has taco-bravo: $avail" \
  || pass "route-equivalent available list omits taco-bravo: $avail"
# restore
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -c "UPDATE public.item_variant SET is_active=true WHERE id='taco-bravo-base';" >/dev/null

echo
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL F2 ISOLATED-DB CHECKS PASSED"; else echo "RESULT: FAILURES PRESENT"; fi
[ "$FAILED" -eq 0 ]
