# Wana Iguana — Backend API

The backend lives here, separate from the React + Vite frontend in the repo root.
It is a **Node + Express + TypeScript** service. In later tasks it will serve menu
data from PostgreSQL (via a shared Supabase development project); for now it exposes a
single health check so we have a runnable, verifiable starting point.

## Requirements

- **Node.js `^20.19.0 || ^22.13.0 || >=24`.** Node 18 is **not** supported: the
  pinned ESLint 10 toolchain requires Node 20.19+, 22.13+, or 24+. Check with
  `node --version`.
- **Tested environment:** Node **v24.11.1**, npm **11.6.2** (the versions this
  milestone was built, linted, and run on).
- npm (bundled with Node).

## Setup

```bash
cd server
npm install            # installs dependencies and writes package-lock.json
cp .env.example .env   # optional for this milestone — /health needs no secrets
```

> The `/health` endpoint runs **without any database credentials**, so you can start
> the server immediately after `npm install`, even with an empty `.env`.

## Scripts

| Script          | What it does                                                        |
|-----------------|---------------------------------------------------------------------|
| `npm run dev`   | Runs the server from TypeScript with auto-reload (via `tsx watch`). |
| `npm run build` | Compiles TypeScript to JavaScript in `dist/` (via `tsc`).           |
| `npm start`     | Runs the compiled server (`node dist/index.js`). Build first.       |
| `npm run lint`  | Lints the TypeScript sources with ESLint.                           |

## Verifying the health check

With the server running (`npm run dev`, or `npm run build && npm start`):

```bash
curl -i http://localhost:3001/health
# HTTP/1.1 200 OK
# {"ok":true}
```

The port defaults to **3001** and can be changed with the `PORT` environment variable:

```bash
PORT=4000 npm run dev
```

## Running frontend + backend together (two terminals)

These are **two separate processes** — start each in its own terminal.

```bash
# Terminal 1 — frontend (from the repo root)
npm install
npm run dev            # Vite dev server, usually http://localhost:5173

# Terminal 2 — backend (from this server/ folder)
npm install
npm run dev            # Express API on http://localhost:3001
```

(A Vite dev proxy connecting the frontend's `/api` calls to this server is added in a
later task; it is not part of this first milestone.)

## Notes

- `node_modules/`, `dist/`, and real `.env` files are git-ignored. Only
  `.env.example` (placeholders only) is tracked.
- Database credentials, when added later, live **only** here on the server — never in
  the frontend and never prefixed with `VITE_`.
