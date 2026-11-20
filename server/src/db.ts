import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { readFileSync } from 'node:fs'
import { getDatabaseConfig } from './config.js'

/**
 * Wana Iguana backend — Postgres access layer (Task D1).
 *
 * The connection pool is created LAZILY, on first use, from `getDatabaseConfig()`
 * (which reads `DATABASE_URL` server-side and throws a clear, credential-free
 * error if it is missing/malformed). Importing this module does NOT connect, so
 * the database-independent `/health` endpoint still works with no `DATABASE_URL`
 * configured — nothing here runs until a database feature calls `getPool()` or
 * `query()`.
 *
 * TLS: connections use verified TLS (`rejectUnauthorized: true`). Certificate
 * verification is NEVER disabled. The managed provider (Supabase) presents a
 * certificate chain that validates against the system trust store.
 *
 * The Express server connects as the dedicated least-privilege runtime login
 * (member of `menu_backend`): read-only access to the catalog. Credentials live
 * only in the server-side, git-ignored `.env` as `DATABASE_URL`.
 */

let pool: Pool | undefined

/**
 * Explicit, verified TLS configuration for all pool connections.
 *
 * `rejectUnauthorized: true` means the server certificate chain MUST validate.
 * An optional PEM bundle may be supplied via `DB_CA_CERT` (a file path) or
 * `DB_CA_CERT_PEM` (inline PEM) for providers whose intermediate/root CA is not
 * in Node's bundled trust store. We never set `rejectUnauthorized: false`.
 */
function buildTlsConfig(): { rejectUnauthorized: true; ca?: string } {
  const tls: { rejectUnauthorized: true; ca?: string } = { rejectUnauthorized: true }
  const caPath = process.env.DB_CA_CERT
  const caInline = process.env.DB_CA_CERT_PEM
  if (caInline && caInline.trim() !== '') {
    tls.ca = caInline
  } else if (caPath && caPath.trim() !== '') {
    // Lazy require so importing this module never touches the filesystem.
    tls.ca = readFileSync(caPath, 'utf8')
  }
  return tls
}

/**
 * Build discrete connection fields from the validated URL so that any SSL-related
 * query parameters in the connection string (e.g. `sslmode`) CANNOT override the
 * pool's explicit, verified TLS configuration. Only host/port/user/password/
 * database are taken from the URL; the `ssl` object below is authoritative.
 */
function connectionFieldsFromUrl(databaseUrl: string): {
  host: string
  port: number | undefined
  user: string | undefined
  password: string | undefined
  database: string | undefined
} {
  const u = new URL(databaseUrl)
  const database = u.pathname.replace(/^\//, '')
  return {
    host: u.hostname,
    port: u.port === '' ? undefined : Number(u.port),
    user: u.username === '' ? undefined : decodeURIComponent(u.username),
    password: u.password === '' ? undefined : decodeURIComponent(u.password),
    database: database === '' ? undefined : database,
  }
}

/** Create (once) and return the shared connection pool. */
export function getPool(): Pool {
  if (pool === undefined) {
    const { databaseUrl } = getDatabaseConfig()
    const fields = connectionFieldsFromUrl(databaseUrl)
    pool = new Pool({
      host: fields.host,
      port: fields.port,
      user: fields.user,
      password: fields.password,
      database: fields.database,
      // Fail fast instead of hanging when the server is unreachable/stalled, so
      // the route can return its generic 500 within a bounded time. 5s is a
      // reasonable development default.
      connectionTimeoutMillis: 5000,
      ssl: buildTlsConfig(),
    })
  }
  return pool
}

/**
 * Run a parameterized query against the pool.
 *
 * Always pass user-influenced values through `params` ($1, $2, …) — never string
 * -concatenate them into `text` — so the query is parameterized (no SQL injection).
 */
export function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, params ? [...params] : undefined)
}

/** Acquire a client for multi-statement work; caller MUST `release()` it. */
export function getClient(): Promise<PoolClient> {
  return getPool().connect()
}

/** Close the pool (e.g. on shutdown). No-op if it was never created. */
export async function closePool(): Promise<void> {
  if (pool !== undefined) {
    const p = pool
    pool = undefined
    await p.end()
  }
}

/**
 * Produce a SAFE, single-line description of a database error for server-side
 * logging. Logging on the server does NOT make a password or connection string
 * safe to write to logs, so this returns only the error name, message, and
 * (if present) a Postgres SQLSTATE `code`, with the configured connection string
 * and any embedded password redacted from the text.
 */
export function sanitizeDbError(err: unknown): string {
  const e = err as { name?: string; message?: string; code?: string } | null
  const name = (e && e.name) || 'Error'
  let message = (e && e.message) || String(err)
  const code = e && typeof e.code === 'string' ? ` code=${e.code}` : ''

  const url = process.env.DATABASE_URL
  if (url) message = message.split(url).join('[DATABASE_URL]')
  // Redact any postgres URI and any user:pass@host token that might appear.
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[connection-uri]')
    .replace(/\/\/[^\s:@/]+:[^\s:@/]+@/g, '//[redacted]@')
  return `${name}${code}: ${message}`
}
