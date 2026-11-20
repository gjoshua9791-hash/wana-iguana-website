import test from 'node:test'
import assert from 'node:assert/strict'
import { menu } from '../data/menu.js'
import { filterMenuItems } from './menuExplorer.js'

test('category, price, and popular filters work together', () => {
  const sections = filterMenuItems(menu, { category: 'Burritos', maxPrice: '15', popularOnly: true })
  assert.deepEqual(sections.map(section => section.category), ['Burritos'])
  assert.deepEqual(sections[0].items.map(item => item.name), ['Super Burrito', 'Burrito Grande'])
})

test('existing category search still works and incompatible filters yield no matches', () => {
  const sections = filterMenuItems(menu, { search: 'Original Tacos' })
  assert.deepEqual(sections.map(section => section.category), ['Original Tacos'])
  assert.equal(sections[0].items.length, 5)
  assert.deepEqual(filterMenuItems(menu, { search: 'horchata', category: 'Burritos' }), [])
})

test('price limits exclude items without a valid price', () => {
  const sample = [{ category: 'Sample', items: [{ name: 'No price' }, { name: 'Priced', price: '$9.99' }] }]
  const sections = filterMenuItems(sample, { maxPrice: '10' })
  assert.deepEqual(sections[0].items.map(item => item.name), ['Priced'])
})
