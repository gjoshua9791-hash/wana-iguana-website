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

- No commit, push, or deploy performed in this documentation pass. No cart/ordering/
  Clover work.
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
