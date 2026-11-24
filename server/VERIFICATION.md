# Verification — Phase E (in-place React display) in the integration worktree

Worktree: `restaurant-menu-integration` · Branch: `integration/frontend-backend`
Scope: **E1–E4** and Phase **F1/F2/F3** — all complete. The F1 DB-edit proofs were
user-performed against the dev Supabase database with guarded, committed changes each
reverted by a committed restore/cleanup; the catalog is back to its original state.
The F2 anon probe changed no rows and granted no privileges.

Each check below is labeled by **what it actually exercised**:
- **Automated (backend/proxy/pure-logic)** — Express, the Vite proxy, or pure JS
  functions run under `node --test`. These do **not** exercise the React hook, the
  rendered component, or the Retry button.
- **User browser check** — performed by the user in a running browser.
- **Pending** — not yet verified by anyone.

## Environment
- Vite dev server `http://localhost:5173`; Express backend `http://localhost:3001`
  loading the server-side `.env` normally (its contents were never printed or
  inspected). TLS verification stays enabled (`rejectUnauthorized: true` in
  `server/src/db.ts`).

## Automated checks (NOT tests of the React UI)
These confirm the backend contract, the proxy wiring, and the pure frontend logic.
They send HTTP requests or call functions directly; they do not render React.

| Check | What it exercises | Command | Result |
|-------|-------------------|---------|--------|
| Frontend build | Vite build only | `npm run build` | PASS |
| Frontend lint | ESLint only | `npm run lint` | PASS |
| Routing + filter tests (existing) | pure `parseRoute`/`filterMenuItems` | `node --test` | PASS 5/5 |
| Reconcile/format + count-agreement tests | pure `formatCents`/`menuWithTacoSuave`/`filterMenuItems` | `node --test` | PASS (25 total) |
| Backend build / lint | tsc / ESLint | `server && npm run build && npm run lint` | PASS |
| State-mapping logic (controlled interception) | a **mirror** of the hook's branching against a stub server — **not** the hook itself | `server && node verify_e_states.mjs` | PASS: 200→success, 404→notFound, 500→error, refused→error |

### Live endpoint + proxy (HTTP only; no React involved)
- `GET http://localhost:3001/api/menu/items/taco-suave` → **200** with
  `basePriceCents: 525`, label **"Choose one"**, `minSelect:1/maxSelect:1`, `steak`
  + `chicken` (`priceDeltaCents: 0`). Matches design §3.
- `GET http://localhost:3001/api/menu/items/does-not-exist` → **404**
  `{"error":"item_not_found",...}`.
- **E1 proxy:** `GET http://localhost:5173/api/menu/items/taco-suave` → **200**,
  same JSON — proves `/api` reaches Express with the path preserved (no rewrite).
- Backend stopped → proxy returns **502**; restarted → **200**. This confirms the
  *network* behavior the UI relies on. It does **NOT** confirm the rendered error
  state or that the Retry button re-fetches — those are UI behaviors (see below).

### Secret-leak check (AC15)
`grep -rniE "postgres(ql)?://|DATABASE_URL|supabase|service_role|sslmode|VITE_"`
over `dist/` and `src/` → **CLEAN**. The frontend only calls the relative `/api`
URL.

## User browser checks (performed by the user, in the running app)
Reported by the user in `restaurant-menu-integration`:
- [x] Taco Suave displays exactly once with the **$5.25** price (success state; E4/AC5/AC16).
- [x] Neither protein is selected initially; selecting one replaces the other
      (E3/AC10/AC11 via mouse/pointer).
- [x] Searching "taco suave" shows **one** matching item (count agreement in the UI).
- [x] Stopping the backend and refreshing shows the **error message + Retry button**
      (E2/AC7 rendered error state).
- [x] Restarting the backend and clicking **Retry** restores the item
      (E2/AC7 Retry re-fetch, confirmed in the UI).
- [x] **Keyboard operation** of the protein radios (Safari): Option+Tab reaches the
      controls, a visible keyboard focus outline appears, and arrow keys switch
      between Steak and Chicken while keeping exactly one selected (E3/AC11/AC12 +
      accessibility).
- [x] **Narrow-window layout** (Safari, narrow desktop window): menu items stack
      into a single column and Taco Suave's price, description, and controls stay
      readable. NOTE: this was a resized desktop window, **not** an actual-phone test.
- [x] **Loading state** rendered in the UI — AC6. Using the local loading override
      (below), the user saw the loading state in Safari, followed by Taco Suave
      loading successfully.
- [x] **404 / not-found** rendered state ("currently unavailable") — AC8. Using the
      local not-found override (below), the user saw the unavailable state while the
      rest of the menu stayed visible.
- [x] **Return to normal** after stopping the override and restarting the normal
      `npm run dev`: everything displayed correctly again.

> These are **user-performed browser checks**, not automated UI tests. No website
> screenshots were captured.

## Pending browser verification (not yet confirmed by anyone)
- [ ] **Real-device mobile** layout (optional): the narrow-window check above was a
      resized desktop window, not a physical phone / device-emulation test.

### How the loading and 404 states were exercised (controlled, temporary, local)
A dev-only override config, `vite.override.config.mjs`, intercepts ONLY the single
`GET /api/menu/items/taco-suave` request at the Vite dev-server layer and either
delays it (loading) or returns 404 (not-found). It is git-ignored, imports nothing
from the app, and adds NO test code to the production app. The real page, hook, and
component ran unchanged.

- **loading** mode holds the request open ~6s and then lets it **fall through to the
  normal proxy → Express → Supabase**, so it ultimately performs the usual read-only
  query. It delays and then reads Supabase; it never **mutates** Supabase.
- **notfound** mode returns a 404 at the dev-server layer and does not reach Express
  or Supabase at all.

Neither mode writes to the database.

HTTP-layer behavior of the override was confirmed (loading → ~6s then 200;
notfound → 404 `item_not_found`), and the **rendered** states were then observed by
the user in Safari (recorded above).

Run (from `restaurant-menu-integration/`), with the Express backend also running:
```
# Loading state (spinner visible ~6s, then the item loads normally):
TACO_OVERRIDE=loading  npx vite --config vite.override.config.mjs
# Not-found state ("This item is currently unavailable"):
TACO_OVERRIDE=notfound npx vite --config vite.override.config.mjs
```
Open the printed URL at `#/menu` and watch the Taco Suave slot in Original Tacos.

Remove the override afterward: stop that dev server (Ctrl+C) and return to the
normal `npm run dev` (committed `vite.config.js`, no override). The override file
may be left in place (git-ignored) or deleted with `rm vite.override.config.mjs`;
neither affects the repo.

---

# Phase F2 — Secret-leak & public-write checks (AC15)

Acceptance criteria (tasks.md F2):
1. The frontend bundle / network tab contains **no** connection string or key — only
   menu JSON.
2. A **public/anon write** to a catalog table is rejected.

No `.env` contents or credentials are shown below. Where the relevant configuration
has not changed since earlier checks, valid evidence is **reused** rather than re-run.

## Criterion 1 — no secrets in the frontend (bundle + network)

- **Bundle + source scan (automated, re-run this session, read-only):** a fresh
  `npm run build` then
  `grep -rniE "postgres(ql)?://|DATABASE_URL|service_role|sb_secret|supabase\.co|PGPASSWORD|BEGIN (RSA|EC|PRIVATE)"`
  over `dist/` and `src/` → **CLEAN** (no connection string, key, Supabase host, or
  private-key material). This extends the earlier `dist/`+`src/` grep in the Phase E
  section and remains valid because no frontend data-access code changed. This is the
  primary automated evidence for criterion 1.
- **`server/.env` is git-ignored** (via `server/.gitignore`) — confirmed with
  `git check-ignore` **without** reading its contents. Git-ignore **reduces the risk
  of accidentally committing** the file; it does **not** make committing a secret
  impossible (a secret could still be force-added, pasted into a tracked file, or
  printed to a log). It is a safety net, not a guarantee.
- **Source/architecture argument:** the frontend code calls only the relative
  `/api/...` URL and never imports `DATABASE_URL`; the browser therefore has no
  database credential to leak. (This is a code-structure argument, not a captured
  network observation.)

- **Network-tab inspection (user-performed, Safari — DONE):** the user inspected the
  request `GET http://localhost:5173/api/menu/items/taco-suave` in Safari's Network
  inspector. Result: **200**; the response contained the expected menu JSON with
  `basePriceCents 525` and Steak/Chicken options; **no** database credentials,
  connection strings, or secret keys appeared in the inspected URL, request/response
  headers, or response body.

**Criterion 1 status:** bundle/source scan **satisfied (automated)** and Network-tab
payload/header inspection **satisfied (user-performed)**. ✅

## Criterion 2 — catalog is not publicly writable

Evidence reused from the shared-database verification
(`migrations/VERIFY_C2_SUPABASE_RESULTS.md`, user-performed against Supabase). The
access configuration (`0003_access_policies.sql` + RLS enabled in `0001`) has **not
changed since**, so this evidence is still valid. Distinct kinds of evidence are
kept separate on purpose — a privilege inspection, a runtime-login write rejection,
and (below) an executed anon-role rejection:

- **Privilege inspection (capability check, not an executed write):**
  `INSERT/UPDATE/DELETE/TRUNCATE` privileges are **false** on all five catalog tables
  (and `schema_migrations`) for **`anon`, `authenticated`, and `PUBLIC`** — the roles
  a browser/PostgREST client could present. This shows no public/anon role *holds* a
  write privilege. `0003` also `REVOKE ALL ... FROM PUBLIC`/`anon`/`authenticated`
  and adds **only** `FOR SELECT` RLS policies for the runtime role (no write policy
  for anyone), so writes are denied both by table privilege and by RLS.
- **Attempted write (executed, rejected):** a real `UPDATE` on `menu_item` by the
  **runtime login `wana_menu_app`** failed with **"permission denied for table
  menu_item."** This proves the least-privilege path the app actually uses cannot
  write.

Earlier the executed rejection was only on the **runtime login**, with anon covered
by privilege inspection alone. That gap is now closed by an executed anon-role probe
(below).

### Anon-role write-permission probe (user-performed — DONE)

A **database-role permission probe**, not an HTTP API test. It checks what the
Postgres role `anon` may do **inside the database**; it does **not** exercise the
Supabase Data API / PostgREST HTTP surface (the app does not use that surface either
way). It changed **no rows** and granted **no** privileges.

Executed by the user in an authorized operator psql session:

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT current_user;                       -- → anon
UPDATE public.menu_item SET name = name    -- WHERE false: matches nothing
  WHERE false;                             -- → SQLSTATE 42501:
                                           --   permission denied for table menu_item
ROLLBACK;                                  -- → completed
-- exited psql normally
```

- **Observed result:** `current_user` was **`anon`**; the `UPDATE` was rejected with
  **SQLSTATE 42501 — permission denied for table `menu_item`**; the transaction was
  rolled back and psql exited normally.
- **No rows changed, no privileges granted.** The permission check fires before row
  matching, so `WHERE false` still triggers the denial while guaranteeing nothing is
  touched; `ROLLBACK` discards the (empty) transaction and restores the operator role.
- **What it proves:** the **database** denies writes to the `anon` role. It is **not**
  an HTTP/Data-API test — the catalog is never exposed over the Data API to the
  browser; the frontend reaches the catalog only through our read-only Express route.

**Criterion 2 status:** catalog is not publicly writable — **satisfied** by
configuration + privilege inspection, the runtime-login rejection, **and** the
executed anon-role rejection (SQLSTATE 42501). ✅

---

## Notes

- **At the time of the Feature 1 (Phase E/F) verification session,** no commit, push,
  or deploy had been performed in that documentation pass (the work was committed and
  pushed later, in its own checkpoint step). No cart/ordering/Clover work.
- **F1 DB edits** against the dev Supabase database were temporary and each reverted
  by a committed restore/cleanup (see Phase F1); no schema or migrations were touched.

> **F2 is complete.** Both criteria are satisfied: no secrets in the frontend
> (automated bundle/source scan + user-performed Safari Network-tab inspection) and
> the catalog is not publicly writable (configuration + privilege inspection +
> runtime-login rejection + executed anon-role rejection, SQLSTATE 42501). No rows
> were changed and no privileges were granted during the probe.

---

# Phase F1 — End-to-end DB-backed proof (COMPLETE, user-performed)

End-to-end proof that the displayed Taco Suave comes from PostgreSQL, not hard-coded
data. Acceptance criteria (tasks.md F1 / design §8): **AC1** (data is DB-backed),
**AC3** (`minSelect/maxSelect = 1`), **AC4** (deterministic default variant, no
merging), **AC5** (success display), **AC8** (not-found → "unavailable").

**Status: done.** The checks below were **performed by the user against the
development Supabase database** using guarded, committed transactions, each followed
by a committed restore/cleanup. All catalog data was returned to its original state;
no schema or migrations were touched. (Recorded here as user-performed; the assistant
did not run these mutations.)

## F1.1 — DB change reaches the UI (AC1, AC5) — PASSED
- Changed the item name to **"Taco Suave (DB test 1749)"** with a **guarded UPDATE**.
- The website displayed the temporary name **with no code change**.
- Restored **"Taco Suave"** with a guarded UPDATE.
- Both the change and the restore reported **UPDATE 1** and **COMMIT**.

## F1.2 — Missing active default → 404 / "unavailable" (AC4, AC8) — PASSED
- Temporarily set `item_variant.is_active = false` for **`taco-suave-base`**.
- The browser request returned **404** and the card showed **"currently
  unavailable,"** while the other menu items stayed visible.
- Restored `is_active = true` — **UPDATE 1** and **COMMIT** — and the user confirmed
  the item returned.

## F1.3 — Variant isolation / no merging (AC4) — PASSED
- Created and committed a **non-default** variant priced at **999 cents**, plus a
  **distinctive modifier group and option linked only to it**. Run-specific IDs:
  - variant `f1-alt-20261123-1756-a83c`
  - group `f1-group-20261123-1756-a83c`
  - option `f1-option-20261123-1756-a83c`
- After refreshing, the API and website were **unchanged**: default variant
  `taco-suave-base`, **525 cents**, only the **Protein** group with **Steak/Chicken**.
  The distinctive 999-cent variant and its modifier did **not** appear, proving the
  read resolves the default variant only and does not merge another variant's
  modifiers.
- The API also retained **`minSelect/maxSelect = 1/1`** for the protein group
  (satisfies **AC3** — the exactly-one rule is sourced from `variant_modifier_group`,
  not code).
- Cleanup removed exactly the four run-specific fixtures: **four DELETE 1** results
  followed by **COMMIT**. No other rows were affected.

## Reused evidence (not re-run)
- **Unknown id → 404:** `GET /api/menu/items/does-not-exist` → 404 `item_not_found`
  observed live earlier (Phase C2/D). An unknown-id API request exercises the endpoint
  only; the fixed Taco Suave page's rendered not-found state is proven by F1.2 and by
  the Phase E not-found override — not by requesting a different id.
- **Backend error + Retry:** the rendered error→Retry→success flow was user-verified
  in Phase E (stop backend → error+Retry → restart → Retry recovers).
- **Selection limit (exactly-one radios):** single-select replace-on-change was
  user-verified in Phase E (E3).

## F1 result
All required F1 criteria are satisfied and recorded: **AC1** and **AC5** (F1.1), **AC8**
and the deterministic-variant half of **AC4** (F1.2), the no-merging half of **AC4**
plus **AC3** (F1.3). Each mutation was committed, observed, and reverted by a committed
restore/cleanup with matching row counts; the shared catalog is back to its original
state. **Task F1: complete.**


---

# Feature 2 — Original Tacos category: backend verification

Branch `feature/original-tacos-catalog`. Backend only. **During the verification
session this record describes, no shared Supabase access occurred and nothing was
committed or pushed** (the backend was committed and pushed afterward in its own
checkpoint; these focused corrections are a later commit again). Verified TLS in
`db.ts` is unchanged (`rejectUnauthorized: true`). All DB-backed checks ran against
**uniquely named, disposable local databases** that are dropped on exit; the cluster
role `menu_backend` is only touched when a run created it. No shared or retained test
database was used.

## What each check actually exercises (do not conflate)
- **Pure unit (no DB, no HTTP):** `verify_d2_mapper.mjs` — the mapper over synthetic rows.
- **Injected HTTP tests (real Express over local TCP, NO DB, NO TLS):**
  `verify_f2_http.mjs` — boots the actual mounted category route with **injected**
  query functions (a dependency seam on `createCategoryRouter`). The production pool
  and its verified TLS are never involved. **These are NOT a live Supabase connection
  test and NOT a DB integration test.**
- **Isolated-DB integration (real local PostgreSQL, disposable):**
  `migrations/verify_f2_category.sh`, `migrations/verify_f2_upgrade.sh`,
  `migrations/verify_d4_endpoint.sh`, `migrations/verify_c2_local.sh` — apply real
  migrations via the real runner into throwaway DBs and assert on real SQL results.
- **NOT run this turn (would touch shared Supabase):** `verify_d1_connection.mjs`
  (connects to the real `DATABASE_URL`). See the rollout note about its post-rollout
  assertion update.

## Results (actual)
- `npm run build`: clean. `npm run lint`: clean (0 problems).
- `verify_d2_mapper.mjs`: **9/9** (incl. the two double-meat cases).
- `verify_f2_http.mjs`: **9/9** — Original Tacos success + exact extended shape
  (`doubleMeat` + per-option `doubleMeatAvailable`); empty category → 200 `items:[]`;
  unknown category → 200 `items:[]` (spec: not 404 this feature); unavailable-item
  (no active default variant) omitted; query failure → **500 `{"error":"internal_error"}`**
  (generic body; server log sanitized); `/health` → 200 `{"ok":true}` on the real app
  (DB-independent, proven by importing `createApp` without the module binding a port).
- `verify_f2_category.sh` (isolated DB): **ALL PASSED** — ordering `(sort_order,id)`;
  confirmed prices 525/525/525/850/675; grouping (`protein`=5, `protein-duro`=2,
  `protein-seafood`=2, all `min/max 1/1`); all protein deltas $0; double-meat link
  deltas (Suave/Bravo 150, Supreme 299, Duro/Del-Mar NULL); per-option availability
  (meats TRUE; veggies/seafood FALSE); authoritative omission at the route-equivalent
  layer.
- `verify_f2_upgrade.sh` (isolated DB): **ALL PASSED** — apply 0001–0004 first, then
  the **real runner** SKIPs those 4 and APPLYs only 0005/0006/0007; ledger = 0001..0007;
  Taco Suave data preserved (name/525/default/active); options expanded to five
  (steak/chicken preserved first); Suave double-meat 150 added; all five tacos present;
  runtime role read-only (SELECT ok incl. the new `category` column, writes denied,
  executed write rejected); a second runner run applies nothing.
- `verify_d4_endpoint.sh` (isolated DB): **ALL PASSED** (Feature-1 invariants hold on
  the 0001–0007 schema: index rejection, missing-default → 0 rows, happy path).
- `verify_c2_local.sh` (isolated DB): **ALL PASSED** (access control + runner
  idempotency on the full 0001–0007 order).

## Part 3 — stale assertions corrected (invariants preserved)
The intentional Taco Suave expansion (2 → 5 options, +150 double meat) invalidated some
hard-coded Feature-1 expectations in scripts that now provision 0001–0007:
- `verify_d4_endpoint.sh`: happy-path option assertion updated from `steak,chicken` to
  the five-option set; the exactly-one / 525 / index / 404 invariants are unchanged.
- `verify_c2_local.sh`: ledger/skip/apply counts updated from 4 to 7; the per-table
  read assertions relaxed from exact counts to "read succeeds (≥1 row)"; the
  default-variant price read now targets `taco-suave-base` by id (multiple active
  defaults now exist). All access-control invariants (SELECT works, writes/ledger/
  PUBLIC denied, anon/authenticated REVOKE) are unchanged.
- `verify_d2_mapper.mjs`: `row()` helper gained the two new columns; two cases added;
  existing cases unchanged.
- **Unchanged on purpose:** `verify_b1_b2.sh` and `verify_b3_seed.sh` apply only their
  own Feature-1 files (not the runner), so their 0004-scoped assertions remain valid.
  `verify_d3_timeout.mjs` / `verify_e_states.mjs` use local stubs (no catalog shape).

## Part 4 — example category JSON: provenance
The example category JSON shown in the previous turn's report was **generated by the
real `mapRowsToItem` over synthetic rows** (a small Node script feeding
representative rows into the compiled mapper). It was **not captured from an HTTP
response** and is **not** from a live Supabase query. The injected HTTP test
(`verify_f2_http.mjs`) separately confirms the route emits that same shape over real
HTTP with injected data.

## Part 5 — rollout dependency and order (for later review; NOT executed here)
**The updated backend REQUIRES migrations 0005–0007. Do NOT run the new backend code
against the old (pre-0005) schema** — `queryCategoryItemIds` reads `menu_item.category`,
the category route and mapper read `double_meat_available` /
`double_meat_price_delta_cents`; those columns do not exist until 0005/0006, so the
new code against the old schema would error (500s).

Exact order for the shared Supabase rollout (operator-run, later):
1. **Dry-run (read-only):**
   `DB_URL="postgresql://OPERATOR@POOLER_HOST:5432/postgres" server/migrations/run_migrations.sh --dry-run`
   Expect: 0001–0004 shown `SKIP (recorded)`, 0005/0006/0007 shown `APPLY`.
2. **Apply (operator):**
   `DB_URL="postgresql://OPERATOR@POOLER_HOST:5432/postgres" server/migrations/run_migrations.sh`
   Expect: 0005/0006/0007 applied atomically with their ledger rows; ledger = 0001..0007.
3. **Deploy/restart the backend** (build + restart Express) **only after** step 2
   succeeds, so the running code always matches a schema that has 0005–0007.
4. Backend is read-only; no data backfill needed beyond the seed in 0007.

Order summary: **migrate (0005→0006→0007) first, then restart the backend.** Never the
reverse. Rolling back the backend (to the pre-Feature-2 build) is safe against the
migrated schema because the new columns are additive and ignored by old code.

### Post-rollout follow-up (not now)
`verify_d1_connection.mjs` already expects the **post-0007 five-option catalog**
(five Taco Suave protein options in confirmed order, all `priceDeltaCents 0`,
`minSelect/maxSelect 1/1`, double-meat group delta 150, meats doubleable / grilled
veggies not). It therefore does **not** need another edit. Because it asserts the
post-0007 shape, it must only be run against a DB migrated **through 0007** — against
the current pre-rollout shared DB it would (correctly) fail. **After** the shared
rollout (step 2 above), it needs **execution** against the migrated shared DB — no
further code change. It was deliberately NOT run this turn (would touch shared
Supabase before rollout).


---

# Feature 2 — shared Supabase rollout: COMPLETED (user-executed)

The following were **performed by the user against the shared Supabase database** and
**reported with screenshots** as supporting evidence. They are recorded here as
**user-executed checks**, not assistant-run. The assistant did not access shared
Supabase.

## Migration apply + ledger (operator)
- Migrations **0005, 0006, 0007 applied successfully**; the ledger
  (`public.schema_migrations`) now contains **0001–0007**.
- A follow-up `run_migrations.sh --dry-run` **skipped all seven** (idempotent;
  nothing left to apply).

## Post-migration catalog (read-only SQL, operator)
- All **five tacos** returned with the expected **prices** (Suave/Duro/Bravo 525,
  Del Mar 675, Supreme 850), **selection limits** (min/max 1/1), **double-meat
  surcharges** (Suave/Bravo 150, Supreme 299; Duro/Del Mar none), and **option
  counts** (shared `protein` = 5; `protein-duro` = 2; `protein-seafood` = 2).

## Backend against the live DB (verified TLS)
- `npm run build` passed. `verify_d1_connection.mjs` passed against the shared DB:
  `current_user = wana_menu_app` — this confirms the **login identity** the app
  connects as (that it is the intended runtime login, not the operator). It does **not**
  by itself prove read-only access; the **read-only / least-privilege** evidence comes
  from the prior privilege-inspection and executed write-rejection tests (Phase F2
  anon probe + `verify_c2_local.sh`: `anon`/`PUBLIC`/`authenticated` and the runtime
  login are all denied INSERT/UPDATE/DELETE/TRUNCATE). The same run also observed **five
  ordered Taco Suave options**, **zero protein deltas**, **min/max 1/1**, **double-meat
  150**, **grilled veggies ineligible** for double meat, **unknown item → zero rows**, and
  the **pool closed cleanly**.

## Live category endpoint over local HTTP
- After `npm start`, the user opened the actual category endpoint in the browser and
  received **all five tacos in order** with the correct **extended JSON**
  (`doubleMeat` per group, `doubleMeatAvailable` per option).

## Two distinct connections (do not conflate)
This live check exercised **two separate hops**, and only the second uses the
verified-TLS Postgres connection:
1. **Browser → Express over local HTTP** (`http://localhost:<port>/api/menu/
   categories/original-tacos`). This hop is **plain local HTTP** on the loopback — it
   is *not* a TLS-to-Supabase connection and is not the subject of the
   `rejectUnauthorized: true` guarantee.
2. **Express → Supabase/PostgreSQL over verified TLS** (the `pg` pool in `db.ts`,
   `rejectUnauthorized: true`, project CA via `DB_CA_CERT`). This is the hop that
   reads the catalog and whose certificate chain is verified. `verify_d1_connection.mjs`
   confirmed the **login identity** (`current_user = wana_menu_app`); the **SELECT-only**
   property of that login is established by the privilege/write-rejection tests (Phase
   F2 + `verify_c2_local.sh`), not by the identity check alone.
So "the browser received the five tacos" demonstrates the end-to-end path, but the
**verified TLS** applies specifically to hop 2 (Express↔Supabase), not to hop 1
(browser↔Express).

## Status after rollout
- **Backend (Feature 2): verified end-to-end** — migrations applied + tracked,
  catalog correct, runtime read-only over verified TLS, and the live category
  endpoint returns the authoritative extended JSON.
- **Still INCOMPLETE:** all **frontend** work (reusable card, category hook, overlay,
  in-place swap, double-meat UI) and all **browser interaction** checks (keyboard,
  selection behavior, veggies-clears-double-meat, mobile). See the frontend handoff in
  `.kiro/specs/original-tacos-catalog/tasks.md` (Track F).


---

# Feature 2 — frontend (Original Tacos category UI): verification

Implemented under `src/` (Track F): single category fetch (`useOriginalTacos`),
reconcile-before-filter (`menuWithCategory`), reusable `MenuItemCard` (compact row +
expandable "Choose options", protein radios, optional double meat), stable ids in
`menu.js`, and category loading/error+Retry/empty notices on the Menu page. The old
per-item Taco Suave card/hook were removed (superseded).

**Presentation correction (this session):** when options add a surcharge, the row no
longer strikes out the base price. It shows two clearly labelled prices instead —
a quiet "Base $5.25" and a prominent "With options $6.75" — with the configured total
emphasised. The container wraps on narrow screens. The price calculation and the
base-price max-price filtering are unchanged (only the display changed); build/lint
re-run clean and the 17 tests still pass.

## Automated checks (actual results)
- `npm run build`: **clean**. `npm run lint`: **clean**.
- `node --test`: **17/17 passed**, including:
  - existing `menuExplorer.test.js` (filters) and `routes.test.js` (routing) — still green;
  - new `originalTacosMenu.test.js` — success reconciliation (API order, local
    image/popular preserved, matched by **id not name**), **authoritative omission**
    (API-omitted item dropped; no static fallback), non-success (loading/error/empty)
    excludes the category from filtering/counting while other categories stay intact,
    **max-price uses the API base price**, and count agreement;
  - new `configurePrice.test.js` — exactly-one/double-meat rules: double meat offered
    only when BOTH `doubleMeat` non-null AND option eligible; switching to veggies
    clears it; switching back to meat does NOT auto-enable; configured price = base +
    option delta + eligible checked surcharge (150/150/299; none for duro/del-mar).
- These are **pure-logic tests** run under Node's built-in test runner. The
  `MenuItemCard` component imports and calls the exact helpers under test
  (`configurePrice.js`), so this is not re-implemented/"mirrored" logic — but it is
  **not** a rendered-component or browser test (no DOM test tooling is installed).

## Frontend secret-leak scan (Feature 2 implementation) — CLEAN
Ran after a fresh `npm run build`, over `src/` and the production bundle `dist/`:
`grep` for connection strings (`postgres(ql)://`), `DATABASE_URL`, Supabase host
(`*.supabase.co/com`), `service_role`/`sb_secret`, anon/service JWTs (`eyJ…`),
`PGPASSWORD`, PEM private-key blocks, `DB_CA_CERT`, and the runtime role name
(`wana_menu_app`). **Result: CLEAN** — none present. (An initial broad grep matched
the substring "anon" inside minified React internals — a false positive, not a key.)
The frontend holds only the relative `/api` URL; no secret values are printed here.
This completes the frontend half of V2.

## Live HTTP wiring check (NOT browser rendering)
With both servers running (backend `:3001`, Vite `:5174`), the category request
**through the dev proxy** returned HTTP 200 with all five tacos in order and the
correct extended JSON (base prices 525/525/525/675/850; option counts 5/2/5/2/5;
doubleMeat 150/null/150/null/299). This confirms the end-to-end **data wiring** my UI
consumes. It is **HTTP/data verification only** — it does not exercise the rendered
DOM, expansion, keyboard, selection, or surcharge behavior.

## MANUAL browser checks — COMPLETED (user-performed, Safari, screenshots)
Performed by the user in Safari and reported with screenshots. These are
**user-performed browser checks** — NOT automated browser tests and NOT physical-phone
testing (the layout check was a narrow desktop window).
- [x] **Collapsed initial display + expansion:** rows render compact; "Choose options"
      is collapsed by default and expands on activation.
- [x] **Proteins initially unselected; exactly-one selection** per taco.
- [x] **Independent selections between tacos** (one taco's choice doesn't affect others).
- [x] **Selection preserved across collapse/reopen.**
- [x] **Double-meat totals:** Suave and Bravo total **$6.75** (525 + 150); Supreme
      totals **$11.49** (850 + 299).
- [x] **Veggies clears double meat** and its surcharge; switching back to a meat does
      **not** auto-re-enable it.
- [x] **Duro / Del Mar never offer double meat.**
- [x] **Search / filter / count** checks, including **max-price filtering on the base
      price**.
- [x] **Narrow desktop-window layout** (a resized window — not a physical phone).
- [x] **Keyboard:** Option+Tab navigation and Space selection for the protein radios
      and the double-meat checkbox.

## Category-state browser checks — COMPLETED (user-performed, Safari)
Observed by the user via the dev-only override below. User-performed Safari checks,
distinct from automated tests; narrow-window (not physical-phone) distinction preserved.
- [x] **loading → success:** loading displayed for about six seconds, then all five
      tacos appeared. (User-observed; **no loading screenshot** was captured.)
- [x] **successful empty `items: []`:** the empty-category notice displayed with **no
      static replacement tacos**. (Screenshot provided.)
- [x] **error → Retry → success:** error + Retry displayed, and the user reports Retry
      recovery worked. **Setup detail:** to obtain the error state the user closed and
      reopened the page after starting the override. (Recorded as the setup used; the
      underlying cause is not asserted here.)
- [x] **Revised price labels:** "Base $5.25" / "With options $6.75" are visible and
      correct. (Screenshot provided.)

### Local verification of category states (dev-only override; no Supabase change)
Uses the git-ignored `vite.override.config.mjs` (not committed, not imported by the
app, no production test switches). It intercepts ONLY
`GET /api/menu/categories/original-tacos` at the Vite dev-server layer; every other
request (other categories, Taco Suave item, assets) falls through to the normal proxy.
The HTTP behavior of each mode was confirmed this session; the browser rendering is
what remains to observe.

Startup (two terminals, from `restaurant-menu-integration/`):
```
# Terminal 1 — backend (reads server/.env, verified TLS to Supabase; read-only)
cd server && npm start           # http://localhost:3001

# Terminal 2 — frontend with ONE category override mode (pick one):
CATEGORY_OVERRIDE=loading npx vite --config vite.override.config.mjs
CATEGORY_OVERRIDE=empty   npx vite --config vite.override.config.mjs
CATEGORY_OVERRIDE=error   npx vite --config vite.override.config.mjs
```
Open the printed URL at `#/menu`, Original Tacos category. Expected browser results:
- **loading:** the "Loading Original Tacos…" notice shows for ~6s, then the five
  taco rows replace it (loading → success). Other categories render immediately.
- **empty:** the "No Original Tacos are available right now" notice shows (a valid
  200 `items: []`); every other category still renders and is usable.
- **error:** an error notice with a **Retry** button shows (other categories still
  usable); clicking **Retry** re-requests and the five taco rows load (the override
  fails only the first request, so Retry recovers without restarting anything).

#### Fix: category notice is visible regardless of search/price/popular filters
Earlier, `showTacosNotice` was additionally gated by "no text/price filter active",
which hid the loading/error/empty notice — and the **Retry** button during a failure —
whenever a search or maximum-price filter was on. Fixed: the notice now shows whenever
the **category selection is All or Original Tacos**, independent of search, maximum
price, or popular-only. It stays hidden for any other selected category. The notice
is a category-availability indicator, **separate from the matching-item count**
(`resultCount` is computed from `filteredMenu` only, which never contains the notice),
and unloaded/unavailable tacos remain excluded from results with no static fallback.

**Re-verify with an ACTIVE filter (browser, pending user observation):** set a search
term (e.g. "taco") or a maximum price, then exercise each override mode:
- loading → the notice shows **while the filter is active**, then resolves to the five
  tacos (which the filter then applies to);
- error → the notice **and Retry** show with the filter active; clicking Retry
  **preserves the current search/price/popular filters** (they are React state,
  untouched by Retry) and recovers to the filtered results;
- the "N matching items" count reflects only loaded, matching items — never the notice.

Cleanup afterward: stop the override dev server (Ctrl+C in Terminal 2) and return to
the normal `npm run dev` (committed `vite.config.js`, no override). The override file
is git-ignored; leave it in place or `rm vite.override.config.mjs` — neither affects
the repo. Its existing Taco Suave (`TACO_OVERRIDE`) modes are preserved.

HTTP-layer confirmation this session (NOT browser rendering): loading → ~6.6s then
200 with five items; empty → 200 `items: []`; error → 500 then a second request
(Retry) → 200 with five items.
