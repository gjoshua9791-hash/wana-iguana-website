import express, { type Express, type Request, type Response } from 'express'
import { loadServerConfig } from './config.js'

/**
 * Wana Iguana backend — health server with environment configuration.
 *
 * Server configuration (the listening PORT) is resolved via `loadServerConfig`
 * from ./config. Database configuration is intentionally NOT loaded here: the
 * `/health` endpoint is database-independent and must start and respond with an
 * empty or missing `.env` (no DATABASE_URL required). Database config is read
 * lazily by `getDatabaseConfig` only from code paths that need the database
 * (added in later tasks).
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

  return app
}

loadDotEnvIfPresent()

const app = createApp()
const { port } = loadServerConfig()

app.listen(port, () => {
  console.log(`Wana Iguana backend listening on http://localhost:${port}`)
})
