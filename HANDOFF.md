# Wana Iguana — Browser → Local Kiro IDE Handoff

This bundle transfers work-in-progress from the browser workspace into your existing
local repository. It contains **only** the backend scaffold, the feature spec
documents, and the updated root README. It does **not** contain frontend source,
dependencies, build output, git metadata, or any real secrets.

---

## ✅ Current status (local recreation complete — this milestone)

> This section reflects the **current state in the local repository** and supersedes
> the "Missing backend files" and "Outstanding verification" sections below, which are
> **retained as historical context** describing the browser-export state.

The two files that were missing from the browser export have been **recreated locally**
on `feature/taco-suave-menu-api`, consistent with the existing `server/tsconfig.json`,
`server/eslint.config.js`, `server/README.md`, and the approved spec:

- `server/package.json` — Express + TypeScript deps and `dev` / `build` / `start` /
  `lint` scripts.
- `server/src/index.ts` — the real Express app with `GET /health` (port **3001** by
  default, `PORT` override), with **no** database/Supabase wiring.

**Actual checks performed and passed (not a substitute server):**

- `cd server && npm install` → `server/package-lock.json` produced (0 vulnerabilities).
- `npm run build` → TypeScript compiled cleanly to `dist/`.
- `npm run lint` → 0 errors, 0 warnings.
- `npm start` (compiled `node dist/index.js`) → `curl -i http://localhost:3001/health`
  returned **HTTP 200** with `{"ok":true}` (served by Express; verified with no `.env`
  and no database credentials present).
- `PORT=4000 node dist/index.js` → `/health` served on 4000; port 3001 refused
  connections, confirming the override is honored by the real backend.
- Frontend re-checked: `npm run build` and `npm run lint` both pass. The root
  `eslint.config.js` now ignores `server/` so the root lint scans only the frontend;
  the backend keeps its own separate lint via `server/eslint.config.js`.

**Tested environment:** Node **v24.11.1**, npm **11.6.2**.

> **Node version correction:** the earlier "Node.js 18.18+" claim is **inaccurate**.
> The pinned ESLint 10 toolchain requires Node `^20.19.0 || ^22.13.0 || >=24`, so
> Node 18 is **not** supported. `server/package.json` `engines` and `server/README.md`
> have been updated accordingly.

The historical sections below describe the original browser-export handoff and are
kept for provenance.

---

## Source state (browser workspace)

- **Branch:** `feature/taco-suave-menu-api`
- **Base commit (HEAD at export time):** `9e228f986479e72175858717687e4b2a54028687`
  - _"Added the menu in a json format that allows for images to be added later..."_
- The branch was created from this commit; nothing was committed or pushed in the
  browser workspace. These files are still **uncommitted** there.

## How to apply this on your Mac (preserve your local uncommitted change)

Your local repo has an **uncommitted edit to `src/App.css`** that must be preserved.
This bundle contains **no `src/` files**, so unzipping it **cannot touch
`src/App.css`**. Suggested steps:

1. Confirm your local repo is on (or create) a branch for this work — e.g.
   `feature/taco-suave-menu-api`. Do **not** reset or discard; your `src/App.css`
   change stays in the working tree.
2. Unzip `wana-iguana-kiro-handoff.zip` at the **repository root** so relative paths
   land correctly (`server/...`, `.kiro/...`, `README.md`, `HANDOFF.md`).
3. The only root file overwritten is `README.md` (updated with a project-layout +
   two-terminal run note). Review the diff if you have local README edits.
4. Review with `git status` / `git diff` before staging. Nothing is auto-committed.

## Exported files (exactly what is in the ZIP)

```
HANDOFF.md                                        (this file)
README.md                                         (updated root readme)
server/.env.example                               (PLACEHOLDERS ONLY — no secrets)
server/.gitignore
server/README.md
server/eslint.config.js
server/tsconfig.json
.kiro/specs/taco-suave-menu-api/requirements.md
.kiro/specs/taco-suave-menu-api/design.md
.kiro/specs/taco-suave-menu-api/tasks.md
```

Relative paths and dotfiles (`.env.example`, `.gitignore`) are preserved.

### Deliberately excluded
`node_modules/`, `dist/`, `.git/`, any real `.env`/credentials, and **all frontend
source** (`src/`, `index.html`, `vite.config.js`, root `eslint.config.js`,
`package.json`, `package-lock.json`, `public/`). Excluding `src/` is what keeps your
local `src/App.css` change safe.

## ⚠️ Missing backend files (not regenerated for this export)

Two backend files authored earlier in the session are **not present on disk** in the
current browser workspace, so they are **not** in this ZIP (and were intentionally
**not** regenerated):

- `server/package.json` — dependencies + `dev` / `build` / `start` / `lint` scripts.
- `server/src/index.ts` — the Express app with `GET /health` (port 3001, `PORT`
  override).

**Consequence:** the exported `server/` is a *partial* scaffold (config + docs only).
Before the backend can build or run locally you must restore/recreate these two files
(e.g. re-author them in Kiro IDE, or recover them from an earlier version). The
intended contents are described in `.kiro/specs/taco-suave-menu-api/tasks.md`
(Task A2).

## Outstanding verification (NOT yet done)

The real Express backend has **not** been dependency-installed, built, linted, or run
anywhere. In the browser sandbox the npm registry was blocked (`403 Forbidden`,
`INTEGRATIONS_ONLY` network mode), so none of these could be performed. On your Mac,
after restoring the two missing files above, you still need to:

- [ ] `cd server && npm install` (produce `server/package-lock.json`)
- [ ] `npm run build` compiles cleanly (TypeScript → `dist/`)
- [ ] `npm run lint` passes
- [ ] `npm start` (after build) starts the server and
      `curl -i http://localhost:3001/health` returns **HTTP 200** with `{"ok":true}`
- [ ] Confirm the existing **frontend** still builds and lints
      (`npm install && npm run build && npm run lint` at the repo root)

### Note on the earlier "/health" check
During the session, the `/health` behavior was demonstrated with a **substitute
dependency-free Node `http` server** (because Express could not be installed in the
sandbox). That substitute is **not** a test of the actual Express application and
**must not** be counted as backend verification. The Express build/lint/runtime
checks above remain genuinely outstanding.

## What this handoff does NOT include / did NOT do

- No code was regenerated, implemented, or fixed for this export.
- No commit, no push, no branch reset.
- No Supabase resources, migrations, menu endpoint, or frontend changes.
