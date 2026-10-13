# Tasks — Feature 1: Display Taco Suave from a Database-Backed API

Implementation plan for `requirements.md` + `design.md` (same folder). Tasks are
small and **dependency-ordered**: do them top to bottom. Each is sized for a student
work session of roughly 1–2 hours. Larger pieces are split into sub-tasks.

**Legend**
- **AC refs** — acceptance criteria from `requirements.md` this task helps satisfy.
- **Files** — expected files created/edited.
- **Depends on** — tasks that must be done first.
- **Done when** — concrete completion checks.
- **Manual step?** — whether a human must do something outside the code editor
  (e.g. click in the Supabase dashboard, paste a secret). Marked 🔧 when yes.

Guardrails that apply to every task:
- Credentials stay **out of Git** and **off the frontend** (AC15).
- The frontend never writes to or reads the catalog tables directly; it only calls our
  read-only Express endpoint. Catalog tables are **not** exposed for public writes.
- Preserve the existing React/Vite app; all other menu items keep rendering unchanged
  (AC17).

---

## Phase A — Backend scaffold (preserve the frontend)

- [x] **Task A1 — Decide repo layout & add backend folder skeleton**
Create a `server/` folder alongside the existing frontend so the Vite app is untouched.
- **AC refs:** AC17
- **Files:** `server/` (empty dirs: `server/src/`), `server/README.md` (one paragraph:
  "backend lives here"), root `README.md` note pointing to `server/`.
- **Depends on:** —
- **Done when:** `server/` exists; `npm run dev`/`npm run build` for the frontend still
  work exactly as before (nothing in `src/` changed).
- **Manual step?** No.

- [x] **Task A2 — Initialize the Node + Express + TypeScript project**
Set up the backend package, TypeScript config, scripts, and a minimal health server.
- **Dependency installation belongs here (A2).** Backend dependencies **are
  installed in this task** and `server/package-lock.json` is committed. The earlier
  "no installs yet" restriction applied only to the planning phase — it was never a
  permanent project rule. From A2 onward, installing the backend's own dependencies
  is expected.
- **The `/health` endpoint must run without any Supabase credentials.** This first
  milestone has no database wiring: `/health` returns `{"ok":true}` purely from the
  web server, so a teammate can start it and verify it with an empty `.env`.
- **AC refs:** AC2
- **Files:** `server/package.json` (scripts: `dev`, `build`, `start`, `lint` +
  installed deps), `server/package-lock.json`, `server/tsconfig.json`,
  `server/.gitignore` (includes `node_modules/`, `dist/`, `.env`), `server/src/index.ts`
  (minimal Express app that listens on port 3001 by default — configurable via `PORT` —
  with `GET /health` returning HTTP 200 `{ "ok": true }`).
- **Depends on:** A1
- **Done when:** dependencies install and `server/package-lock.json` exists; `build`
  compiles cleanly; `lint` passes; the compiled server starts and `GET /health`
  returns 200 with `{"ok":true}` **without** any database credentials present.
- **Manual step?** No.

- [ ] **Task A3 — Config & environment loading (no secrets in Git)**
Add typed config loading that reads the database connection from server-side env vars.
- **AC refs:** AC15
- **Files:** `server/src/config.ts` (reads `DATABASE_URL` etc. from `process.env`,
  throws a clear error if missing), `server/.env.example` (placeholder keys **only**,
  no real values), confirm `server/.gitignore` excludes `.env`.
- **Depends on:** A2
- **Done when:** `.env.example` documents every required variable with placeholder
  values; real `.env` is git-ignored; config throws a readable error when a variable
  is absent. No `VITE_`-prefixed names are used for DB secrets.
- **Manual step?** No (real `.env` is created in Phase C).

---

## Phase B — Database migrations & seed (version-controlled SQL)

- [ ] **Task B1 — Migration: create the five catalog tables**
Author the first migration that creates the schema exactly as in design §1.
- **AC refs:** AC1, AC14
- **Files:** `server/migrations/0001_create_catalog.sql` (tables `menu_item`,
  `item_variant`, `modifier_group`, `modifier_option`, `variant_modifier_group` with
  PKs, FKs, NOT NULLs, CHECKs, and the composite PK on the join table).
- **Depends on:** A1
- **Done when:** SQL matches the design's column/type/constraint tables; FK delete
  rules are CASCADE/RESTRICT exactly as specified; `price_delta_cents` is used (not
  `price_cents`); `min_select`/`max_select` live on `variant_modifier_group`.
- **Manual step?** No (applying it is Phase C).

- [ ] **Task B2 — Migration: partial unique index for at-most-one active default**
Add the index enforcing *at most one* active default variant per item.
- **AC refs:** AC4
- **Files:** `server/migrations/0002_one_active_default.sql` (the
  `CREATE UNIQUE INDEX ... WHERE is_default AND is_active`).
- **Depends on:** B1
- **Done when:** index SQL matches design §1; a comment notes it enforces *at most one*
  (zero is allowed; the API returns 404 for no-active-default).
- **Manual step?** No.

- [ ] **Task B3 — Migration: seed Taco Suave (verified data)**
Insert the verified Taco Suave rows from design §2 example rows.
- **AC refs:** AC1, AC3, AC5, AC14
- **Files:** `server/migrations/0004_seed_taco_suave.sql` (inserts `taco-suave`,
  `taco-suave-base` with `base_price_cents = 525` and `is_default = true,
  is_active = true`, `protein` group labeled "Choose one", `steak`/`chicken` options
  with `price_delta_cents = 0`, and the join row with `min_select = 1, max_select = 1`).
- **Depends on:** B1, B2
- **Done when:** seed is idempotent where practical (e.g. `ON CONFLICT DO NOTHING`);
  values match the verified data ($5.25 = 525 cents; exactly-one protein rule).
- **Manual step?** No.

---

## Phase C — Supabase dev setup, access control & seeding (manual-heavy)

- [ ] **Task C1 — 🔧 Create/confirm the shared Supabase dev project & get the connection string**
One teammate sets up the single shared dev project and shares connection details
securely (not in Git, not in chat logs).
- **AC refs:** AC15
- **Files:** none (dashboard action). Record the variable **names** needed in
  `server/.env.example` (already created in A3).
- **Depends on:** A3
- **Done when:** the shared project exists; each teammate can obtain the connection
  string out-of-band and place it in their **local, git-ignored** `server/.env`.
- **Manual step?** 🔧 Yes — Supabase dashboard + secret sharing.

> **Phase C ordering rule — access controls come before seeding.** We create the
> schema and lock down access (C2) **before** inserting any catalog rows (C3), so the
> shared catalog is never populated while still publicly writable. Migration
> application is **documented and tracked** (C2) so teammates never blindly reapply
> migrations against the shared database.

- [ ] **Task C2 — 🔧 Apply schema + access-control migrations, with tracking (before seeding)**
Apply the structural and access-control migrations to the shared project, and set up
tracking so each migration is applied exactly once.
- **AC refs:** AC1, AC15
- **Files:** `server/migrations/0001_create_catalog.sql`, `0002_one_active_default.sql`,
  and the access-control migration `0003_access_policies.sql` (server connects with a
  server-side-only credential; if RLS is on, **no** anonymous insert/update/delete on
  catalog tables); `server/migrations/README.md` documenting (a) the exact apply order,
  (b) the chosen apply tool/command, and (c) a **tracking mechanism** — e.g. a
  `schema_migrations` table recording each applied filename, or the migration tool's
  own ledger — so applied migrations are not re-run.
- **Depends on:** B1, B2, (access-control SQL), C1
- **Done when:** the five tables + partial unique index exist; access controls are in
  place and verified (a public/anon write to a catalog table fails while the
  server-side read works); the tracking record lists the applied migrations; the
  README explains how a teammate checks what is already applied **before** running
  anything. **No seed rows exist yet.**
- **Manual step?** 🔧 Yes — running migrations against the hosted DB + dashboard
  settings for access control.

- [ ] **Task C3 — 🔧 Seed the shared catalog (after access controls)**
Apply the Taco Suave seed migration to the now-locked-down shared database.
- **AC refs:** AC1, AC3, AC5, AC14
- **Files:** apply `server/migrations/0004_seed_taco_suave.sql` (from B3); record it in
  the migration tracking ledger.
- **Depends on:** B3, C2 (access controls must already be in place)
- **Done when:** the Taco Suave seed rows are present (verify with a `SELECT`); the
  seed migration is recorded as applied in the tracking ledger; access controls remain
  in force. Seeding occurred **only after** C2 locked the catalog against public writes.
- **Manual step?** 🔧 Yes — running the seed migration against the hosted DB.

---

## Phase D — Database-backed GET endpoint

- [ ] **Task D1 — Database client & query module**
Add a small Postgres access layer the route will use.
- **AC refs:** AC1
- **Files:** `server/src/db.ts` (creates the pool/client from `config.ts`),
  `server/src/menu/queries.ts` (the parameterized default-variant query from design §4).
- **Depends on:** A3, C2
- **Done when:** the query is **parameterized** (`$1`), resolves the active default
  variant first, and joins only that variant's groups/options (no variant merging).
- **Manual step?** No.

- [ ] **Task D2 — Response mapping (rows → nested JSON)**
Transform flat SQL rows into the API JSON shape from design §3.
- **AC refs:** AC2, AC3, AC14
- **Files:** `server/src/menu/mapRows.ts` (collapses rows into
  `{ id, name, description, variantId, basePriceCents, modifierGroups:[{ id, label,
  minSelect, maxSelect, options:[{ id, name, priceDeltaCents }] }] }`).
- **Depends on:** D1
- **Done when:** mapping emits `minSelect`/`maxSelect` (from the join row),
  `priceDeltaCents` per option, stable IDs, and integer cents; no hard-coded item data.
- **Manual step?** No.

- [ ] **Task D3 — Route handler with status codes**
Wire `GET /api/menu/items/:itemId` to the query + mapper with correct statuses.
- **AC refs:** AC2, AC7, AC8
- **Files:** `server/src/menu/router.ts`, mount it in `server/src/index.ts`.
- **Depends on:** D1, D2
- **Done when:** 200 with mapped JSON on success; **404 `item_not_found`** when the
  item is missing/inactive **or** has no active default; **500 `internal_error`** on a
  thrown DB error.
- **Manual step?** No.

- [ ] **Task D4 — Backend tests (default-variant & not-found rules)**
Automated tests proving the key invariants.
- **Database integration tests require an isolated test environment.** These tests
  insert and delete rows (e.g. attempting a second active default), so they must run
  against a **dedicated, disposable test database** — never the shared dev catalog.
  Options: a separate Supabase project/schema, a local throwaway Postgres, or a
  per-run ephemeral database that is created and torn down. The test setup provisions
  the schema (via the migrations) into that isolated database before running and
  cleans up after, so no shared data is mutated.
- **AC refs:** AC1, AC3, AC4, AC8
- **Files:** `server/src/menu/__tests__/endpoint.test.ts` (+ test runner config +
  isolated-test-DB setup/teardown helper).
- **Depends on:** D3
- **Done when (all tests pass, against the isolated test DB):**
  1. **Second active default is rejected** — inserting a second `is_default=true,
     is_active=true` variant for the same item violates the partial unique index
     (DB error expected).
  2. **Missing default → 404** — when the item's default variant is inactive/absent,
     the endpoint returns 404 `item_not_found` (never merges another variant).
  3. **Happy path** — Taco Suave returns `basePriceCents: 525`, group label
     "Choose one", `minSelect:1/maxSelect:1`, and both protein options with
     `priceDeltaCents` present.
- **Manual step?** No (runs against the **isolated** test DB — never the shared dev
  catalog).

---

## Phase E — In-place React display

- [ ] **Task E1 — Dev proxy so the frontend can call the API by relative URL**
Add a Vite dev proxy mapping `/api` → the Express server.
- **AC refs:** AC2, AC17
- **Files:** `vite.config.js` (add `server.proxy` for `/api`).
- **Depends on:** D3
- **Done when:** with both servers running, `GET /api/menu/items/taco-suave` from the
  browser reaches Express; existing frontend behavior is otherwise unchanged.
- **Manual step?** No.

- [ ] **Task E2 — `TacoSuaveCard` component: fetch + loading/error/not-found states**
Build the component with its four states (no selection UI yet).
- **AC refs:** AC5, AC6, AC7, AC8
- **Files:** `src/components/TacoSuaveCard.jsx`, styles as needed in `src/App.css`.
- **Depends on:** E1
- **Done when:** component fetches on mount; shows a loading indicator; shows a
  friendly **error + Retry** (retry re-fetches) on failure/500; shows an "item
  unavailable" message on 404; on success shows name + price formatted from
  `basePriceCents`.
- **Manual step?** No.

- [ ] **Task E3 — `TacoSuaveCard`: protein selection UI (exactly-one semantics, starts empty)**
Add the "Choose one" radio group.
- **AC refs:** AC3, AC9, AC10, AC11, AC12, AC13
- **Files:** `src/components/TacoSuaveCard.jsx` (extend E2).
- **Depends on:** E2
- **Done when:** group labeled "Choose one"; renders Steak/Chicken as radios; starts
  with **nothing selected** (`selectedOptionId = null`); selecting one replaces the
  other (at most one); selection is visibly indicated; **no blocking validation**
  (display-only). The exactly-one rule is reflected by `minSelect/maxSelect` from the
  API, not enforced by a submit here.
- **Manual step?** No.

- [ ] **Task E4 — Swap Taco Suave in place in the menu (no double display)**
Replace the static Taco Suave row with `TacoSuaveCard` in its existing position.
- **AC refs:** AC16, AC17
- **Files:** `src/data/menu.js` (add stable `id: "taco-suave"` to that entry only),
  `src/App.jsx` (in the Original Tacos mapping, render `<TacoSuaveCard />` when
  `item.id === "taco-suave"`, else the static row).
- **Depends on:** E3
- **Done when:** Taco Suave appears **exactly once**, in its original Original Tacos
  slot, sourced from the API; every other menu item renders unchanged.
- **Manual step?** No.

---

## Phase F — Verification & teammate documentation

- [ ] **Task F1 — End-to-end verification (data proven to come from PostgreSQL)**
Run the verification plan from design §8 against the shared dev DB (edit seed rows
only, revert after each).
- **AC refs:** AC1, AC3, AC4, AC5, AC8
- **Files:** `server/VERIFICATION.md` recording results (checkboxes).
- **Depends on:** D4, E4, C2
- **Done when (observed and recorded):**
  1. **DB change reaches the UI** — editing `menu_item.name` for `taco-suave` in the
     DB changes the displayed name on reload, with **no code change**. Revert.
  2. **Missing default → 404** — making the default variant inactive makes the UI show
     "item unavailable". Revert.
  3. **No merging** — a non-default second variant does not alter the response.
  4. 404 for unknown id; error+Retry when the DB is unreachable.
- **Manual step?** 🔧 Yes — editing dev data in Supabase and observing the UI.

- [ ] **Task F2 — Secret-leak & public-write checks**
Confirm no secrets leak and the catalog is not publicly writable.
- **AC refs:** AC15
- **Files:** append results to `server/VERIFICATION.md`.
- **Depends on:** E4, C3
- **Done when:** frontend bundle/network tab contains **no** connection string or key
  (only menu JSON); a public/anon write to a catalog table is rejected.
- **Manual step?** 🔧 Partially — inspecting the browser network tab / attempting a
  write.

- [ ] **Task F3 — Teammate setup documentation**
Write the "get it running locally" guide for the three of us.
- **AC refs:** AC15, AC17
- **Files:** `server/README.md` (expand): prerequisites, copying `.env.example` →
  `.env`, getting the shared connection string securely, applying migrations, running
  Express, running the Vite dev server, and how the proxy connects them.
- **Depends on:** C2, D3, E1
- **Done when:** a teammate who has only cloned the repo can follow it to a working
  Taco Suave card without extra help; the guide stresses that `.env` is never committed.
- **Manual step?** No (writing docs).

---

## Suggested work-session grouping (for ~2–3 hrs/week each)
- **Session 1:** A1–A3 (backend skeleton & config).
- **Session 2:** B1–B3 (migrations & seed).
- **Session 3 (pairing recommended, manual):** C1 (Supabase project) → C2 (schema +
  access controls, tracked) → C3 (seed, only after access controls).
- **Session 4:** D1–D2 (query + mapping).
- **Session 5:** D3–D4 (endpoint + tests).
- **Session 6:** E1–E2 (proxy + states).
- **Session 7:** E3–E4 (selection + in-place swap).
- **Session 8:** F1–F3 (verification + docs).

## Out of scope (do not build here)
Cart, checkout, pricing math, order submission, payment, loyalty, customer accounts,
authentication, admin editing of the catalog, modifier-group/option archival, and any
Clover / kitchen-printer calls.
