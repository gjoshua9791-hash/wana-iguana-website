// Read-only connection check against the configured database.
// Loads server/.env normally; NEVER inspects, prints, or copies its contents.
// Uses the real compiled db.ts pool + queryDefaultVariant() (verified TLS).
// Prints only safe results; sanitizes any error (no connection string/secrets).
//
// SCHEMA REQUIREMENT: this script and the Feature 2 backend expect the catalog
// MIGRATED THROUGH 0007 (0005 category columns, 0006 double-meat columns, 0007
// Original Tacos seed + Taco Suave expansion). Its assertions below reflect the
// POST-0007 catalog: Taco Suave has FIVE protein options, each priceDelta 0, with
// double-meat metadata (group delta 150; meats doubleable, grilled veggies not).
// Run it ONLY against a database already migrated through 0007. It is NOT run
// against shared Supabase until the 0005-0007 rollout has been applied there
// (see server/VERIFICATION.md "Part 5 — rollout dependency and order").

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

  // 2. queryDefaultVariant('taco-suave') -> POST-0007 shape: five protein options,
  //    price 525, min/max 1/1, zero protein surcharges, double-meat metadata.
  const r = await queryDefaultVariant('taco-suave')
  const rows = r.rows
  const prices = [...new Set(rows.map(x => x.base_price_cents))]
  // Rows arrive ordered by option_sort (query ORDER BY). Keep that order to check
  // the confirmed ordering, not just set membership.
  const optsInOrder = rows.map(x => x.option_id).filter(Boolean)
  const expOrder = ['steak', 'chicken', 'shredded-beef', 'shredded-chicken', 'grilled-veggies']
  if (rows.length === 5) ok('queryDefaultVariant(taco-suave) returned 5 option rows')
  else bad(`expected 5 rows, got ${rows.length}`)
  if (prices.length === 1 && prices[0] === 525) ok('base_price_cents = 525')
  else bad(`expected base_price_cents 525, got ${JSON.stringify(prices)}`)
  if (optsInOrder.join(',') === expOrder.join(',')) ok(`five options in confirmed order = ${optsInOrder.join(',')}`)
  else bad(`expected ${expOrder.join(',')}, got ${JSON.stringify(optsInOrder)}`)
  // Every protein option carries a ZERO surcharge.
  const deltas = [...new Set(rows.map(x => x.price_delta_cents).filter(v => v !== null && v !== undefined))]
  if (deltas.length === 1 && deltas[0] === 0) ok('all protein options priceDeltaCents = 0')
  else bad(`expected all deltas 0, got ${JSON.stringify(deltas)}`)
  // group bounds sanity (min/max 1/1) without dumping full rows
  const bounds = [...new Set(rows.map(x => `${x.min_select}/${x.max_select}`))]
  if (bounds.length === 1 && bounds[0] === '1/1') ok('minSelect/maxSelect = 1/1')
  else bad(`expected 1/1, got ${JSON.stringify(bounds)}`)
  // Double-meat metadata: per-item surcharge (group link) = 150 on every row.
  const dmDelta = [...new Set(rows.map(x => x.double_meat_price_delta_cents))]
  if (dmDelta.length === 1 && dmDelta[0] === 150) ok('double_meat_price_delta_cents = 150 (Taco Suave)')
  else bad(`expected double-meat delta 150, got ${JSON.stringify(dmDelta)}`)
  // Per-option availability: the four meats TRUE, grilled veggies FALSE.
  const avail = Object.fromEntries(rows.map(x => [x.option_id, x.double_meat_available]))
  const meatsOk = ['steak', 'chicken', 'shredded-beef', 'shredded-chicken'].every(id => avail[id] === true)
  if (meatsOk && avail['grilled-veggies'] === false) ok('double_meat_available: meats true, grilled veggies false')
  else bad(`unexpected double_meat_available map: ${JSON.stringify(avail)}`)

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
