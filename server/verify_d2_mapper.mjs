// D2 mapper unit tests — pure, no database. Exercises grouping, null LEFT JOINs,
// ordering, de-duplication, and the zero-rows -> null contract.
import { mapRowsToItem } from './dist/menu/mapRows.js'
import assert from 'node:assert'

let pass = 0, fail = 0
const ok  = (m) => { console.log('PASS', m); pass++ }
const bad = (m) => { console.log('FAIL', m); fail++ }
const t = (name, fn) => { try { fn(); ok(name) } catch (e) { bad(name + ' -> ' + e.message) } }

const base = {
  item_id: 'taco-suave', item_name: 'Taco Suave', description: 'desc',
  variant_id: 'taco-suave-base', base_price_cents: 525,
}
const row = (o) => ({ ...base, group_id: null, label: null, min_select: null,
  max_select: null, group_sort: null, double_meat_price_delta_cents: null,
  option_id: null, option_name: null, price_delta_cents: null, option_sort: null,
  double_meat_available: null, double_portion_price_delta_cents: null, ...o })

// 1. Zero rows -> null (route maps to 404)
t('zero rows -> null', () => { assert.strictEqual(mapRowsToItem([]), null) })

// 2. Happy path: one group, two options, grouped + ordered + integer cents + ids
t('groups repeated join rows; preserves ids/cents/limits/order', () => {
  const rows = [
    row({ group_id: 'protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, option_id: 'steak',   option_name: 'Steak',   price_delta_cents: 0, option_sort: 1 }),
    row({ group_id: 'protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, option_id: 'chicken', option_name: 'Chicken', price_delta_cents: 0, option_sort: 2 }),
  ]
  const item = mapRowsToItem(rows)
  assert.strictEqual(item.id, 'taco-suave')
  assert.strictEqual(item.variantId, 'taco-suave-base')
  assert.strictEqual(item.basePriceCents, 525)
  assert.strictEqual(item.modifierGroups.length, 1, 'one unique group')
  const g = item.modifierGroups[0]
  assert.strictEqual(g.id, 'protein'); assert.strictEqual(g.label, 'Choose one')
  assert.strictEqual(g.minSelect, 1); assert.strictEqual(g.maxSelect, 1)
  assert.deepStrictEqual(g.options.map(o => o.id), ['steak', 'chicken'], 'steak then chicken')
  assert.strictEqual(g.options[0].priceDeltaCents, 0)
})

// 3. Ordering: rows arriving out of order get sorted by sort keys
t('explicit ordering regardless of row arrival order', () => {
  const rows = [
    row({ group_id: 'g2', label: 'B', min_select: 0, max_select: 1, group_sort: 2, option_id: 'o2b', option_name: 'o2b', price_delta_cents: 0, option_sort: 2 }),
    row({ group_id: 'g1', label: 'A', min_select: 0, max_select: 1, group_sort: 1, option_id: 'o1b', option_name: 'o1b', price_delta_cents: 0, option_sort: 5 }),
    row({ group_id: 'g1', label: 'A', min_select: 0, max_select: 1, group_sort: 1, option_id: 'o1a', option_name: 'o1a', price_delta_cents: 0, option_sort: 1 }),
    row({ group_id: 'g2', label: 'B', min_select: 0, max_select: 1, group_sort: 2, option_id: 'o2a', option_name: 'o2a', price_delta_cents: 0, option_sort: 1 }),
  ]
  const item = mapRowsToItem(rows)
  assert.deepStrictEqual(item.modifierGroups.map(g => g.id), ['g1', 'g2'])
  assert.deepStrictEqual(item.modifierGroups[0].options.map(o => o.id), ['o1a', 'o1b'])
  assert.deepStrictEqual(item.modifierGroups[1].options.map(o => o.id), ['o2a', 'o2b'])
})

// 4. Null group (variant with no groups) -> zero groups, no fake group
t('null group_id -> no groups fabricated', () => {
  const item = mapRowsToItem([row({})])
  assert.strictEqual(item.modifierGroups.length, 0)
})

// 5. Group present but null option_id -> group with zero options, no fake option
t('group with null option_id -> empty options, no fake option', () => {
  const item = mapRowsToItem([row({ group_id: 'g', label: 'G', min_select: 0, max_select: 1, group_sort: 1 })])
  assert.strictEqual(item.modifierGroups.length, 1)
  assert.strictEqual(item.modifierGroups[0].options.length, 0)
})

// 6. Duplicate option rows de-duplicated by id
t('duplicate option rows de-duplicated', () => {
  const rows = [
    row({ group_id: 'g', label: 'G', min_select: 1, max_select: 1, group_sort: 1, option_id: 'x', option_name: 'X', price_delta_cents: 0, option_sort: 1 }),
    row({ group_id: 'g', label: 'G', min_select: 1, max_select: 1, group_sort: 1, option_id: 'x', option_name: 'X', price_delta_cents: 0, option_sort: 1 }),
  ]
  const item = mapRowsToItem(rows)
  assert.strictEqual(item.modifierGroups.length, 1)
  assert.strictEqual(item.modifierGroups[0].options.length, 1, 'duplicate option id collapsed to one')
})

// 7. null description preserved as null (not coerced)
t('null description preserved', () => {
  assert.strictEqual(mapRowsToItem([row({ description: null })]).description, null)
})

// 8. Feature 2: double-meat fields emitted (group doubleMeat + option availability)
t('double-meat: group.doubleMeat non-null, per-option availability', () => {
  const rows = [
    row({ group_id: 'protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, double_meat_price_delta_cents: 150, option_id: 'steak',           option_name: 'Steak',           price_delta_cents: 0, option_sort: 1, double_meat_available: true  }),
    row({ group_id: 'protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, double_meat_price_delta_cents: 150, option_id: 'grilled-veggies', option_name: 'Grilled Veggies', price_delta_cents: 0, option_sort: 5, double_meat_available: false }),
  ]
  const g = mapRowsToItem(rows).modifierGroups[0]
  assert.deepStrictEqual(g.doubleMeat, { priceDeltaCents: 150 }, 'group doubleMeat from link')
  const steak = g.options.find(o => o.id === 'steak')
  const veg   = g.options.find(o => o.id === 'grilled-veggies')
  assert.strictEqual(steak.doubleMeatAvailable, true,  'meat is doubleable')
  assert.strictEqual(veg.doubleMeatAvailable,   false, 'veggies not doubleable')
})

// 9. Feature 2: no double meat -> group.doubleMeat is null (Duro/Del Mar shape)
t('double-meat: null link -> doubleMeat null', () => {
  const rows = [
    row({ group_id: 'protein-seafood', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, double_meat_price_delta_cents: null, option_id: 'grilled-fish', option_name: 'Grilled Fish', price_delta_cents: 0, option_sort: 1, double_meat_available: false }),
  ]
  const g = mapRowsToItem(rows).modifierGroups[0]
  assert.strictEqual(g.doubleMeat, null, 'no double meat offered -> null')
  assert.strictEqual(g.options[0].doubleMeatAvailable, false)
})

// 10. Feature 3: per-option doublePortion emitted (null when column null)
t('double-portion: emitted per option; null when not doubleable', () => {
  const rows = [
    row({ group_id: 'burrito-protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, option_id: 'burrito-steak',           option_name: 'Steak',           price_delta_cents: 0, option_sort: 1, double_portion_price_delta_cents: 299 }),
    row({ group_id: 'burrito-protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, option_id: 'burrito-grilled-veggies', option_name: 'Grilled Veggies', price_delta_cents: 0, option_sort: 5, double_portion_price_delta_cents: null }),
  ]
  const g = mapRowsToItem(rows).modifierGroups[0]
  assert.strictEqual(g.doubleMeat, null, 'burrito group: no taco group-level doubleMeat')
  const steak = g.options.find(o => o.id === 'burrito-steak')
  const veg   = g.options.find(o => o.id === 'burrito-grilled-veggies')
  assert.deepStrictEqual(steak.doublePortion, { priceDeltaCents: 299 }, 'meat doubleable +299')
  assert.strictEqual(veg.doublePortion, null, 'veggies not doubleable')
  assert.strictEqual(steak.doubleMeatAvailable, false, 'taco field untouched for burrito')
})

// 11. Feature 3: two groups per item, ordered by group_sort (protein then wet)
t('two groups per item ordered by group_sort', () => {
  const rows = [
    row({ group_id: 'wet-upgrade',     label: 'Make it wet?', min_select: 0, max_select: 1, group_sort: 2, option_id: 'wet',           option_name: 'Wet',   price_delta_cents: 429, option_sort: 1, double_portion_price_delta_cents: null }),
    row({ group_id: 'burrito-protein', label: 'Choose one',   min_select: 1, max_select: 1, group_sort: 1, option_id: 'burrito-steak', option_name: 'Steak', price_delta_cents: 0,   option_sort: 1, double_portion_price_delta_cents: 299 }),
  ]
  const item = mapRowsToItem(rows)
  assert.deepStrictEqual(item.modifierGroups.map(g => g.id), ['burrito-protein', 'wet-upgrade'], 'group_sort order')
  assert.strictEqual(item.modifierGroups[1].minSelect, 0, 'wet is optional')
  assert.strictEqual(item.modifierGroups[1].options[0].priceDeltaCents, 429)
})

// 12. Feature 3: Feature 2 shape unchanged — options still carry doublePortion key
t('existing taco option also carries doublePortion (null) — additive, non-breaking', () => {
  const rows = [
    row({ group_id: 'protein', label: 'Choose one', min_select: 1, max_select: 1, group_sort: 1, double_meat_price_delta_cents: 150, option_id: 'steak', option_name: 'Steak', price_delta_cents: 0, option_sort: 1, double_meat_available: true }),
  ]
  const o = mapRowsToItem(rows).modifierGroups[0].options[0]
  assert.strictEqual(o.doubleMeatAvailable, true, 'taco eligibility preserved')
  assert.strictEqual(o.doublePortion, null, 'additive field present and null for tacos')
})

console.log(`\nSUMMARY ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
