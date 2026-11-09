import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute } from './routes.js'

test('a fresh visit opens Home and direct links open the requested view', () => {
  assert.deepEqual(parseRoute(''), { page: 'home', category: null })
  assert.deepEqual(parseRoute('#/menu'), { page: 'menu', category: null })
  assert.deepEqual(parseRoute('#/assistant'), { page: 'assistant', category: null })
  assert.deepEqual(parseRoute('#/account'), { page: 'account', category: null })
})

test('a specials link keeps its destination when Menu opens directly', () => {
  assert.deepEqual(parseRoute('#/menu/wana-specials'), { page: 'menu', category: 'wana-specials' })
  assert.deepEqual(parseRoute('#/menu/original-tacos'), { page: 'menu', category: 'original-tacos' })
  assert.deepEqual(parseRoute('#/not-a-page'), { page: 'home', category: null })
})
