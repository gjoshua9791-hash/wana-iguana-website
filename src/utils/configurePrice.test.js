import test from 'node:test'
import assert from 'node:assert/strict'
import { configuredPriceCents, doubleMeatAfterSelect, doubleMeatOffered } from './configurePrice.js'

// Group mirrors the live shape: steak (meat, doubleable), grilled veggies (not).
const groupWithDouble = {
  id: 'protein', label: 'Choose one', minSelect: 1, maxSelect: 1,
  doubleMeat: { priceDeltaCents: 150 },
  options: [
    { id: 'steak', name: 'Steak', priceDeltaCents: 0, doubleMeatAvailable: true },
    { id: 'grilled-veggies', name: 'Grilled Veggies', priceDeltaCents: 0, doubleMeatAvailable: false },
  ],
}
// Duro/Del Mar style: no double meat offered at all.
const groupNoDouble = {
  id: 'protein-seafood', label: 'Choose one', minSelect: 1, maxSelect: 1,
  doubleMeat: null,
  options: [
    { id: 'grilled-fish', name: 'Grilled Fish', priceDeltaCents: 0, doubleMeatAvailable: false },
    { id: 'grilled-shrimp', name: 'Grilled Shrimp', priceDeltaCents: 0, doubleMeatAvailable: false },
  ],
}

test('doubleMeatOffered requires BOTH group.doubleMeat non-null AND selected option eligible', () => {
  assert.equal(doubleMeatOffered(groupWithDouble, null), false)              // nothing selected
  assert.equal(doubleMeatOffered(groupWithDouble, 'steak'), true)            // both conditions
  assert.equal(doubleMeatOffered(groupWithDouble, 'grilled-veggies'), false) // option ineligible
  assert.equal(doubleMeatOffered(groupNoDouble, 'grilled-fish'), false)      // group offers none
})

test('switching to an ineligible option clears double meat; switching to a meat does NOT auto-enable', () => {
  // was checked on steak, switch to veggies -> cleared
  assert.equal(doubleMeatAfterSelect(groupWithDouble, 'grilled-veggies', true), false)
  // was unchecked on veggies, switch to steak -> stays false (no auto-enable)
  assert.equal(doubleMeatAfterSelect(groupWithDouble, 'steak', false), false)
  // was checked and still on an eligible meat -> preserved
  assert.equal(doubleMeatAfterSelect(groupWithDouble, 'steak', true), true)
})

test('configured price = base + option delta + eligible checked double-meat surcharge (integer cents)', () => {
  // base only, nothing selected
  assert.equal(configuredPriceCents(groupWithDouble, 525, null, false), 525)
  // steak selected, no double meat
  assert.equal(configuredPriceCents(groupWithDouble, 525, 'steak', false), 525)
  // steak + double meat -> +150
  assert.equal(configuredPriceCents(groupWithDouble, 525, 'steak', true), 675)
  // veggies + "checked" -> double meat not offerable, so no surcharge
  assert.equal(configuredPriceCents(groupWithDouble, 525, 'grilled-veggies', true), 525)
  // supreme-style 299 surcharge
  const supreme = { ...groupWithDouble, doubleMeat: { priceDeltaCents: 299 } }
  assert.equal(configuredPriceCents(supreme, 850, 'steak', true), 1149)
  // no-double group never adds a surcharge
  assert.equal(configuredPriceCents(groupNoDouble, 675, 'grilled-fish', true), 675)
})

test('each confirmed surcharge value flows through (150 / 150 / 299; none for duro/del-mar)', () => {
  assert.equal(configuredPriceCents({ ...groupWithDouble, doubleMeat: { priceDeltaCents: 150 } }, 525, 'steak', true), 675) // suave/bravo
  assert.equal(configuredPriceCents({ ...groupWithDouble, doubleMeat: { priceDeltaCents: 299 } }, 850, 'steak', true), 1149) // supreme
  assert.equal(configuredPriceCents(groupNoDouble, 525, 'grilled-fish', true), 525) // duro/del-mar: no surcharge
})
