// Feature 3 — HTTP tests of the ACTUAL mounted Express category route, over a
// real local TCP listener, using an INJECTED query seam (createCategoryRouter
// accepts fake query functions). These are INJECTED HTTP TESTS, NOT a database
// integration test and NOT a live Supabase connection: production db.ts and its
// verified TLS are never touched — the fakes return canned rows. Real DB
// integration (schema + seed) is covered by the isolated-DB shell harness
// verify_f3_burritos.sh.
//
// Focus: the Burrito contract shape through the real route + mapper —
//   * an item with MULTIPLE modifier groups (protein + wet) in sort order,
//   * per-option `doublePortion` ({priceDeltaCents} for meats/seafood, null for
//     veggies/none/extra/wet),
//   * the precedence/coexistence invariant: a burrito group carries
//     doubleMeat=null while its options carry doublePortion, and an existing
//     TACO still carries doubleMeat + doubleMeatAvailable with doublePortion=null.
//
// Run: node verify_f3_http.mjs   (from server/, after `npm run build`)
import http from 'node:http'
import express from 'express'
import { createCategoryRouter } from './dist/menu/categoryRouter.js'

let pass = 0, fail = 0
const ok  = (m) => { console.log('PASS', m); pass++ }
const bad = (m) => { console.log('FAIL', m); fail++ }

// ---- fake query layer (injected; no DB, no TLS) ----------------------------
const qr = (rows) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] })
// Row builder mirrors DefaultVariantRow incl. the Feature-3 column.
const dvRow = (o) => ({
  item_id:o.item_id, item_name:o.item_name, description:o.description ?? null,
  variant_id:o.variant_id, base_price_cents:o.base_price_cents,
  group_id:o.group_id ?? null, label:o.label ?? null, min_select:o.min_select ?? null,
  max_select:o.max_select ?? null, group_sort:o.group_sort ?? null,
  double_meat_price_delta_cents:o.double_meat_price_delta_cents ?? null,
  option_id:o.option_id ?? null, option_name:o.option_name ?? null,
  price_delta_cents:o.price_delta_cents ?? null, option_sort:o.option_sort ?? null,
  double_meat_available:o.double_meat_available ?? null,
  double_portion_price_delta_cents:o.double_portion_price_delta_cents ?? null,
})

// Canned Burrito catalog:
//   burrito-grande : Group A protein (required 1/1, steak/veggies shown) at sort 1
//                    + wet upgrade (optional 0/1) at sort 2. Protein group
//                    double_meat=NULL; steak has doublePortion 299, veggies null.
//   classic-burrito: optional classic-protein (0/1) with steak +299/dbl299,
//                    veggies +250/null, grilled-shrimp +349/dbl349; + wet.
//   burrito-del-mar: optional delmar-extra (+349, not doubleable) + wet.
//   taco-suave     : an EXISTING taco (protein group with group-level doubleMeat
//                    150, per-option doubleMeatAvailable) to prove coexistence.
const CATALOG = { burritos: ['burrito-grande', 'classic-burrito', 'burrito-del-mar'], 'original-tacos': ['taco-suave'] }

const grandeProtein = (opt) => dvRow({
  item_id:'burrito-grande', item_name:'Burrito Grande', description:'d', variant_id:'burrito-grande-base', base_price_cents:1349,
  group_id:'burrito-protein', label:'Choose one', min_select:1, max_select:1, group_sort:1, double_meat_price_delta_cents:null, ...opt })
const grandeWet = dvRow({
  item_id:'burrito-grande', item_name:'Burrito Grande', description:'d', variant_id:'burrito-grande-base', base_price_cents:1349,
  group_id:'wet-upgrade', label:'Make it wet?', min_select:0, max_select:1, group_sort:2, double_meat_price_delta_cents:null,
  option_id:'wet', option_name:'Wet', price_delta_cents:429, option_sort:1, double_meat_available:false, double_portion_price_delta_cents:null })

const classicRow = (opt) => dvRow({
  item_id:'classic-burrito', item_name:'Classic Burrito', description:'d', variant_id:'classic-burrito-base', base_price_cents:929,
  group_id:'classic-protein', label:'Add a protein?', min_select:0, max_select:1, group_sort:1, double_meat_price_delta_cents:null, ...opt })

const ITEM_ROWS = {
  'burrito-grande': [
    grandeProtein({ option_id:'burrito-steak',           option_name:'Steak',           price_delta_cents:0, option_sort:1, double_meat_available:false, double_portion_price_delta_cents:299 }),
    grandeProtein({ option_id:'burrito-grilled-veggies', option_name:'Grilled Veggies', price_delta_cents:0, option_sort:5, double_meat_available:false, double_portion_price_delta_cents:null }),
    grandeWet,
  ],
  'classic-burrito': [
    classicRow({ option_id:'classic-grilled-veggies', option_name:'Grilled Veggies', price_delta_cents:250, option_sort:1, double_meat_available:false, double_portion_price_delta_cents:null }),
    classicRow({ option_id:'classic-steak',           option_name:'Steak',           price_delta_cents:299, option_sort:2, double_meat_available:false, double_portion_price_delta_cents:299 }),
    classicRow({ option_id:'classic-grilled-shrimp',  option_name:'Grilled Shrimp',  price_delta_cents:349, option_sort:7, double_meat_available:false, double_portion_price_delta_cents:349 }),
  ],
  'burrito-del-mar': [
    dvRow({ item_id:'burrito-del-mar', item_name:'Burrito Del Mar', description:'d', variant_id:'burrito-del-mar-base', base_price_cents:1599,
      group_id:'delmar-extra', label:'Add an extra portion?', min_select:0, max_select:1, group_sort:1, double_meat_price_delta_cents:null,
      option_id:'extra-shrimp', option_name:'Extra shrimp', price_delta_cents:349, option_sort:1, double_meat_available:false, double_portion_price_delta_cents:null }),
  ],
  'taco-suave': [
    dvRow({ item_id:'taco-suave', item_name:'Taco Suave', description:'d', variant_id:'taco-suave-base', base_price_cents:525,
      group_id:'protein', label:'Choose one', min_select:1, max_select:1, group_sort:1, double_meat_price_delta_cents:150,
      option_id:'steak', option_name:'Steak', price_delta_cents:0, option_sort:1, double_meat_available:true, double_portion_price_delta_cents:null }),
  ],
}

const okDeps = {
  queryCategoryItemIds: async (cat) => qr((CATALOG[cat] ?? []).map((id) => ({ id }))),
  queryDefaultVariant:  async (id)  => qr(ITEM_ROWS[id] ?? []),
}

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app)
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}
const appOk = express(); appOk.use(createCategoryRouter(okDeps))
const sOk = await listen(appOk)
const base = (s) => `http://127.0.0.1:${s.address().port}`

async function getJson(url) {
  const r = await fetch(url)
  let body
  try { body = await r.json() } catch { body = null }
  return { status: r.status, body: body ?? null }
}

try {
  const { status, body } = await getJson(`${base(sOk)}/api/menu/categories/burritos`)
  const byId = Object.fromEntries((body?.items ?? []).map(i => [i.id, i]))

  // 1. Category success + order.
  const ids = (body?.items ?? []).map(i => i.id)
  if (status === 200 && body.category === 'burritos' &&
      JSON.stringify(ids) === JSON.stringify(['burrito-grande','classic-burrito','burrito-del-mar']))
    ok('burritos: 200, category echoed, items in order')
  else bad(`burritos list: ${status} ${JSON.stringify(ids)}`)

  // 2. Regular burrito (Group A) has TWO groups in sort order: protein then wet.
  {
    const g = byId['burrito-grande']
    const groupIds = (g?.modifierGroups ?? []).map(x => x.id)
    if (g?.basePriceCents === 1349 && JSON.stringify(groupIds) === JSON.stringify(['burrito-protein','wet-upgrade']))
      ok('grande: two groups [burrito-protein, wet-upgrade] in sort order')
    else bad(`grande groups: base=${g?.basePriceCents} ids=${JSON.stringify(groupIds)}`)

    const protein = g?.modifierGroups?.[0]
    // burrito protein group: group-level doubleMeat is null (burritos don't use it).
    if (protein?.doubleMeat === null && protein?.minSelect === 1 && protein?.maxSelect === 1)
      ok('grande: protein group required 1/1 with doubleMeat=null (taco field unused)')
    else bad(`grande protein grp: ${JSON.stringify({ dm: protein?.doubleMeat, min: protein?.minSelect, max: protein?.maxSelect })}`)

    const steak = protein?.options?.find(o => o.id === 'burrito-steak')
    const veg = protein?.options?.find(o => o.id === 'burrito-grilled-veggies')
    if (JSON.stringify(steak?.doublePortion) === JSON.stringify({ priceDeltaCents: 299 }) &&
        steak?.doubleMeatAvailable === false)
      ok('grande: steak doublePortion {299}, doubleMeatAvailable=false')
    else bad(`grande steak: ${JSON.stringify(steak)}`)
    if (veg?.doublePortion === null) ok('grande: grilled veggies doublePortion=null (not doubleable)')
    else bad(`grande veggies doublePortion: ${JSON.stringify(veg?.doublePortion)}`)

    const wet = g?.modifierGroups?.[1]?.options?.[0]
    if (wet?.id === 'wet' && wet?.priceDeltaCents === 429 && wet?.doublePortion === null)
      ok('grande: wet +429, doublePortion=null')
    else bad(`grande wet: ${JSON.stringify(wet)}`)
  }

  // 3. Classic per-option double-portion differs WITHIN one group (the case the
  //    taco group-level field could not express).
  {
    const cp = byId['classic-burrito']?.modifierGroups?.find(x => x.id === 'classic-protein')
    const o = Object.fromEntries((cp?.options ?? []).map(x => [x.id, x]))
    if (cp?.minSelect === 0 && cp?.maxSelect === 1 && cp?.doubleMeat === null)
      ok('classic: added-protein group optional 0/1, doubleMeat=null')
    else bad(`classic group: ${JSON.stringify({ min: cp?.minSelect, max: cp?.maxSelect, dm: cp?.doubleMeat })}`)
    const vOk = o['classic-grilled-veggies']?.priceDeltaCents === 250 && o['classic-grilled-veggies']?.doublePortion === null
    const sOk2 = o['classic-steak']?.priceDeltaCents === 299 && JSON.stringify(o['classic-steak']?.doublePortion) === JSON.stringify({ priceDeltaCents: 299 })
    const shOk = o['classic-grilled-shrimp']?.priceDeltaCents === 349 && JSON.stringify(o['classic-grilled-shrimp']?.doublePortion) === JSON.stringify({ priceDeltaCents: 349 })
    if (vOk && sOk2 && shOk) ok('classic: veggies +250/null, steak +299/{299}, shrimp +349/{349} (per-option deltas in one group)')
    else bad(`classic options: ${JSON.stringify(o)}`)
  }

  // 4. Fixed-seafood extra: +349 and NOT itself doubleable.
  {
    const extra = byId['burrito-del-mar']?.modifierGroups?.find(x => x.id === 'delmar-extra')?.options?.[0]
    if (extra?.id === 'extra-shrimp' && extra?.priceDeltaCents === 349 && extra?.doublePortion === null)
      ok('del-mar: extra shrimp +349, doublePortion=null (no re-doubling the extra)')
    else bad(`del-mar extra: ${JSON.stringify(extra)}`)
  }

  // 5. Coexistence/precedence: an EXISTING taco keeps group-level doubleMeat +
  //    per-option doubleMeatAvailable, and its options still carry doublePortion
  //    (null). The two metadata models live side by side, unchanged for tacos.
  {
    const { body: tb } = await getJson(`${base(sOk)}/api/menu/categories/original-tacos`)
    const g = tb?.items?.[0]?.modifierGroups?.[0]
    const steak = g?.options?.[0]
    if (JSON.stringify(g?.doubleMeat) === JSON.stringify({ priceDeltaCents: 150 }) &&
        steak?.doubleMeatAvailable === true && steak?.doublePortion === null)
      ok('taco: unchanged — group doubleMeat {150}, option doubleMeatAvailable=true, doublePortion=null')
    else bad(`taco shape: ${JSON.stringify({ dm: g?.doubleMeat, dma: steak?.doubleMeatAvailable, dp: steak?.doublePortion })}`)
  }
} finally {
  await new Promise(r => sOk.close(r))
}

console.log(`\nSUMMARY ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
