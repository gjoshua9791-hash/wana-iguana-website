# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# wana-iguana-website

## Project layout

- **Frontend** (this folder root): the React + Vite site. Run with `npm run dev`.
- **Backend** (`server/`): the Node + Express + TypeScript API that will serve menu
  data from PostgreSQL. See [`server/README.md`](server/README.md) for setup and the
  run instructions.

### Running the app locally (two terminals)

```bash
# Terminal 1 — frontend (from the repo root)
npm install
npm run dev            # Vite dev server, usually http://localhost:5173

# Terminal 2 — backend (from the server/ folder)
cd server
npm install
npm run dev            # Express API on http://localhost:3001
```

The frontend and backend run as **separate processes in separate terminals**. The
backend's health check is `GET http://localhost:3001/health` → `{"ok":true}`.
