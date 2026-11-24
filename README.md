# Wana Iguana website

React and Vite frontend for the Wana Iguana senior project, with a Node + Express
+ TypeScript backend (`server/`) that serves menu data from PostgreSQL.

## Run locally

Install Node.js 24 (or another version supported by the locked Vite toolchain), then run:

```bash
npm ci
npm run dev
```

Vite prints a local URL. Before sharing changes, run `npm run lint` and `npm run build`.
Run the page-routing checks with `node --test src/utils/routes.test.js`.
Run the menu filter checks with `node --test src/utils/menuExplorer.test.js`.

### Running the frontend and backend together (two terminals)

The frontend and backend run as **separate processes in separate terminals**.

```bash
# Terminal 1 - frontend (from the repo root)
npm ci
npm run dev            # Vite dev server, usually http://localhost:5173

# Terminal 2 - backend (from the server/ folder)
cd server
npm ci
npm run dev            # Express API on http://localhost:3001
```

See [`server/README.md`](server/README.md) for full backend setup (environment
configuration, the dedicated read-only database login, verified TLS, and the
migration runner). Backend database credentials live only in a git-ignored
`server/.env`; never commit real secrets and never prefix DB variables with `VITE_`.

## What works today

### Frontend
- Four responsive views: Home, Menu, Assistant, and Account. Navigation uses hash URLs (`#/home`, `#/menu`, `#/assistant`, `#/account`) so direct links and browser Back work on static hosting without a new routing dependency.
- Home has the restaurant story below its name, the complete Wana Specials menu category, a past-orders empty state, and an unavailable Order again control until order history exists. The top navigation links to all views. The Assistant view is reserved for a future implementation.
- Account displays empty states for name, payment methods, notifications, order history, and settings; there is no sign-in or payment data collection yet.
- Menu search by item name, description or category, combined with a category selector, maximum price, and popular-only filter. Clear filters restores the original menu, and the existing empty state explains when nothing matches.
- The Menu view shows the original items and prices, including drinks and beer. Home also shows the existing Wana Specials menu category.
- Keyboard skip link, visible focus, image descriptions and reduced-motion support.
- The shared footer on every view includes the restaurant phone number and a directions link.

The menu in `src/data/menu.js` is **sample/static content**. Prices, photos, descriptions, phone and address must be checked with the restaurant before publishing. The Specials section points to the existing **Wana Specials menu category**; it does not claim that these are today's specials. Call the restaurant for current hours and specials. Beer is marked dine-in only in its category note.

### Backend
- A Node + Express + TypeScript API (`server/`). Health check: `GET http://localhost:3001/health` returns `{"ok":true}` (runs without any database configured).
- **Implemented, database-backed endpoint:** `GET /api/menu/items/:itemId` returns one menu item from PostgreSQL with its default-variant base price (integer cents), modifier groups, and options. Example: `GET /api/menu/items/taco-suave` returns `200` with the item JSON; a missing/inactive item (or one with no active default variant) returns `404 {"error":"item_not_found","itemId":"..."}`; a database failure returns `500 {"error":"internal_error"}` (no credentials, SQL, or stack traces exposed).
- The catalog schema, the at-most-one-active-default index, access-control policies, and the verified Taco Suave seed are applied via version-controlled SQL migrations (`server/migrations/`, applied with `server/migrations/run_migrations.sh`).

## Backend handoff / future work

The frontend currently does not accept orders, take payments, authenticate customers or manage staff changes. Home's Order again control stays disabled until a signed-in user's real order history and validated reorder flow exist. Do not store payment credentials in frontend state or source files; use the approved payment provider workflow. Do not display an active cart/checkout until the backend provides validated catalog choices, authoritative quotes, pickup availability and a tested Clover payment/kitchen workflow.

**API status.** The only implemented endpoint today is `GET /api/menu/items/:itemId` (above). The remaining endpoints are **proposed, not yet implemented**: `GET /api/v1/restaurant`, `GET /api/v1/menu`, and `GET /api/v1/specials`; the staff API will need authenticated authorization. (Note the implemented route is unversioned under `/api/menu/...`; aligning it with a future `/api/v1/...` scheme is an open decision for the backend/database owners.) Replace the static menu in one small integration after those contracts are agreed.

Before staging, obtain sponsor-approved prices, hours, photos and specials; confirm the correct ordering link; provide a stable HTTPS menu URL for a QR code. Check keyboard operation and small-phone layouts with restaurant staff.
