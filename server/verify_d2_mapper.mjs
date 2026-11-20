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
  max_select: null, group_sort: null, option_id: null, option_name: null,
  price_delta_cents: null, option_sort: null, ...o })

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

console.log(`\nSUMMARY ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
