# Verification — Phase E (in-place React display) in the integration worktree

Worktree: `restaurant-menu-integration` · Branch: `integration/frontend-backend`
Scope: **E1–E4**. Phase F manual DB-edit proofs were not performed (no Supabase
rows were mutated).

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
from the app, adds NO test code to the production app, and does NOT touch Supabase.
The real page, hook, and component ran unchanged.

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

## Explicitly NOT done (per instructions)
- No Supabase rows edited (F1 row/price/option DB-change proofs remain manual).
- No commit, push, or deploy. No cart/ordering/Clover work.
