# C2/C3 shared-database (Supabase) verification — results

> **These checks were performed manually by the project owner against the shared
> Supabase database and reported as evidence.** They were not run by the
> assistant and are recorded here as user-performed verification.

- **Database:** Supabase `wana-iguana-dev`, PostgreSQL **17.11**, reached via the
  **Session pooler** (port 5432). (Direct connection fails on the current network;
  the pooler path is used for operator migration application.)

> **TLS note on the manual psql checks:** the earlier psql session connected with
> `sslmode=require`, which encrypts the connection but does **not** verify the
> server certificate or hostname. Those psql results therefore do not demonstrate
> full certificate/hostname verification. Verified TLS is demonstrated separately
> by the Node connection check below (`rejectUnauthorized: true` with the project
> CA), which validates the chain.

## Evidence (user-reported)

- All four migrations applied successfully; the ledger (`public.schema_migrations`)
  lists **0001, 0002, 0003, 0004**.
- A separate LOGIN role **`wana_menu_app`** inherits the `menu_backend` runtime role.
- A real connection as `wana_menu_app` ran a SELECT joining **only**
  `menu_item` and `item_variant`, which returned **Taco Suave** with
  `base_price_cents = 525`. (This actual read touched two of the five tables; it
  was not a read from all five — see the privilege vs. actual-read note below.)
- `has_table_privilege` for `wana_menu_app`: **SELECT = true** on all five catalog
  tables (privilege check, not an executed read of each); **SELECT = false** on
  `schema_migrations`.
- INSERT/UPDATE/DELETE/TRUNCATE privileges are **false** on all six tables for
  `wana_menu_app`, `anon`, `authenticated`, and `PUBLIC`.
- An actual `UPDATE` as `wana_menu_app` failed with
  **"permission denied for table menu_item."**

> **Privilege vs. actual read:** `SELECT = true` on all five tables is a
> `has_table_privilege` *capability* check. The only *executed* catalog read in
> this manual session joined `menu_item` + `item_variant`. An executed read that
> spans the catalog (item → default variant → group → options) is demonstrated by
> the Node connection check below (which executed `queryDefaultVariant`), not by
> this manual two-table SELECT.

## Mapping to task acceptance criteria

- **C1** — shared project exists and is reachable; connection string obtained
  out-of-band. ✅
- **C2** — five tables + the partial unique index exist; access controls in place
  and verified (server-side role reads; public/anon writes rejected); the tracking
  ledger lists the applied migrations. ✅
- **C3** — seed rows present (Taco Suave, 525) and `0004` recorded in the ledger;
  access controls remained in force (seed applied after lockdown). ✅

## Node connection check (verified TLS) — PASSED

Run by the assistant from `server/` via `node verify_d1_connection.mjs`, using the
actual `db.ts` pool and `queryDefaultVariant()`. TLS is verified
(`rejectUnauthorized: true`) using the project CA supplied privately through
`DB_CA_CERT` in the git-ignored `server/.env` (its contents were never inspected
or printed). Results:

- `current_user` = **`wana_menu_app`** (the runtime login).
- `queryDefaultVariant('taco-suave')` returned **2 rows**, `base_price_cents = 525`,
  options **steak + chicken**, `minSelect/maxSelect = 1/1`.
- An unknown item id returned **0 rows**.
- The pool **closed cleanly**.

This is the first check that exercises the real application path end-to-end with
certificate-verifying TLS; it supersedes the `sslmode=require` psql session for the
purpose of demonstrating verified TLS and an executed read spanning the catalog
(item → default variant → group → options).

## Credential handling
- Operator (`postgres`) and runtime (`wana_menu_app` ⟵ `menu_backend`) credentials
  are separate. The runtime login's connection string lives only in the server-side,
  git-ignored `server/.env`; it is never committed and never exposed to the frontend.
