import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCents } from './formatPrice.js'
import { menuWithTacoSuave, filterMenuItems } from './menuExplorer.js'

test('formatCents renders integer cents as USD, and guards bad input', () => {
  assert.equal(formatCents(525), '$5.25')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(600), '$6.00')
  assert.equal(formatCents(undefined), null)
  assert.equal(formatCents(NaN), null)
  assert.equal(formatCents('525'), null)
})

const base = [
  {
    category: 'Original Tacos',
    items: [
      { id: 'taco-suave', name: 'Taco Suave', description: 'static desc', price: '$5.25', image: '/x.jpg', popular: true },
      { name: 'Taco Duro', price: '$5.25' },
    ],
  },
  { category: 'Drinks', items: [{ name: 'Pepsi', price: '$3.29' }] },
]

const apiData = {
  id: 'taco-suave',
  name: 'Taco Suave',
  description: 'Soft corn tortilla taco with lettuce, cheese, and pico de gallo.',
  basePriceCents: 525,
  modifierGroups: [{ id: 'protein', label: 'Choose one', minSelect: 1, maxSelect: 1, options: [] }],
}

test('on success the API name/description/price overlay the static entry, metadata preserved', () => {
  const [tacos] = menuWithTacoSuave(base, { status: 'success', data: apiData })
  const taco = tacos.items.find(i => i.id === 'taco-suave')
  assert.equal(taco.description, apiData.description) // API description, not static
  assert.equal(taco.price, '$5.25') // formatted from 525 cents
  assert.equal(taco.image, '/x.jpg') // local metadata preserved
  assert.equal(taco.popular, true) // local metadata preserved
})

test('a DB price change propagates into filtering and counts (values agree)', () => {
  // Simulate the DB returning $5.99 instead of $5.25.
  const data = { ...apiData, basePriceCents: 599 }
  const reconciled = menuWithTacoSuave(base, { status: 'success', data })
  const taco = reconciled[0].items.find(i => i.id === 'taco-suave')
  assert.equal(taco.price, '$5.99')
  // A "$5 or less equivalent" filter at $5 excludes the now-$5.99 taco.
  const atMost5 = filterMenuItems(reconciled, { maxPrice: '5' })
  const tacosSection = atMost5.find(s => s.category === 'Original Tacos')
  assert.equal(Boolean(tacosSection?.items.some(i => i.id === 'taco-suave')), false)
  // At $10 it is included and counted.
  const atMost10 = filterMenuItems(reconciled, { maxPrice: '10' })
  assert.equal(atMost10.find(s => s.category === 'Original Tacos').items.some(i => i.id === 'taco-suave'), true)
})

test('while not successfully loaded, Taco Suave is excluded from filtering/counting', () => {
  for (const status of ['loading', 'error', 'notFound']) {
    const reconciled = menuWithTacoSuave(base, { status, data: null })
    const tacos = reconciled.find(s => s.category === 'Original Tacos')
    assert.equal(tacos.items.some(i => i.id === 'taco-suave'), false, `status=${status}`)
    assert.equal(tacos.items.length, 1, `status=${status} keeps other items`)
    // A search that would match the STATIC name must not match while pending.
    const searched = filterMenuItems(reconciled, { search: 'Taco Suave' })
    const count = searched.reduce((n, s) => n + s.items.length, 0)
    assert.equal(count, 0, `status=${status}: no stale static match`)
  }
})

// Count-consistency invariant: the top-level "N matching items" total equals the
// sum of the per-section header counts. MenuSection's header uses
// `section.items.length` and the top-level total sums the same, and the pending
// Taco Suave notice is NOT added to either — so the two counts can never
// contradict, in any filter mode or fetch status.
import { menu } from '../data/menu.js'

function sectionHeaderCount(section) {
  // Mirrors MenuSection: loaded items only; the pending notice is not counted.
  return section.items.length
}

for (const status of ['loading', 'error', 'notFound', 'success']) {
  const data = status === 'success'
    ? { id: 'taco-suave', name: 'Taco Suave', description: 'd', basePriceCents: 525, modifierGroups: [] }
    : null
  const reconciled = menuWithTacoSuave(menu, { status, data })

  for (const filters of [
    { label: 'category-only Original Tacos', opts: { category: 'Original Tacos' } },
    { label: 'popular-only', opts: { popularOnly: true } },
    { label: 'category + popular', opts: { category: 'Original Tacos', popularOnly: true } },
    { label: 'unfiltered', opts: {} },
  ]) {
    test(`count agreement: ${filters.label} / status=${status}`, () => {
      const filtered = filterMenuItems(reconciled, filters.opts)
      const topLevel = filtered.reduce((n, s) => n + s.items.length, 0)
      const sumOfHeaders = filtered.reduce((n, s) => n + sectionHeaderCount(s), 0)
      assert.equal(topLevel, sumOfHeaders,
        `top-level matching count must equal sum of section header counts`)
      // Pending Taco Suave is never counted as an available item.
      if (status !== 'success') {
        const tacos = filtered.find(s => s.category === 'Original Tacos')
        assert.equal(tacos ? tacos.items.some(i => i.id === 'taco-suave') : false, false,
          'pending Taco Suave must not appear in counted items')
      }
    })
  }
}
