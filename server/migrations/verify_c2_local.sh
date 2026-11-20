#!/usr/bin/env bash
#
# verify_c2_local.sh — focused LOCAL verification of the C2 local deliverables:
# 0003_access_policies.sql and the run_migrations.sh runner.
#
# Uses uniquely named DISPOSABLE local databases. It:
#   * refuses to run if menu_backend already exists (won't touch unknown state);
#   * tracks only the resources it creates and cleans up exactly those, even on
#     failure; a cleanup failure is made visible and fails the exit status;
#   * verifies the runner (full order, idempotent SKIP, exit 0);
#   * verifies --dry-run is read-only on BOTH a fresh and a migrated DB;
#   * verifies prerequisite-failure handling (unknown arg, missing file);
#   * verifies the runtime role (SET ROLE confirmed first): READ on all five
#     tables, writes denied with expected SQLSTATE + object-specific error, and
#     no ledger access incl. TRUNCATE;
#   * exercises the anon/authenticated REVOKE branches with isolated fixture
#     roles carrying representative pre-existing grants (incl. ledger TRUNCATE);
#   * checks PUBLIC access via an ordinary unprivileged role.
#
# PG VERSION: local PostgreSQL 18; Supabase runs 17. SQL used behaves identically
# on 17 and 18. This does NOT verify the shared Supabase database.
#
# Usage: server/migrations/verify_c2_local.sh

set -u -o pipefail

PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
HOST=127.0.0.1; PORT=5432
RUN_ID="$$_$(date +%Y%m%d%H%M%S)"
DB="wana_c2_verify_${RUN_ID}"          # primary migrated DB
DB_DRY="wana_c2_dry_${RUN_ID}"         # fresh DB for dry-run-on-empty
LOGIN_USER="wana_menu_login_${RUN_ID}"
PUBUSER="wana_pub_probe_${RUN_ID}"     # ordinary unprivileged role (PUBLIC test)
MIGDIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="postgresql://${HOST}:${PORT}/postgres"
URL="postgresql://${HOST}:${PORT}/${DB}"
URL_DRY="postgresql://${HOST}:${PORT}/${DB_DRY}"

fail() { echo "FAIL: $*" >&2; FAILED=1; }
pass() { echo "PASS: $*"; }
FAILED=0
sqlstate_of() { printf '%s\n' "$1" | sed -n 's/^ERROR:  \([0-9A-Z]\{5\}\):.*/\1/p' | head -1; }

# --- resource tracking: only drop what we actually created -------------------
CREATED_DBS=()
CREATED_ROLES=()
MENU_BACKEND_CREATED=0            # did menu_backend come into existence via us?
FIX_ANON_CREATED=0               # did we create a fixture 'anon'?
FIX_AUTHED_CREATED=0            # did we create a fixture 'authenticated'?

q_admin() { "$PSQL" -X "$ADMIN" -At -v ON_ERROR_STOP=1 -c "$1"; }
role_exists() { [ "$(q_admin "select 1 from pg_roles where rolname='$1'")" = "1" ]; }
db_exists() { [ "$(q_admin "select 1 from pg_database where datname='$1'")" = "1" ]; }

cleanup() {
  echo; echo "=== cleanup (only resources created by this run) ==="
  local cl_fail=0
  # Drop login/pub roles and fixture anon/authenticated and menu_backend ONLY if
  # this run created them. Databases must be dropped before roles they depend on.
  for d in "${CREATED_DBS[@]:-}"; do
    [ -z "$d" ] && continue
    "$PSQL" -X "$ADMIN" -c "DROP DATABASE IF EXISTS $d;" 2>&1 | sed 's/^/  /' || cl_fail=1
  done
  for r in "${CREATED_ROLES[@]:-}"; do
    [ -z "$r" ] && continue
    "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS $r;" 2>&1 | sed 's/^/  /' || cl_fail=1
  done
  [ "$MENU_BACKEND_CREATED" = "1" ] && { "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS menu_backend;" 2>&1 | sed 's/^/  /' || cl_fail=1; }
  [ "$FIX_ANON_CREATED" = "1" ]   && { "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS anon;" 2>&1 | sed 's/^/  /' || cl_fail=1; }
  [ "$FIX_AUTHED_CREATED" = "1" ] && { "$PSQL" -X "$ADMIN" -c "DROP ROLE IF EXISTS authenticated;" 2>&1 | sed 's/^/  /' || cl_fail=1; }
  if [ "$cl_fail" -ne 0 ]; then
    echo "ERROR: cleanup encountered failures (see above)." >&2
    # ensure a failing status even if the body passed
    exit 1
  fi
}
trap cleanup EXIT

echo "=== wana C2 LOCAL verification — run ${RUN_ID} ==="
"$PSQL" --version

# --- 3a. Refuse to run if menu_backend already exists (unknown state) --------
if role_exists menu_backend; then
  echo "FATAL: role 'menu_backend' already exists on this cluster. This verification" >&2
  echo "       creates and drops it; refusing to touch pre-existing state. Remove or" >&2
  echo "       rename it, or run on a cluster without it." >&2
  exit 2
fi
# Note pre-existing anon/authenticated so we PRESERVE them (do not drop).
PRE_ANON=0; role_exists anon && PRE_ANON=1
PRE_AUTHED=0; role_exists authenticated && PRE_AUTHED=1
echo "pre-existing fixture roles: anon=$PRE_ANON authenticated=$PRE_AUTHED (will be preserved if present)"
echo

# --- create disposable DBs (tracked) -----------------------------------------
for d in "$DB" "$DB_DRY"; do
  db_exists "$d" && { echo "FATAL: $d already exists"; exit 2; }
done
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};" >/dev/null && CREATED_DBS+=("$DB")
"$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_DRY};" >/dev/null && CREATED_DBS+=("$DB_DRY")
adb="$("$PSQL" -X "$URL" -At -c "select current_database()")"
case "$adb" in wana_c2_verify_*) : ;; *) echo "FATAL: not a throwaway db ($adb)"; exit 2;; esac

echo "=== prerequisite-failure handling (no DB changes expected) ==="
# unknown argument rejected (exit 2), nothing applied
out="$(DB_URL="$URL_DRY" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" --bogus 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s' "$out" | grep -q "unknown argument"; then pass "unknown arg rejected (exit 2)"; else fail "unknown arg: rc=$rc out=$out"; fi
# missing DB_URL rejected
out="$(env -u DB_URL PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"; rc=$?
[ "$rc" -eq 2 ] && pass "missing DB_URL rejected (exit 2)" || fail "missing DB_URL: rc=$rc"
# missing migration file detected before DB work (simulate via temp dir copy)
TMPMIG="$(mktemp -d)"; cp "$MIGDIR"/run_migrations.sh "$TMPMIG"/; cp "$MIGDIR"/0001_create_catalog.sql "$TMPMIG"/ 2>/dev/null || true
out="$(DB_URL="$URL_DRY" PSQL="$PSQL" "$TMPMIG/run_migrations.sh" --dry-run 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s' "$out" | grep -q "missing migration file"; then pass "missing migration file detected before DB changes"; else fail "missing-file: rc=$rc out=$out"; fi
rm -rf "$TMPMIG"
echo

echo "=== dry-run on a FRESH db creates nothing (read-only) ==="
out="$(DB_URL="$URL_DRY" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" --dry-run 2>&1)"; rc=$?
ledger_present="$("$PSQL" -X "$URL_DRY" -At -c "select to_regclass('public.schema_migrations') is not null")"
applies="$(printf '%s' "$out" | grep -c 'APPLY:')"
if [ "$rc" -eq 0 ] && [ "$ledger_present" = "f" ] && [ "$applies" = "4" ]; then
  pass "dry-run fresh: exit 0, no ledger created, all 4 shown pending"
else
  fail "dry-run fresh: rc=$rc ledger_present=$ledger_present applies=$applies"
fi
echo

echo "=== run the documented runner (full order) on the primary DB ==="
runlog="$(DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"; rc=$?
printf '%s\n' "$runlog" | sed 's/^/  /'
[ "$rc" -eq 0 ] && pass "runner exit 0" || { fail "runner exit $rc"; }
# menu_backend was created by 0003 during this run -> track for cleanup
if role_exists menu_backend; then MENU_BACKEND_CREATED=1; fi
ledger="$("$PSQL" -X "$URL" -At -c "select string_agg(filename,',' order by filename) from public.schema_migrations")"
[ "$ledger" = "0001_create_catalog.sql,0002_one_active_default.sql,0003_access_policies.sql,0004_seed_taco_suave.sql" ] \
  && pass "ledger lists all four in order" || fail "ledger unexpected: $ledger"
echo

echo "=== dry-run on the MIGRATED db changes nothing, shows 4 SKIP ==="
before="$("$PSQL" -X "$URL" -At -c "select md5(string_agg(filename,',' order by filename)) from public.schema_migrations")"
out="$(DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" --dry-run 2>&1)"; rc=$?
after="$("$PSQL" -X "$URL" -At -c "select md5(string_agg(filename,',' order by filename)) from public.schema_migrations")"
skips="$(printf '%s' "$out" | grep -c 'SKIP (recorded)')"
if [ "$rc" -eq 0 ] && [ "$before" = "$after" ] && [ "$skips" = "4" ]; then
  pass "dry-run migrated: exit 0, ledger unchanged, 4 SKIP"
else
  fail "dry-run migrated: rc=$rc skips=$skips changed=$([ "$before" = "$after" ] && echo no || echo yes)"
fi
echo

echo "=== second REAL run is idempotent: exit 0 AND four SKIP results ==="
out2="$(DB_URL="$URL" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"; rc2=$?
skips2="$(printf '%s' "$out2" | grep -c 'SKIP (recorded)')"
applies2="$(printf '%s' "$out2" | grep -c 'APPLY:')"
if [ "$rc2" -eq 0 ] && [ "$skips2" = "4" ] && [ "$applies2" = "0" ]; then
  pass "second run: exit 0, 4 SKIP, 0 APPLY"
else
  fail "second run: rc=$rc2 skips=$skips2 applies=$applies2"
fi
echo
echo "=== set up a LOGIN user with the menu_backend runtime role ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -v u="$LOGIN_USER" >/dev/null <<SQL
CREATE ROLE :"u" LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT menu_backend TO :"u";
SQL
role_exists "$LOGIN_USER" && CREATED_ROLES+=("$LOGIN_USER")
attrs="$("$PSQL" -X "$URL" -At -c "select rolsuper||'/'||rolbypassrls from pg_roles where rolname='${LOGIN_USER}'")"
[ "$attrs" = "false/false" ] && pass "login user is NOSUPERUSER/NOBYPASSRLS" || fail "login user attrs=$attrs"

# Run as the login user; FIRST confirm SET ROLE succeeded (current_user changed),
# then run the target statement. Returns combined stderr+stdout.
run_as() {
  "$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -v u="$LOGIN_USER" 2>&1 <<SQL
SET ROLE :"u";
$1
SQL
}
# Confirm SET ROLE works at all before asserting anything about access.
whoami="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 -v u="$LOGIN_USER" 2>/dev/null <<SQL | tail -1
SET ROLE :"u";
SELECT current_user;
SQL
)"
[ "$whoami" = "$LOGIN_USER" ] && pass "SET ROLE to runtime user succeeds (current_user=$whoami)" \
  || { fail "SET ROLE did not take effect (got '$whoami')"; }

echo "=== runtime READ works across ALL FIVE catalog tables ==="
# bash 3.2 (macOS) has no associative arrays; use a portable "table:expected" list.
for pair in menu_item:1 item_variant:1 modifier_group:1 modifier_option:2 variant_modifier_group:1; do
  t="${pair%%:*}"; want="${pair##*:}"
  v="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 -v u="$LOGIN_USER" 2>/dev/null <<SQL | tail -1
SET ROLE :"u";
SELECT count(*) FROM public.$t;
SQL
)"
  [ "$v" = "$want" ] && pass "runtime SELECT public.$t -> $v row(s)" || fail "runtime SELECT public.$t got '$v' (want $want)"
done
price="$("$PSQL" -X "$URL" -At -v ON_ERROR_STOP=1 -v u="$LOGIN_USER" 2>/dev/null <<SQL | tail -1
SET ROLE :"u";
SELECT base_price_cents FROM public.item_variant WHERE is_default AND is_active;
SQL
)"
[ "$price" = "525" ] && pass "runtime default-variant price=525" || fail "runtime price='$price'"

echo "=== runtime WRITES denied with expected SQLSTATE + object-specific error ==="
for w in \
  "INSERT:INSERT INTO public.menu_item (id,name) VALUES ('x','X'):menu_item" \
  "UPDATE:UPDATE public.item_variant SET name='h' WHERE id='taco-suave-base':item_variant" \
  "DELETE:DELETE FROM public.modifier_option WHERE id='steak':modifier_option" ; do
  nm="${w%%:*}"; rest="${w#*:}"; sql="${rest%:*}"; obj="${rest##*:}"
  out="$(run_as "$sql")"; code="$(sqlstate_of "$out")"
  if [ "$code" = "42501" ] && printf '%s' "$out" | grep -Eq "for (table|relation) \"?$obj\"?"; then
    pass "runtime $nm on $obj -> 42501 permission denied for table $obj"
  else
    fail "runtime $nm on $obj: code='${code:-none}' out=$out"
  fi
done

echo "=== runtime canNOT read/insert/TRUNCATE the ledger ==="
out="$(run_as "SELECT count(*) FROM public.schema_migrations;")"
{ [ "$(sqlstate_of "$out")" = "42501" ] && printf '%s' "$out" | grep -q 'schema_migrations'; } && pass "runtime SELECT ledger denied (42501)" || fail "runtime ledger SELECT: $out"
out="$(run_as "INSERT INTO public.schema_migrations (filename) VALUES ('evil.sql');")"
[ "$(sqlstate_of "$out")" = "42501" ] && pass "runtime INSERT ledger denied (42501)" || fail "runtime ledger INSERT: $out"
out="$(run_as "TRUNCATE public.schema_migrations;")"
# TRUNCATE is a table privilege (RLS does not cover it); must be privilege-denied.
{ [ "$(sqlstate_of "$out")" = "42501" ] && printf '%s' "$out" | grep -q 'schema_migrations'; } && pass "runtime TRUNCATE ledger denied (42501)" || fail "runtime ledger TRUNCATE: $out"

echo "=== PUBLIC access via an ordinary unprivileged role (no grants) ==="
"$PSQL" -X "$URL" -v ON_ERROR_STOP=1 -v p="$PUBUSER" >/dev/null <<SQL
CREATE ROLE :"p" LOGIN NOSUPERUSER NOBYPASSRLS;
SQL
role_exists "$PUBUSER" && CREATED_ROLES+=("$PUBUSER")
pub_run() { "$PSQL" -X "$URL" -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -v p="$PUBUSER" 2>&1 <<SQL
SET ROLE :"p";
$1
SQL
}
out="$(pub_run "SELECT count(*) FROM public.menu_item;")"
[ "$(sqlstate_of "$out")" = "42501" ] && pass "PUBLIC/unprivileged SELECT catalog denied (42501)" || fail "PUBLIC SELECT: $out"
out="$(pub_run "INSERT INTO public.menu_item (id,name) VALUES ('p','P');")"
[ "$(sqlstate_of "$out")" = "42501" ] && pass "PUBLIC/unprivileged INSERT catalog denied (42501)" || fail "PUBLIC INSERT: $out"
echo
echo "=== exercise anon/authenticated REVOKE branches (isolated fixtures) ==="
# Create fixture 'anon'/'authenticated' ONLY if absent; preserve pre-existing.
if [ "$PRE_ANON" -eq 0 ]; then "$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE ROLE anon NOLOGIN;" >/dev/null && FIX_ANON_CREATED=1; fi
if [ "$PRE_AUTHED" -eq 0 ]; then "$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE ROLE authenticated NOLOGIN;" >/dev/null && FIX_AUTHED_CREATED=1; fi

if { [ "$PRE_ANON" -eq 1 ] || [ "$FIX_ANON_CREATED" -eq 1 ]; } && { [ "$PRE_AUTHED" -eq 1 ] || [ "$FIX_AUTHED_CREATED" -eq 1 ]; }; then
  # Use a dedicated disposable DB so we can pre-grant BEFORE the runner locks down.
  DB_REV="wana_c2_rev_${RUN_ID}"
  URL_REV="postgresql://${HOST}:${PORT}/${DB_REV}"
  db_exists "$DB_REV" || { "$PSQL" -X "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_REV};" >/dev/null && CREATED_DBS+=("$DB_REV"); }

  # Apply only structure first (0001/0002) + ledger init via the runner is all-or
  # -nothing; instead apply 0001/0002 manually, then pre-grant, then 0003/0004.
  "$PSQL" -X "$URL_REV" -v ON_ERROR_STOP=1 --single-transaction -f "$MIGDIR/0001_create_catalog.sql" >/dev/null
  "$PSQL" -X "$URL_REV" -v ON_ERROR_STOP=1 --single-transaction -f "$MIGDIR/0002_one_active_default.sql" >/dev/null
  # Ledger init (as the runner does), then give anon/authenticated REPRESENTATIVE
  # pre-existing grants on catalog + ledger (incl. TRUNCATE) to be revoked.
  "$PSQL" -X "$URL_REV" -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<SQL
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT current_user);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
-- record the structure migrations we applied manually so the runner resumes at 0003
INSERT INTO public.schema_migrations (filename) VALUES
  ('0001_create_catalog.sql'), ('0002_one_active_default.sql');
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.schema_migrations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.menu_item TO anon, authenticated;
SQL
  # Sanity: the pre-grants exist
  preg="$("$PSQL" -X "$URL_REV" -At -c "select has_table_privilege('anon','public.menu_item','INSERT')::text||'/'||has_table_privilege('authenticated','public.schema_migrations','TRUNCATE')::text")"
  [ "$preg" = "true/true" ] && pass "fixtures: anon/authenticated started WITH catalog+ledger grants" || fail "pre-grant setup: $preg"

  # Now run ledger-init-revoke (runner) + 0003 catalog revoke by applying via the
  # runner from the current recorded point. The runner re-runs ledger init (which
  # revokes ledger from anon/authenticated) then applies 0003 (catalog revoke).
  revlog="$(DB_URL="$URL_REV" PSQL="$PSQL" "$MIGDIR/run_migrations.sh" 2>&1)"; rcrev=$?
  if role_exists menu_backend; then MENU_BACKEND_CREATED=1; fi
  [ "$rcrev" -eq 0 ] && pass "runner applied over pre-granted fixtures (exit 0)" || fail "rev runner exit $rcrev: $revlog"

  # Assert the revocations stripped anon/authenticated on catalog AND ledger.
  for r in anon authenticated; do
    cat_ins="$("$PSQL" -X "$URL_REV" -At -c "select has_table_privilege('$r','public.menu_item','INSERT')::text")"
    led_all="$("$PSQL" -X "$URL_REV" -At -c "select has_table_privilege('$r','public.schema_migrations','SELECT')::text||has_table_privilege('$r','public.schema_migrations','INSERT')::text||has_table_privilege('$r','public.schema_migrations','TRUNCATE')::text")"
    [ "$cat_ins" = "false" ] && pass "$r lost catalog INSERT (0003 revoke)" || fail "$r still has catalog INSERT"
    [ "$led_all" = "falsefalsefalse" ] && pass "$r lost ALL ledger privs incl TRUNCATE (init revoke)" || fail "$r ledger privs remain: $led_all"
  done
else
  echo "SKIP: could not ensure anon/authenticated fixtures; branch not exercised."
fi
echo

echo "============================================================"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: ALL C2 LOCAL CHECKS PASSED"; else echo "RESULT: FAILURES PRESENT"; fi
# Final status is the AND of body result and cleanup (trap). Exit non-zero on body fail.
[ "$FAILED" -eq 0 ]
