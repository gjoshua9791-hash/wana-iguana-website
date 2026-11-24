#!/usr/bin/env bash
#
# verify_f3_burritos.sh — Feature 3 (Burritos) migration verification against
# ISOLATED, disposable local PostgreSQL databases. Never Supabase, never a
# shared/retained test DB. Covers BOTH deployment paths for 0008/0009:
#
#   PATH A (fresh install): run the REAL runner on an empty DB. It must apply the
#     full 0001-0009 order and seed burritos.
#   PATH B (upgrade): simulate an existing Feature-2 deployment (0001-0007 already
#     applied+recorded), then run the REAL runner. It must SKIP 0001-0007 and
#     APPLY only 0008-0009.
#
# On BOTH paths it asserts the confirmed Burrito contract (requirements §Confirmed
# rules): seven items, base prices, the three protein shapes, per-option
# double_portion values (meats 299, seafood 349, veggies/none NULL; Classic
# +250/+299/+349 base-adds; extras/wet NULL), selection limits (Group A 1/1,
# others 0/1), and that the former "Wet Burrito Add On" is a modifier, NOT a
# menu_item. It ALSO confirms Original Tacos data is unchanged by 0008/0009.
#
# TLS note: this exercises SQL/migrations against a local DB; it is NOT a live
# app/TLS test. The app's verified TLS is unchanged and not used here.
#
# Usage: server/migrations/verify_f3_burritos.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1; PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
DB_FRESH="wana_f3_fresh_${RUN_ID}"
DB_UPG="wana_f3_upgrade_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://${HOST}:${PORT}/postgres"
URL_FRESH="postgresql://${HOST}:${PORT}/${DB_FRESH}"
URL_UPG="postgresql://${HOST}:${PORT}/${DB_UPG}"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0

echo "=== F3 Burritos verification — run ${RUN_ID} ==="
"$PSQL" --version

# Refuse if the cluster role from 0003 already exists (never touch unknown state).
MB_PRE=0; [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_roles where rolname='menu_backend'")" = "1" ] && MB_PRE=1
[ "$MB_PRE" = "1" ] && { echo "FATAL: menu_backend already exists; refusing to touch it"; exit 2; }

for d in "$DB_FRESH" "$DB_UPG"; do
  [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_database where datname='${d}'")" = "1" ] && { echo "FATAL: $d exists"; exit 2; }
done
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_FRESH};" >/dev/null
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_UPG};" >/dev/null
adb="$("$PSQL" -X "$URL_FRESH" -At -c "select current_database()")"
case "$adb" in wana_f3_fresh_*) : ;; *) echo "FATAL: not throwaway db ($adb)"; exit 2;; esac
adb="$("$PSQL" -X "$URL_UPG" -At -c "select current_database()")"
case "$adb" in wana_f3_upgrade_*) : ;; *) echo "FATAL: not throwaway db ($adb)"; exit 2;; esac

cleanup() {
  echo; echo "=== cleanup (only this run's resources) ==="
  local cf=0
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB_FRESH};" 2>&1 | sed 's/^/  /' || cf=1
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB_UPG};" 2>&1 | sed 's/^/  /' || cf=1
  "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS menu_backend;" 2>&1 | sed 's/^/  /' || cf=1
  [ "$cf" -ne 0 ] && { echo "ERROR: cleanup failed" >&2; exit 1; }
}
trap cleanup EXIT

# Scalar read helper.
q() { "$PSQL" -X "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }

# ---------------------------------------------------------------------------
# Shared assertion block: the confirmed Burrito contract on a migrated DB ($1).
# Called on BOTH the fresh and upgraded databases, so identical outcomes prove
# the two deployment paths converge on the same catalog.
# ---------------------------------------------------------------------------
assert_burrito_contract() {
  local U="$1" tag="$2"

  # 1. Seven burrito items, in display order.
  local items
  items="$(q "$U" "select string_agg(id,',' order by sort_order) from public.menu_item where category='burritos' and is_active")"
  [ "$items" = "fajita-burrito,super-burrito,burrito-grande,bravo-burrito,burrito-del-mar,grilled-fish-burrito,classic-burrito" ] \
    && pass "[$tag] seven burritos present, in order" || fail "[$tag] burrito items='$items'"

  # 2. Confirmed base prices (integer cents), keyed by default variant id.
  local prices
  prices="$(q "$U" "select string_agg(iv.item_id||'='||iv.base_price_cents,',' order by mi.sort_order)
    from public.item_variant iv join public.menu_item mi on mi.id=iv.item_id
    where mi.category='burritos' and iv.is_default and iv.is_active")"
  local exp_prices="fajita-burrito=1549,super-burrito=1349,burrito-grande=1349,bravo-burrito=1349,burrito-del-mar=1599,grilled-fish-burrito=1599,classic-burrito=929"
  [ "$prices" = "$exp_prices" ] && pass "[$tag] base prices confirmed (fajita 1549 … classic 929)" || fail "[$tag] prices='$prices'"

  # 3. Group A shared protein options + per-option double_portion.
  local ga
  ga="$(q "$U" "select string_agg(id||':'||price_delta_cents||':'||coalesce(double_portion_price_delta_cents::text,'NULL'),',' order by sort_order)
    from public.modifier_option where group_id='burrito-protein'")"
  local exp_ga="burrito-steak:0:299,burrito-chicken:0:299,burrito-shredded-beef:0:299,burrito-shredded-chicken:0:299,burrito-grilled-veggies:0:NULL"
  [ "$ga" = "$exp_ga" ] && pass "[$tag] Group A: 5 opts, delta 0, meats double 299, veggies NULL" || fail "[$tag] groupA='$ga'"

  # 4. Classic added-protein options (DISTINCT ids, differing base-add deltas).
  local cp
  cp="$(q "$U" "select string_agg(id||':'||price_delta_cents||':'||coalesce(double_portion_price_delta_cents::text,'NULL'),',' order by sort_order)
    from public.modifier_option where group_id='classic-protein'")"
  local exp_cp="classic-grilled-veggies:250:NULL,classic-steak:299:299,classic-chicken:299:299,classic-shredded-beef:299:299,classic-shredded-chicken:299:299,classic-grilled-fish:349:349,classic-grilled-shrimp:349:349"
  [ "$cp" = "$exp_cp" ] && pass "[$tag] Classic: veggies +250/NULL, meats +299/299, seafood +349/349" || fail "[$tag] classic='$cp'"

  # 5. Fixed-seafood extra-portion options: single +349, NOT itself doubleable.
  local ex
  ex="$(q "$U" "select string_agg(group_id||'/'||id||':'||price_delta_cents||':'||coalesce(double_portion_price_delta_cents::text,'NULL'),',' order by group_id)
    from public.modifier_option where group_id in ('delmar-extra','fish-extra')")"
  local exp_ex="delmar-extra/extra-shrimp:349:NULL,fish-extra/extra-fish:349:NULL"
  [ "$ex" = "$exp_ex" ] && pass "[$tag] seafood extras +349, double_portion NULL (no re-doubling)" || fail "[$tag] extras='$ex'"

  # 6. Wet upgrade: single +429 option, not doubleable.
  local wet
  wet="$(q "$U" "select id||':'||price_delta_cents||':'||coalesce(double_portion_price_delta_cents::text,'NULL')
    from public.modifier_option where group_id='wet-upgrade'")"
  [ "$wet" = "wet:429:NULL" ] && pass "[$tag] wet upgrade +429, double_portion NULL" || fail "[$tag] wet='$wet'"

  # 7. The former "Wet Burrito Add On" is a modifier, NOT a menu_item.
  local wet_item
  wet_item="$(q "$U" "select count(*) from public.menu_item where lower(name) like '%wet%' or id like '%wet%'")"
  [ "$wet_item" = "0" ] && pass "[$tag] no 'wet' menu_item (wet is a modifier, not an item)" || fail "[$tag] wet menu_item count=$wet_item"

  # 8. Selection limits: Group A protein 1/1; every other burrito group 0/1.
  local reqd
  reqd="$(q "$U" "select string_agg(distinct min_select||'/'||max_select,',')
    from public.variant_modifier_group vmg
    join public.item_variant iv on iv.id=vmg.variant_id
    join public.menu_item mi on mi.id=iv.item_id
    where mi.category='burritos' and vmg.group_id='burrito-protein'")"
  [ "$reqd" = "1/1" ] && pass "[$tag] Group A protein is required exactly-one (1/1)" || fail "[$tag] groupA limits='$reqd'"
  local opt_limits
  opt_limits="$(q "$U" "select string_agg(distinct min_select||'/'||max_select,',')
    from public.variant_modifier_group vmg
    join public.item_variant iv on iv.id=vmg.variant_id
    join public.menu_item mi on mi.id=iv.item_id
    where mi.category='burritos' and vmg.group_id in ('classic-protein','delmar-extra','fish-extra','wet-upgrade')")"
  [ "$opt_limits" = "0/1" ] && pass "[$tag] Classic/extras/wet groups are optional single-select (0/1)" || fail "[$tag] optional limits='$opt_limits'"

  # 9. Del Mar / Grilled Fish have NO required protein group (seafood in base).
  local delmar_groups fish_groups
  delmar_groups="$(q "$U" "select string_agg(group_id,',' order by sort_order) from public.variant_modifier_group where variant_id='burrito-del-mar-base'")"
  fish_groups="$(q "$U" "select string_agg(group_id,',' order by sort_order) from public.variant_modifier_group where variant_id='grilled-fish-burrito-base'")"
  [ "$delmar_groups" = "delmar-extra,wet-upgrade" ] && pass "[$tag] Del Mar groups = extra+wet (no required protein)" || fail "[$tag] delmar groups='$delmar_groups'"
  [ "$fish_groups" = "fish-extra,wet-upgrade" ] && pass "[$tag] Grilled Fish groups = extra+wet (no required protein)" || fail "[$tag] fish groups='$fish_groups'"

  # 10. All burrito variant<->group links set taco double-meat to NULL.
  local dm_nonnull
  dm_nonnull="$(q "$U" "select count(*) from public.variant_modifier_group vmg
    join public.item_variant iv on iv.id=vmg.variant_id
    join public.menu_item mi on mi.id=iv.item_id
    where mi.category='burritos' and vmg.double_meat_price_delta_cents is not null")"
  [ "$dm_nonnull" = "0" ] && pass "[$tag] burritos never use taco group-level double-meat (all NULL)" || fail "[$tag] non-null double_meat links=$dm_nonnull"

  # 11. Original Tacos unchanged by 0008/0009: five tacos, Taco Suave 525, double meat 150.
  local tacos suave dm_suave taco_opts
  tacos="$(q "$U" "select string_agg(id,',' order by sort_order,id) from public.menu_item where category='original-tacos' and is_active")"
  suave="$(q "$U" "select base_price_cents from public.item_variant where id='taco-suave-base' and is_default and is_active")"
  dm_suave="$(q "$U" "select double_meat_price_delta_cents from public.variant_modifier_group where variant_id='taco-suave-base' and group_id='protein'")"
  taco_opts="$(q "$U" "select string_agg(id,',' order by sort_order) from public.modifier_option where group_id='protein'")"
  [ "$tacos" = "taco-suave,taco-duro,taco-bravo,taco-del-mar,taco-supreme" ] && pass "[$tag] Original Tacos: five items unchanged" || fail "[$tag] tacos='$tacos'"
  [ "$suave" = "525" ] && pass "[$tag] Original Tacos: Taco Suave base 525 unchanged" || fail "[$tag] suave base='$suave'"
  [ "$dm_suave" = "150" ] && pass "[$tag] Original Tacos: double meat 150 unchanged" || fail "[$tag] taco double meat='$dm_suave'"
  [ "$taco_opts" = "steak,chicken,shredded-beef,shredded-chicken,grilled-veggies" ] && pass "[$tag] Original Tacos: five protein options unchanged" || fail "[$tag] taco opts='$taco_opts'"
  # Taco options' new column is NULL (burrito feature did not touch them).
  local taco_dp
  taco_dp="$(q "$U" "select count(*) from public.modifier_option where group_id='protein' and double_portion_price_delta_cents is not null")"
  [ "$taco_dp" = "0" ] && pass "[$tag] taco options have double_portion NULL (additive column, untouched)" || fail "[$tag] taco double_portion non-null=$taco_dp"
}

# ===========================================================================
# PATH A — FRESH install: real runner on an empty DB applies 0001-0009.
# ===========================================================================
echo "=== PATH A: fresh install (real runner, empty DB) ==="
planA="$(DB_URL="$URL_FRESH" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"
echo "$planA" | sed 's/^/  runner: /'
appliedA="$(printf '%s\n' "$planA" | grep -cE 'recorded 000[1-9]')"
[ "$appliedA" = "9" ] && pass "[fresh] runner applied all nine migrations" || fail "[fresh] applied=$appliedA (expected 9)"
ledgerA="$(q "$URL_FRESH" "select string_agg(filename,',' order by filename) from public.schema_migrations")"
exp_ledger="0001_create_catalog.sql,0002_one_active_default.sql,0003_access_policies.sql,0004_seed_taco_suave.sql,0005_menu_item_category.sql,0006_double_meat_columns.sql,0007_seed_original_tacos.sql,0008_double_portion_column.sql,0009_seed_burritos.sql"
[ "$ledgerA" = "$exp_ledger" ] && pass "[fresh] ledger = 0001..0009" || fail "[fresh] ledger='$ledgerA'"
# The 0008 column exists and is covered by menu_backend's SELECT grant.
colA="$(q "$URL_FRESH" "select 1 from information_schema.columns where table_name='modifier_option' and column_name='double_portion_price_delta_cents'")"
[ "$colA" = "1" ] && pass "[fresh] modifier_option.double_portion_price_delta_cents column present" || fail "[fresh] column missing"
assert_burrito_contract "$URL_FRESH" "fresh"

# ===========================================================================
# PATH B — UPGRADE: apply 0001-0007 first, then runner adds only 0008-0009.
# ===========================================================================
echo "=== PATH B: upgrade from a Feature-2 deployment (0001-0007 already applied) ==="
"$PSQL" -X "$URL_UPG" -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT current_user);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
SQL
for f in 0001_create_catalog.sql 0002_one_active_default.sql 0003_access_policies.sql \
         0004_seed_taco_suave.sql 0005_menu_item_category.sql 0006_double_meat_columns.sql \
         0007_seed_original_tacos.sql; do
  "$PSQL" -X "$URL_UPG" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$MIGDIR/$f" \
    -c "INSERT INTO public.schema_migrations (filename) VALUES ('$f');" >/dev/null \
    || { fail "[upgrade] applying $f failed"; exit 1; }
done
pre_ledger="$(q "$URL_UPG" "select count(*) from public.schema_migrations")"
# the 0008 column must NOT exist yet at the pre-upgrade point.
pre_col="$(q "$URL_UPG" "select count(*) from information_schema.columns where table_name='modifier_option' and column_name='double_portion_price_delta_cents'")"
# burritos must NOT exist yet either.
pre_burr="$(q "$URL_UPG" "select count(*) from public.menu_item where category='burritos'")"
[ "$pre_ledger" = "7" ] && pass "[upgrade] starting ledger has the seven Feature-2 migrations" || fail "[upgrade] pre_ledger=$pre_ledger"
[ "$pre_col" = "0" ] && pass "[upgrade] pre-upgrade: double_portion column absent" || fail "[upgrade] pre_col=$pre_col"
[ "$pre_burr" = "0" ] && pass "[upgrade] pre-upgrade: no burritos seeded" || fail "[upgrade] pre_burr=$pre_burr"

echo "=== PATH B: run the real runner (must SKIP 0001-0007, APPLY 0008-0009) ==="
planB="$(DB_URL="$URL_UPG" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"
echo "$planB" | sed 's/^/  runner: /'
skippedB="$(printf '%s\n' "$planB" | grep -c 'SKIP (recorded):')"
appliedB="$(printf '%s\n' "$planB" | grep -cE 'recorded 000[89]')"
[ "$skippedB" = "7" ] && pass "[upgrade] runner skipped the 7 already-recorded migrations" || fail "[upgrade] skipped=$skippedB (expected 7)"
[ "$appliedB" = "2" ] && pass "[upgrade] runner applied exactly 0008,0009" || fail "[upgrade] applied=$appliedB (expected 2)"
ledgerB="$(q "$URL_UPG" "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$ledgerB" = "$exp_ledger" ] && pass "[upgrade] ledger = 0001..0009" || fail "[upgrade] ledger='$ledgerB'"
assert_burrito_contract "$URL_UPG" "upgrade"

echo "=== PATH B: second runner run is idempotent (applies nothing) ==="
plan2="$(DB_URL="$URL_UPG" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"
again_applied="$(printf '%s\n' "$plan2" | grep -cE 'APPLY:')"
[ "$again_applied" = "0" ] && pass "[upgrade] second run: nothing to APPLY" || fail "[upgrade] second run APPLY=$again_applied"

echo
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL F3 BURRITO CHECKS PASSED"; else echo "RESULT: FAILURES PRESENT"; fi
[ "$FAILED" -eq 0 ]
