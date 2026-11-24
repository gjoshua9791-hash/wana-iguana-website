import express, { type Express, type Request, type Response } from 'express'
import { pathToFileURL } from 'node:url'
import { loadServerConfig } from './config.js'
import { createMenuRouter } from './menu/router.js'
import { createCategoryRouter } from './menu/categoryRouter.js'

/**
 * Wana Iguana backend — health server with environment configuration.
 *
 * Server configuration (the listening PORT) is resolved via `loadServerConfig`
 * from ./config. Database configuration is intentionally NOT loaded here: the
 * `/health` endpoint is database-independent and must start and respond with an
 * empty or missing `.env` (no DATABASE_URL required). Database config is read
 * lazily by `getDatabaseConfig` only from code paths that need the database.
 * The menu route (`/api/menu/items/:itemId`) uses that lazy pool, so mounting it
 * does NOT connect at startup and `/health` stays database-independent.
 */

/**
 * Optionally load a server-side `.env` into process.env, if present.
 *
 * Uses Node's built-in `process.loadEnvFile()` (no third-party dependency).
 * A missing `.env` is non-fatal — the server (and `/health`) must still run,
 * which keeps the health endpoint usable with no environment file at all.
 */
function loadDotEnvIfPresent(): void {
  try {
    // Available on the project's supported Node versions; reads ./.env relative
    // to the process CWD (the server/ folder when run via its npm scripts).
    process.loadEnvFile()
  } catch {
    // No .env file (or unreadable) — fine for this milestone; defaults apply.
  }
}

/** Build the Express application with its routes registered. */
export function createApp(): Express {
  const app = express()

  // Health check: no database or Supabase credentials involved.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true })
  })

  // Database-backed menu routes. Both use the lazy pool, so mounting them here
  // does not open a connection; /health above remains usable without a configured
  // DB. The single-item router (Feature 1) and the category router (Feature 2) are
  // separate files; the single-item route's contract/behavior is unchanged.
  app.use(createMenuRouter())
  app.use(createCategoryRouter())

  return app
}

/**
 * Start the server only when this module is run directly (the normal entry
 * point), not when it is imported (e.g. by an HTTP test that reuses
 * {@link createApp}). This preserves production behavior — `node dist/index.js`
 * still loads `.env`, resolves PORT, and listens — while allowing tests to import
 * `createApp` without binding a port or loading `.env` as a side effect.
 */
function startServer(): void {
  loadDotEnvIfPresent()
  const app = createApp()
  const { port } = loadServerConfig()
  app.listen(port, () => {
    console.log(`Wana Iguana backend listening on http://localhost:${port}`)
  })
}

// `process.argv[1]` is the script node was invoked with. When this compiled file
// is the entry point (`node dist/index.js`), start listening; when imported
// (e.g. by a test), do nothing at module load.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer()
}
