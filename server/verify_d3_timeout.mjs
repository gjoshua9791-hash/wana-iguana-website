// D3 follow-up: a STALLED connection must yield the generic 500 within a bounded
// time. Controlled LOCAL fixture: a TCP server that accepts connections but never
// responds (black hole), so pg's connect stalls until connectionTimeoutMillis.
// Does not touch Supabase. Prints only safe results.
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const blackhole = net.createServer((sock) => { /* accept, never reply */ sock.on('error', () => {}) })
blackhole.listen(0, '127.0.0.1')
await once(blackhole, 'listening')
const stallPort = blackhole.address().port

const appPort = 4061
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://u:p@127.0.0.1:${stallPort}/postgres`,
  PORT: String(appPort),
}
delete env.DB_CA_CERT      // irrelevant; connection stalls before TLS
delete env.DB_CA_CERT_PEM

const child = spawn(process.execPath, ['dist/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
child.stdout.on('data', d => { serverLog += d })
child.stderr.on('data', d => { serverLog += d })

// wait for listen line
const started = Date.now()
while (!/listening on/.test(serverLog) && Date.now() - started < 5000) {
  await new Promise(r => setTimeout(r, 100))
}

let pass = 0, fail = 0
const ok = (m) => { console.log('PASS', m); pass++ }
const bad = (m) => { console.log('FAIL', m); fail++ }

// 1. /health works without a reachable DB
try {
  const h = await fetch(`http://127.0.0.1:${appPort}/health`)
  const hb = await h.json()
  if (h.status === 200 && hb.ok === true) ok('/health 200 with stalled DB'); else bad('/health unexpected ' + h.status)
} catch (e) { bad('/health error: ' + e.message) }

// 2. menu route returns 500 within a bounded time (< 8s given 5s timeout)
const t0 = Date.now()
try {
  const r = await fetch(`http://127.0.0.1:${appPort}/api/menu/items/taco-suave`)
  const elapsed = Date.now() - t0
  const body = await r.text()
  if (r.status === 500) ok(`menu route -> 500 (stalled DB) in ${elapsed}ms`); else bad(`status ${r.status} body ${body}`)
  if (body === '{"error":"internal_error"}') ok('generic internal_error body'); else bad('body: ' + body)
  if (elapsed < 8000) ok(`bounded time ${elapsed}ms (< 8000)`); else bad(`too slow: ${elapsed}ms`)
  // leak scan on body
  if (!/127\.0\.0\.1|postgres|password|select |\.ts:|at Object/i.test(body)) ok('no leak in 500 body'); else bad('leak in body')
} catch (e) { bad('menu route error: ' + e.message) }

// 3. sanitized server log must not contain a connection URI or password
if (!/postgresql:\/\/u:p@|:p@127\.0\.0\.1|password=/i.test(serverLog)) ok('server log sanitized (no URI/password)')
else bad('server log leaked connection string/password')

child.kill('SIGKILL')
blackhole.close()
console.log(`\nSUMMARY ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
