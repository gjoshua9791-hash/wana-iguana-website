# C2 (local portion) verification — results

Covers the **local** C2 deliverables: `0003_access_policies.sql` and the
documented runner `run_migrations.sh`. Runnable:
[`verify_c2_local.sh`](./verify_c2_local.sh) (exit 0 = all passed).

- **Local server:** PostgreSQL 18.6 (Postgres.app), loopback `127.0.0.1:5432`.
- **Shell:** macOS bash 3.2 (no associative arrays / strict empty-array handling);
  the scripts are written to be compatible.
- **Isolation & safety:** the script refuses to run if `menu_backend` already
  exists; it tracks only the databases/roles it creates and drops exactly those
  (even on failure), makes cleanup failures visible, and preserves any
  pre-existing `anon`/`authenticated` roles and all other databases/roles. The
  retained `wana_iguana_schema_test` and Supabase are not touched.

## ✅ Completed LOCAL checks (all PASS)

**Runner**
- Full order `0001 → 0002 → 0003 → 0004` applied; ledger lists all four in order.
- Each migration body + its ledger INSERT commit in one `--single-transaction`.
- `--dry-run` is read-only on a **fresh** DB (exit 0, no ledger created, all four
  shown pending) and on a **migrated** DB (exit 0, ledger md5 unchanged, four SKIP).
- Second real run is idempotent: **exit 0, four SKIP, zero APPLY**.
- Prerequisite failures handled before DB work: unknown argument → exit 2;
  missing `DB_URL` → exit 2; missing migration file → exit 2.

**Access control (0003)**
- `SET ROLE` to the runtime user is confirmed before access assertions.
- Runtime role (`menu_backend` via a `NOSUPERUSER NOBYPASSRLS` LOGIN user) can
  **SELECT all five** catalog tables (counts 1/1/1/2/1; default price 525).
- Runtime **writes denied** with SQLSTATE **42501** and the object-specific
  message `permission denied for table <t>` (INSERT/UPDATE/DELETE across tables).
- Runtime **cannot read, INSERT, or TRUNCATE** the ledger (42501). TRUNCATE is
  included because it is a table privilege RLS does not cover.
- **PUBLIC**: an ordinary unprivileged role (no grants) is denied catalog
  SELECT and INSERT (42501).
- **anon/authenticated REVOKE branches** exercised with isolated fixture roles
  that started WITH representative catalog + ledger grants (incl. ledger
  TRUNCATE): after the runner, both lost catalog INSERT (0003 revoke) and **all**
  ledger privileges incl. TRUNCATE (ledger-init revoke).
- No non-SELECT policies exist; RLS enabled on all five catalog tables.

**0003 role guard**
- `menu_backend` is created `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB
  NOCREATEROLE`; if a role of that name already exists with unexpected attributes
  or memberships, `0003` **raises and stops** rather than silently reusing it.

## PostgreSQL 17 (Supabase) vs 18 (local) — compatibility assumptions

Local testing used PG 18; Supabase runs **PG 17.11**. The SQL used (RLS,
`CREATE POLICY ... FOR SELECT`, GRANT/REVOKE, `DO`-guarded `CREATE ROLE`,
`format()`/`EXECUTE`, partial index, composite PK, CHECK) behaves identically on
17 and 18; no PG18-only syntax is used. Supabase pre-defines `anon`/
`authenticated` — `0003` and ledger init revoke their catalog/ledger access
(guarded so they are no-ops where those roles are absent, as on bare local PG).
**To re-confirm on Supabase:** role-grant inheritance
(`GRANT menu_backend TO <login_user>`) — standard Postgres behavior, re-checked
during the shared-DB verification.

## ⛔ Outstanding SHARED-DATABASE (Supabase) checks — NOT done

C2 is **not complete**. Nothing has been applied to Supabase. The shared-DB
acceptance criteria still to verify:
1. Apply as operator `postgres` over the **Session pooler** (direct connection
   currently fails on this network) using the runner (`--dry-run` first, then
   apply). Password via `~/.pgpass`/`PGPASSWORD`/URL — never in Git.
2. Create the Express runtime LOGIN user out of band and
   `GRANT menu_backend TO <login_user>`; store its URL in the server-side,
   git-ignored `.env`.
3. Verify on Supabase: five tables + `one_active_default_per_item` exist; the
   ledger (as operator) lists 0001–0004; the runtime user can SELECT but not
   write; anon/public write is rejected.
4. Only then mark C2 complete.

## Scope / preservation
- No Supabase changes applied; no password requested or printed.
- `src/App.css` preserved; retained local test DB untouched; pre-existing roles
  and databases preserved; no unrelated files changed.
