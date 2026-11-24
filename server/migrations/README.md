# Database migrations — Wana Iguana catalog

Version-controlled, plain `.sql` migrations for the menu catalog. They are the
single source of truth for the database structure, applied **in filename order**.

## Nature of these migrations

- **One-time, non-idempotent.** Each file uses bare `CREATE TABLE` /
  `CREATE UNIQUE INDEX` (no `IF NOT EXISTS`) and is meant to run **exactly once**
  per database. Re-running a file that was already applied will error on purpose;
  the ledger (below) is what stops a second run.
- **Files are transaction *bodies*, not whole transactions.** `0001` and `0002`
  contain **no** `BEGIN`/`COMMIT`. The migration operator wraps each file's body
  **and** its ledger entry in a single transaction so schema and ledger commit
  atomically (see "Atomic tracking" below).
- **Immutable IDs and archival are application conventions, not DB prohibitions.**
  The text-slug primary keys are treated as immutable and `is_active = false` is
  the archival mechanism, but the database does not forbid updating a key or hard-
  deleting a row (beyond the normal foreign-key `RESTRICT`/`CASCADE` rules). These
  are operator/application disciplines.

## Migration files & apply order

Apply strictly in ascending numeric order.

| Order | File                          | Purpose                                            | Status            |
|-------|-------------------------------|----------------------------------------------------|-------------------|
| 1     | `0001_create_catalog.sql`     | Create the five catalog tables; enable RLS.        | authored (B1)     |
| 2     | `0002_one_active_default.sql` | Partial unique index: ≤1 active default per item.  | authored (B2)     |
| 3     | `0003_access_policies.sql`    | Access control: least-priv read role + RLS policies.| authored (C2 local)|
| 4     | `0004_seed_taco_suave.sql`    | Seed the verified Taco Suave rows.                 | authored (B3)     |
| 5     | `0005_menu_item_category.sql` | Add `menu_item.category` (Feature 2).              | authored          |
| 6     | `0006_double_meat_columns.sql`| Taco double-meat columns (group + per-option).     | authored          |
| 7     | `0007_seed_original_tacos.sql`| Seed the five Original Tacos.                      | authored          |
| 8     | `0008_double_portion_column.sql`| Add `modifier_option.double_portion_price_delta_cents` (Feature 3, Burritos). | authored (B1) |
| 9     | `0009_seed_burritos.sql`      | Seed the seven Burritos + groups/options + wet.    | authored (B2)     |

> Numbering note: the seed is deliberately numbered `0004`, after the access
> control migration `0003`, so that **access controls are applied before any seed
> data exists** (see the ordering rule below).

## The runner, and operator vs runtime credentials

Use the documented runner [`run_migrations.sh`](./run_migrations.sh) to apply the
fixed order **0001 → 0002 → 0003 → 0004**. It:

- records each migration atomically with its body (`psql -X --single-transaction
  -v ON_ERROR_STOP=1`, body + ledger INSERT in one transaction);
- **skips** migrations already present in `public.schema_migrations`;
- **stops on the first error** (and that migration's transaction rolls back).

```bash
# Check what is already applied / preview the plan without applying:
DB_URL="postgresql://OPERATOR@HOST:5432/postgres" server/migrations/run_migrations.sh --dry-run
# Apply the missing migrations in order:
DB_URL="postgresql://OPERATOR@HOST:5432/postgres" server/migrations/run_migrations.sh
```

The runner never reads, requests, or prints a password; it hands `DB_URL` to psql,
which handles authentication (e.g. `~/.pgpass`, `PGPASSWORD`, or the URL you pass).

Runner behavior worth noting:
- `--dry-run` is strictly **read-only**: it validates arguments and the presence
  of all four migration files, checks the ledger with a read-only query, and
  prints the plan. It creates no ledger, applies nothing, and alters no
  permissions/RLS (verified on both a fresh and an already-migrated database).
- Unknown arguments and a missing `DB_URL` are rejected (exit 2) before any DB
  work. A missing migration file is detected before applying anything.
- The recorded ledger must be a **valid prefix** of `0001→0002→0003→0004`
  (literal filename matching). An out-of-order or unknown record stops the run
  with an explanation. Ledger init and ledger reads are status-checked; a failed
  query is never treated as an empty ledger.
- Ledger init (one transaction) revokes all ledger privileges from `PUBLIC` and,
  when present, `anon`/`authenticated`; `0003` additionally revokes the runtime
  role from the ledger (so even TRUNCATE, which RLS does not cover, is denied).

**Two separate credentials — do not mix them:**

| Role | Who | What it may do |
|------|-----|----------------|
| **Migration operator** | owner/superuser that runs the runner (on Supabase: `postgres`) | owns tables + ledger; applies migrations; writes the ledger |
| **Express runtime** | the `menu_backend` role (NOLOGIN) granted to a dedicated LOGIN user | **SELECT only** on the five catalog tables via RLS read policies; **no** writes; **no** ledger access |

`0003_access_policies.sql` creates `menu_backend` (NOLOGIN, privilege-bearing),
grants it catalog `SELECT` + adds per-table `FOR SELECT` RLS policies, revokes
catalog access from `PUBLIC`/`anon`/`authenticated`, and re-revokes the ledger
from `menu_backend`. A human creates a LOGIN user out of band and runs
`GRANT menu_backend TO <login_user>` so no password ever lands in SQL or Git.
The Express server connects as that login user — never as the operator.

## RLS is enabled, but access control is NOT finished here

`0001` **enables row-level security** on all five tables (inside the operator's
transaction, before COMMIT) and defines **no policies** — a default-deny floor.
It does **no** `GRANT`/`REVOKE`. The later `0003_access_policies.sql` (Task C2)
owns the final grants/revokes, any RLS policies, and the backend's
server-side-only read access.

> **Empty tables are not safe tables.** A freshly created table that is reachable
> by a role holding `INSERT` (e.g. a public/anon write grant) can be written to
> immediately, empty or not. Enabling RLS with no policies denies non-owner roles
> by default and closes that window until `0003` deliberately decides what is
> allowed.

## ⚠️ Ordering rule — access controls BEFORE seeding (shared dev catalog)

When applied to the **shared development** database, the order is:

1. Structure + RLS enable — `0001`, `0002`.
2. **Access controls — `0003`** (grants/revokes + policies; server uses a
   server-side-only credential).
3. **Only then** seed — `0004`.

Rationale: the shared catalog must **never** be populated while it is still
publicly writable. Do not seed a shared database until access controls from
`0003` are in force and verified.

## Atomic tracking (schema change + ledger entry in ONE transaction)

> **Status:** implemented. The runner `run_migrations.sh` applies this contract
> (atomic body + ledger INSERT, skip-already-applied, stop-on-error). The full
> `0001`–`0004` sequence has been applied to the shared Supabase database and
> verified (see `VERIFY_C2_SUPABASE_RESULTS.md`). The explanation below documents
> why the files carry no `BEGIN`/`COMMIT` and how the operator owns the transaction.

**Goal:** a migration's schema changes and its ledger record must commit together
or not at all. Never "COMMIT the schema, then separately INSERT the ledger row" —
a crash between the two leaves the ledger lying about what is applied.

**Why the files have no COMMIT.** If a file contained its own `BEGIN; … COMMIT;`
and the operator wrapped it in an outer transaction, the file's inner `COMMIT`
would end the operator's transaction early (Postgres treats the re-`BEGIN` as a
warning/no-op), committing the schema **before** the ledger INSERT. Atomicity
would be lost. So the files are transaction *bodies* and the **operator owns the
one and only transaction**.

**Ledger initialization (once per database, by the migration operator).** Before
applying `0001`, the operator creates the ledger and locks writes to itself:

```sql
-- Run once, as the migration operator / table owner.
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);

-- Lock the ledger down to the migration operator only: enable RLS (no policies)
-- and revoke all access from PUBLIC. No application/anon role may read or write
-- the ledger; the operator connects as the owner / a BYPASSRLS role and is
-- therefore exempt.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC;
```

Who owns the transaction: a single **migration-operator** database role (the
schema owner), used only for applying migrations — never the backend's runtime
role and never an anon/public role. Ledger writes are restricted to that operator
by the `REVOKE`/RLS above.

**Per-migration workflow (operator-owned single transaction):**

1. **Check first** what is already applied:
   `SELECT filename FROM public.schema_migrations ORDER BY filename;`
2. For each file **not** already listed, in ascending order, run ONE transaction
   that includes the file body and the ledger INSERT. With psql this is done
   without any `BEGIN`/`COMMIT` inside the files:

   ```bash
   # $ISOLATED_TEST_DATABASE_URL points at a DISPOSABLE, isolated database.
   # --single-transaction makes psql wrap everything below in ONE transaction;
   # -c runs the ledger INSERT in that same transaction after the file body.
   psql "$ISOLATED_TEST_DATABASE_URL" \
     -v ON_ERROR_STOP=1 \
     --single-transaction \
     -f 0001_create_catalog.sql \
     -c "INSERT INTO public.schema_migrations (filename) VALUES ('0001_create_catalog.sql');"
   ```

   Because the files contain no `COMMIT`, the single `--single-transaction`
   wrapper is the only transaction; schema + ledger row commit together, or both
   roll back on any error.

3. Repeat for `0002_one_active_default.sql` (and later `0003`, `0004`).

## Applying to an isolated test database (for review only)

> For a **disposable, isolated** local Postgres only — **never** the shared dev
> catalog. Run these from the `server/` directory (the paths below are relative
> to `server/migrations/`, so `cd server/migrations` first, or prefix with
> `migrations/`). `$ISOLATED_TEST_DATABASE_URL` must point at the throwaway test
> database, distinct from any shared/production connection string.

```bash
cd server/migrations

# Initialize the ledger once (see "Ledger initialization" above), then:
psql "$ISOLATED_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f 0001_create_catalog.sql \
  -c "INSERT INTO public.schema_migrations (filename) VALUES ('0001_create_catalog.sql');"

psql "$ISOLATED_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f 0002_one_active_default.sql \
  -c "INSERT INTO public.schema_migrations (filename) VALUES ('0002_one_active_default.sql');"
```

Runtime behavior has been verified locally against PostgreSQL 18 (see
`VERIFY_B1_B2_RESULTS.md`, `VERIFY_B3_SEED_RESULTS.md`, `VERIFY_C2_LOCAL_RESULTS.md`)
and the full `0001`–`0004` sequence has been applied and verified on the shared
Supabase database (PostgreSQL 17.11) — recorded in `VERIFY_C2_SUPABASE_RESULTS.md`.
For routine application, prefer the runner `run_migrations.sh` over the manual
per-file commands above; the runner tracks the ledger and skips applied migrations.
