# Wana Iguana — Backend API

The backend lives here, separate from the React + Vite frontend in the repo root.
It is a **Node + Express + TypeScript** service that serves one menu item from
PostgreSQL (a shared Supabase development project) through
`GET /api/menu/items/:itemId`, plus a database-independent `GET /health`.

This guide gets a teammate from a fresh clone to a working **Taco Suave** card in
the browser. It assumes you have cloned the repo and can obtain the shared runtime
credentials privately (see [Credentials](#4-obtain-backend-runtime-credentials-privately)).

> **Never commit `.env`.** Only `.env.example` (placeholders) is tracked. Real
> credentials live only in your local `server/.env`, which is git-ignored. Note that
> git-ignore only **reduces the risk** of an accidental commit — it does not make
> committing a secret impossible (a secret can still be force-added, pasted into a
> tracked file, or printed to a log), so stay deliberate with credentials. Keep
> credentials off the frontend and never prefix a database variable with `VITE_`
> (Vite would inline it into the browser bundle).

---

## 1. Prerequisites and dependencies (committed lockfiles)

- **Node.js `^20.19.0 || ^22.13.0 || >=24`.** Node 18 is **not** supported (the
  pinned ESLint 10 toolchain needs 20.19+, 22.13+, or 24+). Check: `node --version`.
- **Tested on:** Node **v24.11.1**, npm **11.6.2**.

Install dependencies from the **committed lockfiles** with `npm ci` (reproducible,
lockfile-exact) in **both** the frontend and the backend:

```bash
# Frontend (repo root)
npm ci

# Backend (this folder)
cd server
npm ci
```

Use `npm ci`, not `npm install`, so you get exactly the locked versions and do not
rewrite `package-lock.json`.

## 2. Work from the integration branch

This feature is developed on **`integration/frontend-backend`**. Make sure you are on
it before running or editing:

```bash
git checkout integration/frontend-backend
git pull            # fast-forward to the latest reviewed work
```

## 3. Create your ignored `server/.env` from the example

```bash
cd server
cp .env.example .env
```

`server/.env` is git-ignored (see `server/.gitignore`). Fill it in with the values
from the next step. `.env.example` holds placeholders only — keep real values out of
it.

## 4. Obtain backend runtime credentials privately

Two **separate** credentials exist; as a teammate running the app you need only the
**runtime** one:

| Credential | Who uses it | For |
|------------|-------------|-----|
| **Runtime login** (`wana_menu_app`, inherits `menu_backend`) | the Express app | **SELECT-only** catalog reads — this is what you put in `server/.env` |
| **Migration operator** (`postgres`) | the person applying migrations | owns tables + ledger; **not** needed to start the app |

Get the runtime connection string **out of band** (e.g. the team password manager) —
never from Git, chat, or screenshots. Put it in `server/.env` as `DATABASE_URL`:

```
# server/.env  (git-ignored — never commit)
DATABASE_URL=postgresql://wana_menu_app.PROJECT_REF:RUNTIME_PASSWORD@POOLER_HOST:5432/postgres
```

For the Supabase **Session pooler**, the username is `wana_menu_app.PROJECT_REF`
(the pooler routes by project reference) and the port is `5432`. Use the pooler
host from the dashboard if a direct connection is blocked on your network.

### CA certificate (verified TLS)

Connections use **verified TLS** — certificate verification is never disabled
(`rejectUnauthorized: true` in `src/db.ts`). Node's bundled trust store validates
most hosts. If your host's CA is not in that store, supply the project CA
certificate and point the app at it in `server/.env`:

```
# Either a path to a PEM file...
DB_CA_CERT=/absolute/path/to/supabase-ca.crt
# ...or the PEM inline (takes precedence if both are set):
# DB_CA_CERT_PEM="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

Obtain the CA file privately like the connection string. Do **not** work around a
TLS error by weakening verification — supplying the correct CA is the fix.

## 5. Start the backend and frontend (two terminals)

These are two separate processes; start each in its own terminal.

```bash
# Terminal 1 — backend (server/ folder)
cd server
npm run dev            # Express API on http://localhost:3001 (tsx watch)
#   or: npm run build && npm start   (compiled)

# Terminal 2 — frontend (repo root)
npm run dev            # Vite dev server, usually http://localhost:5173
```

The Vite dev server **proxies** the frontend's relative `/api` calls to the Express
server on `:3001` (path preserved, no rewrite — see `vite.config.js`), so the browser
calls `/api/...` and never needs the backend's address or any credential.

## 6. Expected results

Health (no database needed):

```bash
curl -i http://localhost:3001/health
# HTTP/1.1 200 OK
# {"ok":true}
```

The menu item (needs `DATABASE_URL` configured):

```bash
curl -s http://localhost:3001/api/menu/items/taco-suave
# 200 {"id":"taco-suave","name":"Taco Suave","description":"...","variantId":
#      "taco-suave-base","basePriceCents":525,"modifierGroups":[{"id":"protein",
#      "label":"Choose one","minSelect":1,"maxSelect":1,"options":[
#      {"id":"steak","name":"Steak","priceDeltaCents":0},
#      {"id":"chicken","name":"Chicken","priceDeltaCents":0}]}]}

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/menu/items/does-not-exist
# 404   {"error":"item_not_found","itemId":"does-not-exist"}
```

Through the proxy (frontend running), the same relative URL works:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/menu/items/taco-suave
# 200
```

In the browser, open `http://localhost:5173/#/menu` — **Taco Suave** appears once in
**Original Tacos** at **$5.25**, with a "Choose one" Steak/Chicken selector.

### Common connection errors

| Symptom | Likely cause / fix |
|---------|--------------------|
| `/health` works but `/api/menu/items/taco-suave` → **500** `{"error":"internal_error"}` | `DATABASE_URL` missing/wrong, DB unreachable, or TLS chain not trusted. Check `server/.env`; supply `DB_CA_CERT` if the CA is untrusted. The server log is sanitized (no credentials). |
| Browser shows the **error + Retry** card | The backend is down or the proxy target is wrong. Start/restart the backend on `:3001`; the proxy returns 502 while it is down. |
| Startup error about **`DATABASE_URL`** | It is unset/malformed. `/health` still runs without it; the menu route needs a valid `postgres://`/`postgresql://` URL. |
| Startup error about **`PORT`** | `PORT` must be an integer 1–65535 or unset (defaults to 3001); an invalid value is rejected (no silent fallback). |
| Self-signed / certificate errors | Your host's CA is not trusted. Provide the correct CA via `DB_CA_CERT` / `DB_CA_CERT_PEM`. Do not disable verification. |

## 7. Application startup vs. operator-only migrations

**Starting the app does NOT apply migrations, and you must not run them just to get
the app running.** The shared database schema and seed are **already applied**. The
runtime login (`wana_menu_app`) is SELECT-only and cannot change the schema.

- **Teammates / app startup:** steps 1–6 above. Read-only. No migrations.
- **Operators only:** applying or inspecting migrations against the shared database is
  a deliberate, separate action performed by the migration **operator** (`postgres`),
  using the tracked runner. See [`migrations/README.md`](./migrations/README.md). The
  runner records a ledger (`public.schema_migrations`) and **skips already-applied
  migrations**; `--dry-run` previews the plan read-only. Do **not** re-run shared
  migrations to "set up" your environment — they are one-time and non-idempotent, and
  the ledger will reject a second run.

If you need a database to experiment against, use a **disposable, isolated** local
database and apply the migrations there (see the migrations README), never the shared
dev catalog.

## 8. Scripts

| Script          | What it does                                                        |
|-----------------|---------------------------------------------------------------------|
| `npm run dev`   | Runs the server from TypeScript with auto-reload (`tsx watch`).     |
| `npm run build` | Compiles TypeScript to `dist/` (`tsc`).                             |
| `npm start`     | Runs the compiled server (`node dist/index.js`). Build first.       |
| `npm run lint`  | Lints the TypeScript sources with ESLint.                           |

## 9. Configuration reference

Read from the environment (a server-side `.env`, loaded via Node's built-in
`process.loadEnvFile()`). See [`.env.example`](./.env.example).

- **Server config (always available, no database).** `PORT` — optional, defaults to
  **3001**; a valid integer 1–65535 overrides it; an invalid value is rejected at
  startup.
- **Database config (used only by the menu route).** `DATABASE_URL` — a
  `postgres://`/`postgresql://` URL for the **runtime** login, read lazily so
  `/health` runs without it. Optional `DB_CA_CERT` (path) or `DB_CA_CERT_PEM` (inline)
  for verified TLS. All server-side only; never `VITE_`-prefixed; never in the
  frontend. A missing/malformed value yields a clear error that never prints the
  credential.

## Notes

- `node_modules/`, `dist/`, and real `.env` files are git-ignored. Only `.env.example`
  (placeholders) is tracked.
- Database credentials live **only** here on the server — never in the frontend and
  never `VITE_`-prefixed. The browser talks only to the relative `/api` URL.
