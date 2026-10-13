import express, { type Express, type Request, type Response } from 'express'

/**
 * Wana Iguana backend — minimal health server (Tasks A1 + A2).
 *
 * This first milestone deliberately has NO database wiring: the `/health`
 * endpoint responds purely from the web server, so a teammate can start it and
 * verify it with an empty (or missing) `.env`. No Supabase credentials are read
 * or required here. Database access is introduced in later tasks.
 */

/** Default port when `PORT` is not set in the environment. */
const DEFAULT_PORT = 3001

/**
 * Resolve the listening port from `process.env.PORT`, falling back to
 * {@link DEFAULT_PORT}. A missing or non-numeric value yields the default.
 */
function resolvePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === '') {
    return DEFAULT_PORT
  }
  const parsed = Number(rawPort)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return DEFAULT_PORT
  }
  return parsed
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

const app = createApp()
const port = resolvePort(process.env.PORT)

app.listen(port, () => {
  console.log(`Wana Iguana backend listening on http://localhost:${port}`)
})
