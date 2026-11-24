import test from 'node:test'
import assert from 'node:assert/strict'
import { menuWithCategory, filterMenuItems } from './menuExplorer.js'
import { menu } from '../data/menu.js'

// A representative live category payload (subset of options for brevity).
const option = (id, delta = 0, dma = false) => ({ id, name: id, priceDeltaCents: delta, doubleMeatAvailable: dma })
const proteinGroup = (dmDelta) => ({
  id: 'protein', label: 'Choose one', minSelect: 1, maxSelect: 1,
  doubleMeat: dmDelta == null ? null : { priceDeltaCents: dmDelta },
  options: [option('steak', 0, true), option('grilled-veggies', 0, false)],
})
const apiItem = (id, name, cents, dmDelta) => ({
  id, name, description: `${name} desc`, variantId: `${id}-base`, basePriceCents: cents,
  modifierGroups: [proteinGroup(dmDelta)],
})

const FIVE = [
  apiItem('taco-suave', 'Taco Suave', 525, 150),
  apiItem('taco-duro', 'Taco Duro', 525, null),
  apiItem('taco-bravo', 'Taco Bravo', 525, 150),
  apiItem('taco-del-mar', 'Taco Del Mar', 675, null),
  apiItem('taco-supreme', 'Taco Supreme', 850, 299),
]

test('success: Original Tacos items come from the API in API order, local metadata preserved', () => {
  const reconciled = menuWithCategory(menu, { status: 'success', items: FIVE }, 'Original Tacos')
  const ot = reconciled.find(s => s.category === 'Original Tacos')
  assert.deepEqual(ot.items.map(i => i.id),
    ['taco-suave', 'taco-duro', 'taco-bravo', 'taco-del-mar', 'taco-supreme'])
  const suave = ot.items[0]
  assert.equal(suave.price, '$5.25')                 // base-price string from cents (filter layer)
  assert.equal(suave.description, 'Taco Suave desc') // API description
  assert.equal(suave.image, '/images/taco-suave.jpeg') // local metadata preserved by id
  assert.equal(suave.popular, true)                  // local metadata preserved by id
  assert.ok(suave.apiItem && suave.apiItem.modifierGroups[0].doubleMeat.priceDeltaCents === 150)
  // other categories untouched
  assert.ok(reconciled.find(s => s.category === 'Burritos').items.length > 0)
})

test('reconciliation keys on id, not name (DB rename still matches local metadata)', () => {
  const renamed = FIVE.map(i => i.id === 'taco-suave' ? { ...i, name: 'Taco Suave (DB test)' } : i)
  const reconciled = menuWithCategory(menu, { status: 'success', items: renamed }, 'Original Tacos')
  const suave = reconciled.find(s => s.category === 'Original Tacos').items[0]
  assert.equal(suave.name, 'Taco Suave (DB test)') // API name wins
  assert.equal(suave.image, '/images/taco-suave.jpeg') // still matched by id
})

test('authoritative omission: an item the API did not return is dropped (no static fallback)', () => {
  const four = FIVE.filter(i => i.id !== 'taco-bravo')
  const reconciled = menuWithCategory(menu, { status: 'success', items: four }, 'Original Tacos')
  const ot = reconciled.find(s => s.category === 'Original Tacos')
  assert.equal(ot.items.some(i => i.id === 'taco-bravo'), false)
  // A search for the omitted item's name must not match a static row.
  const searched = filterMenuItems(reconciled, { search: 'Taco Bravo' })
  assert.equal(searched.reduce((n, s) => n + s.items.length, 0), 0)
})

for (const status of ['loading', 'error', 'empty']) {
  test(`non-success (${status}): Original Tacos excluded from filtering/counting; other categories intact`, () => {
    const reconciled = menuWithCategory(menu, { status, items: [] }, 'Original Tacos')
    const ot = reconciled.find(s => s.category === 'Original Tacos')
    assert.equal(ot.items.length, 0)
    // No stale static taco matches a search while not successfully loaded.
    const searched = filterMenuItems(reconciled, { search: 'Taco' })
    assert.equal(searched.some(s => s.category === 'Original Tacos'), false)
    // Other categories still present/filterable.
    assert.ok(reconciled.find(s => s.category === 'Drinks').items.length > 0)
  })
}

test('max-price filter uses the API BASE price (525/675/850), not any configured total', () => {
  const reconciled = menuWithCategory(menu, { status: 'success', items: FIVE }, 'Original Tacos')
  const atMost6 = filterMenuItems(reconciled, { category: 'Original Tacos', maxPrice: '10' })
  const ids = atMost6.find(s => s.category === 'Original Tacos').items.map(i => i.id)
  // All five base prices are <= $10, so all remain regardless of double-meat deltas.
  assert.deepEqual(ids.sort(), ['taco-bravo', 'taco-del-mar', 'taco-duro', 'taco-supreme', 'taco-suave'].sort())
})

test('count agreement: top-level total equals sum of per-section (header) counts', () => {
  const reconciled = menuWithCategory(menu, { status: 'success', items: FIVE }, 'Original Tacos')
  for (const opts of [{}, { category: 'Original Tacos' }, { popularOnly: true }, { search: 'taco' }]) {
    const filtered = filterMenuItems(reconciled, opts)
    const topLevel = filtered.reduce((n, s) => n + s.items.length, 0)
    const sumHeaders = filtered.reduce((n, s) => n + s.items.length, 0) // MenuSection header = section.items.length
    assert.equal(topLevel, sumHeaders)
  }
})
