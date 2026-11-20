// Read-only connection check for D1 against the configured database.
// Loads server/.env normally; NEVER inspects, prints, or copies its contents.
// Uses the real compiled db.ts pool + queryDefaultVariant().
// Prints only safe results; sanitizes any error (no connection string/secrets).

import { getPool, closePool } from './dist/db.js'
import { queryDefaultVariant } from './dist/menu/queries.js'

// Load server/.env into process.env (contents never read by this script).
try { process.loadEnvFile(new URL('./.env', import.meta.url)) } catch { /* ok if absent */ }

// Redact anything that could echo a secret/host from an error before printing.
function sanitize(err) {
  let msg = (err && err.message) ? err.message : String(err)
  const url = process.env.DATABASE_URL
  if (url) msg = msg.split(url).join('[DATABASE_URL]')
  // Strip any user:pass@host token and bare host:port that might appear.
  msg = msg
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[connection-uri]')
    .replace(/[A-Za-z0-9._-]+:\d{2,5}(?=[\s,).]|$)/g, '[host:port]')
  return msg
}

let failed = 0
const ok  = (m) => console.log('PASS', m)
const bad = (m) => { console.log('FAIL', m); failed = 1 }

try {
  // 1. current_user must be the runtime login wana_menu_app.
  const pool = getPool()
  const who = await pool.query('select current_user as u')
  const user = who.rows[0].u
  if (user === 'wana_menu_app') ok(`current_user = ${user}`)
  else bad(`current_user expected wana_menu_app, got '${user}'`)

  // 2. queryDefaultVariant('taco-suave') -> 2 option rows, price 525.
  const r = await queryDefaultVariant('taco-suave')
  const rows = r.rows
  const prices = [...new Set(rows.map(x => x.base_price_cents))]
  const opts = rows.map(x => x.option_id).filter(Boolean).sort()
  if (rows.length === 2) ok('queryDefaultVariant(taco-suave) returned 2 rows')
  else bad(`expected 2 rows, got ${rows.length}`)
  if (prices.length === 1 && prices[0] === 525) ok('base_price_cents = 525')
  else bad(`expected base_price_cents 525, got ${JSON.stringify(prices)}`)
  if (opts.join(',') === 'chicken,steak') ok(`option rows = ${opts.join(',')}`)
  else bad(`expected steak+chicken, got ${JSON.stringify(opts)}`)
  // group bounds sanity (min/max 1/1) without dumping full rows
  const bounds = [...new Set(rows.map(x => `${x.min_select}/${x.max_select}`))]
  if (bounds.length === 1 && bounds[0] === '1/1') ok('minSelect/maxSelect = 1/1')
  else bad(`expected 1/1, got ${JSON.stringify(bounds)}`)

  // 3. Unknown item -> zero rows.
  const none = await queryDefaultVariant('does-not-exist-xyz')
  if (none.rows.length === 0) ok('unknown item -> 0 rows')
  else bad(`unknown item expected 0 rows, got ${none.rows.length}`)
} catch (e) {
  const msg = sanitize(e)
  bad('connection/query error: ' + msg)
  if (/self-signed certificate in certificate chain|unable to (get|verify) local issuer/i.test(msg)) {
    console.log('HINT: verified TLS could not validate the server chain. Supabase\'s')
    console.log('      root CA is not in Node\'s trust store. Download the project CA')
    console.log('      cert (dashboard: Project Settings -> Database -> SSL certificate)')
    console.log('      and set DB_CA_CERT=/absolute/path/to/prod-ca.crt in server/.env.')
    console.log('      Do NOT set rejectUnauthorized:false. Re-run this check afterward.')
  }
} finally {
  // 4. Pool closes cleanly.
  try { await closePool(); ok('pool closed cleanly') }
  catch (e) { bad('closePool error: ' + sanitize(e)) }
}

console.log(failed === 0 ? '\nRESULT: CONNECTION CHECK PASSED' : '\nRESULT: FAILURES PRESENT')
process.exit(failed)
