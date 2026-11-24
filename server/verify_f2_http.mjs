// Feature 2 — HTTP tests of the ACTUAL mounted Express category route, over a
// real local TCP listener, using an INJECTED query seam (createCategoryRouter
// accepts fake query functions). These are INJECTED HTTP TESTS, NOT a database
// integration test and NOT a live Supabase connection: production db.ts and its
// verified TLS are never touched — the fakes return canned rows / throw. Real DB
// integration is covered separately by the isolated-DB shell harnesses.
//
// Run: node verify_f2_http.mjs   (from server/, after `npm run build`)
import http from 'node:http'
import express from 'express'
import { createCategoryRouter } from './dist/menu/categoryRouter.js'
import { createApp } from './dist/index.js'

let pass = 0, fail = 0
const ok  = (m) => { console.log('PASS', m); pass++ }
const bad = (m) => { console.log('FAIL', m); fail++ }

// ---- fake query layer (injected; no DB, no TLS) ----------------------------
const qr = (rows) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] })
const dvRow = (o) => ({
  item_id:o.item_id, item_name:o.item_name, description:o.description ?? null,
  variant_id:o.variant_id, base_price_cents:o.base_price_cents,
  group_id:o.group_id ?? null, label:o.label ?? null, min_select:o.min_select ?? null,
  max_select:o.max_select ?? null, group_sort:o.group_sort ?? null,
  double_meat_price_delta_cents:o.double_meat_price_delta_cents ?? null,
  option_id:o.option_id ?? null, option_name:o.option_name ?? null,
  price_delta_cents:o.price_delta_cents ?? null, option_sort:o.option_sort ?? null,
  double_meat_available:o.double_meat_available ?? null,
})

// Canned catalog: taco-suave (protein, 2 opts for brevity, double meat 150),
// taco-del-mar (seafood, no double meat), taco-ghost (listed but NO default
// variant -> resolves to zero rows -> omitted).
const CATALOG = {
  'original-tacos': ['taco-suave', 'taco-del-mar', 'taco-ghost'],
  'empty-cat': [],
}
const ITEM_ROWS = {
  'taco-suave': [
    dvRow({ item_id:'taco-suave', item_name:'Taco Suave', description:'d', variant_id:'taco-suave-base', base_price_cents:525,
      group_id:'protein', label:'Choose one', min_select:1, max_select:1, group_sort:1, double_meat_price_delta_cents:150,
      option_id:'steak', option_name:'Steak', price_delta_cents:0, option_sort:1, double_meat_available:true }),
    dvRow({ item_id:'taco-suave', item_name:'Taco Suave', description:'d', variant_id:'taco-suave-base', base_price_cents:525,
      group_id:'protein', label:'Choose one', min_select:1, max_select:1, group_sort:1, double_meat_price_delta_cents:150,
      option_id:'grilled-veggies', option_name:'Grilled Veggies', price_delta_cents:0, option_sort:5, double_meat_available:false }),
  ],
  'taco-del-mar': [
    dvRow({ item_id:'taco-del-mar', item_name:'Taco Del Mar', description:'d2', variant_id:'taco-del-mar-base', base_price_cents:675,
      group_id:'protein-seafood', label:'Choose one', min_select:1, max_select:1, group_sort:1, double_meat_price_delta_cents:null,
      option_id:'grilled-fish', option_name:'Grilled Fish', price_delta_cents:0, option_sort:1, double_meat_available:false }),
  ],
  'taco-ghost': [], // listed by id query but no active default variant -> omitted
}

const okDeps = {
  queryCategoryItemIds: async (cat) => qr((CATALOG[cat] ?? []).map((id) => ({ id }))),
  queryDefaultVariant:  async (id)  => qr(ITEM_ROWS[id] ?? []),
}
const failingDeps = {
  queryCategoryItemIds: async () => { throw new Error('boom: simulated DB failure') },
  queryDefaultVariant:  async () => qr([]),
}

// ---- start two real HTTP servers (injected app + the real createApp) -------
function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app)
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}
const appOk = express(); appOk.use(createCategoryRouter(okDeps))
const appFail = express(); appFail.use(createCategoryRouter(failingDeps))
const realApp = createApp() // real wiring incl. /health and the real category route

const sOk = await listen(appOk)
const sFail = await listen(appFail)
const sReal = await listen(realApp)
const base = (s) => `http://127.0.0.1:${s.address().port}`

async function getJson(url) {
  const r = await fetch(url)
  let body
  try { body = await r.json() } catch { body = null }
  return { status: r.status, body: body ?? null }
}

try {
  // 1. Original Tacos success + shape (ghost omitted)
  {
    const { status, body } = await getJson(`${base(sOk)}/api/menu/categories/original-tacos`)
    const ids = (body?.items ?? []).map(i => i.id)
    if (status === 200 && body.category === 'original-tacos') ok('success: 200 + category echoed')
    else bad(`success status/category: ${status}/${body?.category}`)
    if (JSON.stringify(ids) === JSON.stringify(['taco-suave','taco-del-mar'])) ok('success: items in order, ghost (no default variant) omitted')
    else bad(`success ids: ${JSON.stringify(ids)}`)
    const suave = body.items[0]
    const g = suave?.modifierGroups?.[0]
    const shapeOk = suave.variantId === 'taco-suave-base' && suave.basePriceCents === 525 &&
      g.id === 'protein' && g.minSelect === 1 && g.maxSelect === 1 &&
      JSON.stringify(g.doubleMeat) === JSON.stringify({ priceDeltaCents: 150 }) &&
      g.options[0].doubleMeatAvailable === true && g.options[1].doubleMeatAvailable === false
    if (shapeOk) ok('success: extended per-item shape (doubleMeat + doubleMeatAvailable) correct')
    else bad(`success shape: ${JSON.stringify(suave)}`)
    const dm = body.items[1]?.modifierGroups?.[0]?.doubleMeat
    if (dm === null) ok('success: Del Mar doubleMeat is null')
    else bad(`del mar doubleMeat: ${JSON.stringify(dm)}`)
  }

  // 2. Empty category -> 200 items: []
  {
    const { status, body } = await getJson(`${base(sOk)}/api/menu/categories/empty-cat`)
    if (status === 200 && Array.isArray(body.items) && body.items.length === 0) ok('empty category: 200 with items: []')
    else bad(`empty: ${status} ${JSON.stringify(body)}`)
  }

  // 3. Unknown category -> per spec (no 404): 200 with items: []
  {
    const { status, body } = await getJson(`${base(sOk)}/api/menu/categories/does-not-exist`)
    if (status === 200 && Array.isArray(body.items) && body.items.length === 0) ok('unknown category: 200 items: [] (spec: not 404 in this feature)')
    else bad(`unknown: ${status} ${JSON.stringify(body)}`)
  }

  // 4. Unavailable-item omission is covered by case 1 (taco-ghost omitted); assert again explicitly
  {
    const { body } = await getJson(`${base(sOk)}/api/menu/categories/original-tacos`)
    const hasGhost = (body?.items ?? []).some(i => i.id === 'taco-ghost')
    if (!hasGhost) ok('omission: item with no active default variant is absent from items')
    else bad('omission: ghost item leaked into items')
  }

  // 5. Query failure -> 500 generic body (no SQL/creds/stack)
  {
    const { status, body } = await getJson(`${base(sFail)}/api/menu/categories/original-tacos`)
    const generic = JSON.stringify(body) === JSON.stringify({ error: 'internal_error' })
    if (status === 500 && generic) ok('failure: 500 with generic {"error":"internal_error"}')
    else bad(`failure: ${status} ${JSON.stringify(body)}`)
  }

  // 6. /health remains DB-independent on the REAL app (no deps injected, no DB)
  {
    const { status, body } = await getJson(`${base(sReal)}/health`)
    if (status === 200 && body?.ok === true) ok('/health: 200 {"ok":true} on the real app (DB-independent)')
    else bad(`/health: ${status} ${JSON.stringify(body)}`)
  }
} finally {
  await new Promise(r => sOk.close(r))
  await new Promise(r => sFail.close(r))
  await new Promise(r => sReal.close(r))
}

console.log(`\nSUMMARY ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
