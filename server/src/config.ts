/**
 * Wana Iguana backend — environment configuration (Task A3).
 *
 * Two deliberately separate concerns:
 *
 *   1. SERVER config ({@link loadServerConfig}) — always available. Resolves the
 *      listening PORT. This has NO database dependency, so the server (and the
 *      `/health` endpoint) can start with an empty or missing `.env`.
 *
 *   2. DATABASE config ({@link getDatabaseConfig}) — resolved LAZILY, only when
 *      database functionality asks for it. Reading it is what throws when
 *      `DATABASE_URL` is missing or malformed. Because `/health` never calls it,
 *      the health endpoint stays database-independent (preserves A2's approved
 *      behavior).
 *
 * Security: configuration errors NEVER include the connection string or any
 * credential value in their message — only the variable name and the nature of
 * the problem. Database credentials live only here on the server, read from
 * `process.env`; they are never exposed to the frontend and must not use a
 * `VITE_`-prefixed name (Vite would inline such values into the browser bundle).
 *
 * This module does NOT import a database driver and does NOT open a connection;
 * it only reads and validates configuration from the environment.
 */

/** Default port when `PORT` is not set. */
export const DEFAULT_PORT = 3001

/** Always-available server configuration (no database required). */
export interface ServerConfig {
  readonly port: number
}

/** Resolved database configuration (only when DB features need it). */
export interface DatabaseConfig {
  /** A validated PostgreSQL connection URL (`postgres://` or `postgresql://`). */
  readonly databaseUrl: string
}

/**
 * Resolve server configuration from the environment.
 *
 * PORT rules:
 *   - unset / empty  -> {@link DEFAULT_PORT} (3001)
 *   - valid integer in [1, 65535] -> that port
 *   - anything else (non-numeric, out of range, non-integer) -> throws a clear
 *     error. Invalid input is rejected rather than silently defaulted, so a
 *     typo in PORT fails fast instead of starting on an unexpected port.
 */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return { port: resolvePort(env.PORT) }
}

/** Parse/validate PORT; throws on invalid non-empty values. */
export function resolvePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === '') {
    return DEFAULT_PORT
  }
  const trimmed = rawPort.trim()
  // Strict integer check: reject "80abc", "3.5", "-1", "0x10", " 80 "-with-junk.
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid PORT value: expected an integer between 1 and 65535. ` +
        `Set PORT to a valid port number or leave it unset to use ${DEFAULT_PORT}.`,
    )
  }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `Invalid PORT value: expected an integer between 1 and 65535. ` +
        `Set PORT to a valid port number or leave it unset to use ${DEFAULT_PORT}.`,
    )
  }
  return parsed
}

/**
 * Resolve database configuration from the environment.
 *
 * Call this ONLY from code paths that actually need the database. It throws a
 * clear, credential-free error when `DATABASE_URL` is missing or malformed.
 * It validates the URL shape only; it does NOT attempt a connection.
 *
 * Accepted: a non-empty URL whose scheme is `postgres://` or `postgresql://`
 * and which parses as a URL with a host.
 */
export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const raw = env.DATABASE_URL
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'Missing required environment variable DATABASE_URL. ' +
        'Set it to a PostgreSQL connection URL (postgres:// or postgresql://) ' +
        'in your server-side .env. See server/.env.example.',
    )
  }
  const value = raw.trim()

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    // Do not echo `value` — it may contain a password.
    throw new Error(
      'Invalid DATABASE_URL: value is not a valid URL. Expected a PostgreSQL ' +
        'connection URL such as postgresql://USER:PASSWORD@HOST:5432/DATABASE. ' +
        '(The provided value is not shown to avoid leaking credentials.)',
    )
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `Invalid DATABASE_URL: unsupported scheme "${parsed.protocol}". ` +
        'Expected postgres:// or postgresql://. ' +
        '(The full value is not shown to avoid leaking credentials.)',
    )
  }

  if (parsed.hostname === '') {
    throw new Error(
      'Invalid DATABASE_URL: missing host. Expected a PostgreSQL connection URL ' +
        'such as postgresql://USER:PASSWORD@HOST:5432/DATABASE. ' +
        '(The full value is not shown to avoid leaking credentials.)',
    )
  }

  return { databaseUrl: value }
}
