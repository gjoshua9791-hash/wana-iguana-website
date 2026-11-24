#!/usr/bin/env bash
#
# run_migrations.sh — the documented migration runner for the Wana Iguana catalog.
#
# Applies the migrations in the fixed order
#   0001_create_catalog.sql -> 0002_one_active_default.sql
#   -> 0003_access_policies.sql -> 0004_seed_taco_suave.sql
#   -> 0005_menu_item_category.sql -> 0006_double_meat_columns.sql
#   -> 0007_seed_original_tacos.sql
# Each migration body AND its ledger INSERT are applied in ONE psql transaction
# (psql -X --single-transaction -v ON_ERROR_STOP=1), so schema + ledger commit
# atomically. Migrations already recorded in public.schema_migrations are SKIPPED.
# Any error STOPS the run.
#
# --dry-run is strictly READ-ONLY: it creates nothing and alters no permissions
# or RLS. It inspects the ledger with a read-only query and prints the plan.
#
# This is the MIGRATION-OPERATOR tool. Connect as the operator/owner role (on
# Supabase: `postgres`), NOT the Express runtime role. The target connection is
# passed via the DB_URL environment variable (a full libpq/psql connection
# string or URL). This script never reads, requests, or prints a password; it
# hands DB_URL to psql, which handles auth (e.g. ~/.pgpass, PGPASSWORD, or the
# URL you supply). Nothing is echoed back.
#
# Usage:
#   DB_URL="postgresql://.../postgres" server/migrations/run_migrations.sh
#   DB_URL="..." server/migrations/run_migrations.sh --dry-run   # read-only plan

set -u -o pipefail

PSQL="${PSQL:-psql}"
MIGDIR="$(cd "$(dirname "$0")" && pwd)"

# Fixed, ordered migration list (the deployment order).
MIGRATIONS=(
  0001_create_catalog.sql
  0002_one_active_default.sql
  0003_access_policies.sql
  0004_seed_taco_suave.sql
  0005_menu_item_category.sql
  0006_double_meat_columns.sql
  0007_seed_original_tacos.sql
)

# --- 1a. Parse/validate arguments BEFORE any database interaction -----------
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "FATAL: unknown argument '$arg' (only --dry-run is supported)." >&2; exit 2 ;;
  esac
done

if [ -z "${DB_URL:-}" ]; then
  echo "FATAL: set DB_URL to the operator connection (e.g. postgresql://.../postgres)." >&2
  exit 2
fi

# --- 1b. Verify every required migration file exists BEFORE touching the DB --
for f in "${MIGRATIONS[@]}"; do
  [ -f "$MIGDIR/$f" ] || { echo "FATAL: missing migration file $f in $MIGDIR" >&2; exit 2; }
done

# Read-only scalar query helper; prints value on stdout, returns psql's status.
psql_ro() { "$PSQL" -X "$DB_URL" -At -v ON_ERROR_STOP=1 -c "$1"; }

if [ "$DRY_RUN" -eq 1 ]; then
  echo "=== Wana Iguana migration runner (dry-run, read-only) ==="
else
  echo "=== Wana Iguana migration runner (applying) ==="
fi
target="$(psql_ro "select 'db='||current_database()||' user='||current_user||' server='||current_setting('server_version')")" \
  || { echo "FATAL: cannot connect with provided DB_URL (psql reported an error above)." >&2; exit 2; }
echo "target: $target"

# --- Read the ledger state with an explicit, checked, read-only query --------
# ledger_exists: 't' or 'f'. A FAILED query must NOT be mistaken for 'absent'.
ledger_exists="$(psql_ro "select (to_regclass('public.schema_migrations') is not null)")"
if [ $? -ne 0 ] || { [ "$ledger_exists" != "t" ] && [ "$ledger_exists" != "f" ]; }; then
  echo "FATAL: could not determine whether the ledger exists (query failed)." >&2
  exit 2
fi

APPLIED=""
if [ "$ledger_exists" = "t" ]; then
  # Read recorded migrations (read-only). Distinguish query failure from empty.
  if ! APPLIED="$(psql_ro "select filename from public.schema_migrations order by filename")"; then
    echo "FATAL: failed to read public.schema_migrations (query error above)." >&2
    exit 2
  fi
fi

# --- 2. Validate recorded migrations are a valid PREFIX of the sequence ------
# Build the applied list (sorted) and compare to the expected prefix of the same
# length, using LITERAL filename matching. Any unknown or out-of-order record
# stops the run.
recorded_count=0
if [ -n "$APPLIED" ]; then
  recorded_count="$(printf '%s\n' "$APPLIED" | grep -c . )"
fi
# Expected sorted sequence is MIGRATIONS already in ascending order.
i=0
while IFS= read -r rec; do
  [ -z "$rec" ] && continue
  expected="${MIGRATIONS[$i]:-}"
  if [ -z "$expected" ]; then
    echo "FATAL: ledger has more records than known migrations (unknown record: '$rec')." >&2
    exit 2
  fi
  if [ "$rec" != "$expected" ]; then
    echo "FATAL: ledger is not a valid prefix of the expected sequence." >&2
    echo "       position $((i+1)): recorded '$rec', expected '$expected'." >&2
    echo "       Refusing to proceed (out-of-order or unknown migration record)." >&2
    exit 2
  fi
  i=$((i+1))
done <<< "$APPLIED"

echo "--- already applied (${recorded_count}) ---"
printf '%s\n' "${APPLIED:-(none)}"

# --- Build the plan with LITERAL matching ------------------------------------
echo "--- plan ---"
to_apply=()
for f in "${MIGRATIONS[@]}"; do
  if printf '%s\n' "$APPLIED" | grep -Fxq -- "$f"; then
    echo "  SKIP (recorded): $f"
  else
    echo "  APPLY:           $f"
    to_apply+=("$f")
  fi
done

# --- 1c. Dry-run ends here: nothing created, no permissions/RLS touched ------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "(dry run) read-only; no ledger created, no migrations applied."
  exit 0
fi

# --- Initialize the ledger (idempotent; operator-owned) in ONE transaction,
#     revoking from PUBLIC and (when present) anon/authenticated together. -----
"$PSQL" -X "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON public.schema_migrations FROM %I', r);
    END IF;
  END LOOP;
END
$$;
SQL
if [ $? -ne 0 ]; then
  echo "FATAL: ledger initialization failed; aborting before applying migrations." >&2
  exit 1
fi
echo "ledger ready."

if [ "${#to_apply[@]}" -eq 0 ]; then
  echo "nothing to apply; all migrations already recorded."
fi
for f in ${to_apply[@]+"${to_apply[@]}"}; do
  echo "=== applying $f (atomic with ledger insert) ==="
  "$PSQL" -X "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f "$MIGDIR/$f" \
    -c "INSERT INTO public.schema_migrations (filename) VALUES ('$f');" \
    || { echo "FATAL: $f failed; transaction rolled back, run stopped." >&2; exit 1; }
  echo "  recorded $f"
done

echo "=== done. ledger now: ==="
psql_ro "select filename from public.schema_migrations order by filename" \
  || { echo "WARN: could not re-read ledger after apply." >&2; exit 1; }
