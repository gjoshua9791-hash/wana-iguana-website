/*
 * HTTP→state mapping check for the frontend's four states (supports E2).
 *
 * IMPORTANT: this does NOT exercise the React hook, the rendered component, or the
 * Retry button. It starts a throwaway HTTP stub (NOT Supabase, NOT the real server)
 * and runs a MIRROR of the useTacoSuave branching to confirm each HTTP outcome
 * would map to the intended state. Verifying the actual rendered loading / error /
 * not-found states and the Retry button requires a browser check (see
 * server/VERIFICATION.md). No database row is mutated.
 *
 * Run: node verify_e_states.mjs   (from server/)
 */
import http from 'node:http'

// Mirror of the hook's branching (useTacoSuave.js) so we test the exact contract.
async function resolveState(url) {
  try {
    const response = await fetch(url)
    if (response.status === 404) return 'notFound'
    if (!response.ok) return 'error'
    await response.json()
    return 'success'
  } catch {
    return 'error'
  }
}

function startStub(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler)
    server.listen(0, () => resolve({ server, port: server.address().port }))
  })
}

const cases = [
  {
    name: '200 OK  → success',
    handler: (_r, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'taco-suave', name: 'Taco Suave', basePriceCents: 525, modifierGroups: [] })) },
    expect: 'success',
  },
  {
    name: '404     → notFound',
    handler: (_r, res) => { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'item_not_found', itemId: 'taco-suave' })) },
    expect: 'notFound',
  },
  {
    name: '500     → error (retryable)',
    handler: (_r, res) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'internal_error' })) },
    expect: 'error',
  },
  {
    name: 'connection refused → error (retryable)',
    handler: null, // no server; fetch an unused port
    expect: 'error',
  },
]

let failures = 0
for (const c of cases) {
  let url
  let server
  if (c.handler) {
    const started = await startStub(c.handler)
    server = started.server
    url = `http://127.0.0.1:${started.port}/api/menu/items/taco-suave`
  } else {
    url = 'http://127.0.0.1:59999/api/menu/items/taco-suave' // nothing listening
  }
  const got = await resolveState(url)
  const ok = got === c.expect
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (got "${got}")`)
  if (server) await new Promise(r => server.close(r))
}

console.log(failures === 0 ? '\nAll state mappings correct.' : `\n${failures} mapping(s) wrong.`)
process.exit(failures === 0 ? 0 : 1)
