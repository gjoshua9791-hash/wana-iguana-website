#!/usr/bin/env bash
#
# verify_f2_upgrade.sh — Feature 2 UPGRADE-PATH check against an ISOLATED,
# disposable local PostgreSQL database. Never Supabase, never a shared/retained
# test DB. Simulates an existing Feature-1 deployment (0001-0004 already applied)
# and then uses the REAL runner to apply the new 0005-0007 on top.
#
# Steps:
#   1. Create a uniquely named throwaway DB.
#   2. Apply 0001-0004 FIRST, operator-owned and atomic with the ledger, exactly
#      as the runner does (body + ledger INSERT in one --single-transaction).
#   3. Run the REAL runner (its fixed list is 0001-0007): it must SKIP 0001-0004
#      (already recorded) and APPLY only 0005-0007.
#   4. Confirm: ledger = 0001..0007; Taco Suave's original data preserved; its
#      options expanded to the intended five; all five tacos present; runtime
#      role menu_backend is READ-ONLY (SELECT ok, write denied).
#   5. Run the runner AGAIN -> it applies nothing.
#   6. Clean up ONLY this run's DB and (if we created it) the menu_backend role.
#
# TLS note: this exercises SQL/migrations against a local DB; it is NOT a live
# app/TLS test. The app's verified TLS is unchanged and not used here.
#
# Usage: server/migrations/verify_f2_upgrade.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1; PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
DB="wana_f2_upgrade_${RUN_ID}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://${HOST}:${PORT}/postgres"
URL="postgresql://${HOST}:${PORT}/${DB}"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0

echo "=== F2 upgrade-path verification — run ${RUN_ID} ==="
"$PSQL" --version

# Refuse if the cluster role from 0003 already exists (never touch unknown state).
MB_PRE=0; [ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_roles where rolname='menu_backend'")" = "1" ] && MB_PRE=1
[ "$MB_PRE" = "1" ] && { echo "FATAL: menu_backend already exists; refusing to touch it"; exit 2; }

[ "$("$PSQL" -X "$ADMIN" -At -c "select 1 from pg_database where datname='${DB}'")" = "1" ] && { echo "FATAL: $DB exists"; exit 2; }
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};" >/dev/null
adb="$("$PSQL" -X "$URL" -At -c "select current_database()")"
case "$adb" in wana_f2_upgrade_*) : ;; *) echo "FATAL: not throwaway db ($adb)"; exit 2;; esac

cleanup() {
  echo; echo "=== cleanup (only this run's resources) ==="
  local cf=0
  "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB};" 2>&1 | sed 's/^/  /' || cf=1
  "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS menu_backend;" 2>&1 | sed 's/^/  /' || cf=1
  [ "$cf" -ne 0 ] && { echo "ERROR: cleanup failed" >&2; exit 1; }
}
trap cleanup EXIT

# ---- Step 2: apply 0001-0004 FIRST (operator-owned, atomic with ledger) -------
echo "=== Step 2: apply 0001-0004 (simulating the existing Feature-1 deployment) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT current_user);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
SQL
for f in 0001_create_catalog.sql 0002_one_active_default.sql 0003_access_policies.sql 0004_seed_taco_suave.sql; do
  "$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$MIGDIR/$f" \
    -c "INSERT INTO public.schema_migrations (filename) VALUES ('$f');" >/dev/null \
    || { fail "applying $f failed"; exit 1; }
done
pre_ledger="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$pre_ledger" = "0001_create_catalog.sql,0002_one_active_default.sql,0003_access_policies.sql,0004_seed_taco_suave.sql" ] \
  && pass "0001-0004 applied; ledger has the four Feature-1 migrations" || fail "pre-ledger='$pre_ledger'"

# Capture Taco Suave's original (Feature-1) data to prove preservation across upgrade.
suave_before="$("$PSQL" -X "$URL" -At -c "select mi.name||'|'||iv.base_price_cents from public.menu_item mi join public.item_variant iv on iv.id='taco-suave-base' where mi.id='taco-suave'")"
opts_before="$("$PSQL" -X "$URL" -At -c "select string_agg(id,',' order by sort_order) from public.modifier_option where group_id='protein'")"
[ "$suave_before" = "Taco Suave|525" ] && pass "pre-upgrade Taco Suave = 'Taco Suave'/525" || fail "suave_before='$suave_before'"
[ "$opts_before" = "steak,chicken" ] && pass "pre-upgrade protein options = steak,chicken (Feature-1)" || fail "opts_before='$opts_before'"

# ---- Step 3: REAL runner applies ONLY 0005-0007 -------------------------------
echo "=== Step 3: run the real runner (must SKIP 0001-0004, APPLY 0005-0007) ==="
plan="$(DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"
echo "$plan" | sed 's/^/  runner: /'
skipped="$(printf '%s\n' "$plan" | grep -c 'SKIP (recorded):')"
applied_new="$(printf '%s\n' "$plan" | grep -E 'recorded 000[567]' | wc -l | tr -d ' ')"
[ "$skipped" = "4" ] && pass "runner skipped the 4 already-recorded migrations" || fail "skipped=$skipped (expected 4)"
[ "$applied_new" = "3" ] && pass "runner applied exactly 0005,0006,0007" || fail "applied_new=$applied_new (expected 3)"

# ---- Step 4: confirm ledger + preserved/expanded data + all five + read-only --
echo "=== Step 4: ledger, preserved data, expansion, five tacos, read-only ==="
ledger="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
exp_ledger="0001_create_catalog.sql,0002_one_active_default.sql,0003_access_policies.sql,0004_seed_taco_suave.sql,0005_menu_item_category.sql,0006_double_meat_columns.sql,0007_seed_original_tacos.sql"
[ "$ledger" = "$exp_ledger" ] && pass "ledger = 0001..0007" || fail "ledger='$ledger'"

suave_after="$("$PSQL" -X "$URL" -At -c "select mi.name||'|'||iv.base_price_cents||'|'||iv.is_default||'|'||iv.is_active from public.menu_item mi join public.item_variant iv on iv.id='taco-suave-base' where mi.id='taco-suave'")"
[ "$suave_after" = "Taco Suave|525|true|true" ] && pass "Taco Suave data preserved (name/525/default/active)" || fail "suave_after='$suave_after'"

opts_after="$("$PSQL" -X "$URL" -At -c "select string_agg(id,',' order by sort_order) from public.modifier_option where group_id='protein'")"
exp_opts="steak,chicken,shredded-beef,shredded-chicken,grilled-veggies"
[ "$opts_after" = "$exp_opts" ] && pass "Taco Suave options expanded to five (preserving steak/chicken first)" || fail "opts_after='$opts_after'"
dm_suave="$("$PSQL" -X "$URL" -At -c "select double_meat_price_delta_cents from public.variant_modifier_group where variant_id='taco-suave-base' and group_id='protein'")"
[ "$dm_suave" = "150" ] && pass "Taco Suave double-meat surcharge = 150 (added by 0007)" || fail "dm_suave='$dm_suave'"

five="$("$PSQL" -X "$URL" -At -c "select string_agg(id,',' order by sort_order,id) from public.menu_item where category='original-tacos' and is_active")"
[ "$five" = "taco-suave,taco-duro,taco-bravo,taco-del-mar,taco-supreme" ] && pass "all five Original Tacos present, in order" || fail "five='$five'"

# Read-only runtime checks: the privilege probes below use the menu_backend role
# directly (has_table_privilege and SET ROLE menu_backend), so no throwaway LOGIN
# user is created or dropped by this test.
sel_ok="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('menu_backend','public.menu_item','SELECT')")"
ins_no="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('menu_backend','public.menu_item','INSERT')")"
upd_no="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('menu_backend','public.menu_item','UPDATE')")"
del_no="$("$PSQL" -X "$URL" -At -c "select has_table_privilege('menu_backend','public.menu_item','DELETE')")"
[ "$sel_ok" = "t" ] && pass "menu_backend has SELECT on menu_item" || fail "SELECT priv='$sel_ok'"
[ "$ins_no $upd_no $del_no" = "f f f" ] && pass "menu_backend has NO insert/update/delete (read-only)" || fail "write privs ins/upd/del='$ins_no/$upd_no/$del_no'"
# Executed write attempt as the runtime role must be rejected.
wr="$("$PSQL" -X "$URL" -c "SET ROLE menu_backend; UPDATE public.menu_item SET name=name WHERE false;" 2>&1 || true)"
printf '%s' "$wr" | grep -q 'permission denied' && pass "executed write as menu_backend rejected (permission denied)" || fail "write not rejected: $wr"
# also check a new column is covered by the existing grant (SELECT works on it).
# SET ROLE prints a "SET" line; take the last output line as the scalar result.
newcol="$("$PSQL" -X "$URL" -At -c "SET ROLE menu_backend; SELECT count(*) FROM public.menu_item WHERE category='original-tacos';" 2>&1 | tail -1 || true)"
[ "$newcol" = "5" ] && pass "menu_backend can SELECT new 'category' column (grant covers new cols)" || fail "newcol read='$newcol'"

# ---- Step 5: runner again applies nothing -------------------------------------
echo "=== Step 5: run the runner AGAIN (must apply nothing) ==="
plan2="$(DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"
again_applied="$(printf '%s\n' "$plan2" | grep -cE 'APPLY:')"
again_recorded="$(printf '%s\n' "$plan2" | grep -cE 'recorded 00')"
[ "$again_applied" = "0" ] && pass "second run: nothing planned to APPLY" || fail "second run APPLY count=$again_applied"
[ "$again_recorded" = "0" ] && pass "second run: nothing newly recorded" || fail "second run recorded=$again_recorded"
ledger2="$("$PSQL" -X "$URL" -At -c "select count(*) from public.schema_migrations")"
[ "$ledger2" = "7" ] && pass "ledger still exactly 7 rows after re-run" || fail "ledger2 count='$ledger2'"

echo
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL F2 UPGRADE-PATH CHECKS PASSED"; else echo "RESULT: FAILURES PRESENT"; fi
[ "$FAILED" -eq 0 ]
