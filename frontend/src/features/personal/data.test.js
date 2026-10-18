import assert from 'node:assert/strict'
import test from 'node:test'
import { cheapDeals, DEALS, discountPct, formatEur, SORTS, sortDeals } from './data.js'

test('deals are unique and every price is a real discount', () => {
  assert.equal(new Set(DEALS.map(deal => deal.id)).size, DEALS.length)
  for (const deal of DEALS) assert.ok(deal.priceEur < deal.originalEur && deal.left > 0, deal.id)
  assert.equal(discountPct({ priceEur: 4.9, originalEur: 14 }), 65)
})

test('sorting returns a copy ordered by distance, price or discount', () => {
  const original = DEALS.map(deal => deal.id)
  assert.equal(sortDeals(DEALS, 'nearest')[0].id, 'd1')
  assert.equal(sortDeals(DEALS, 'cheapest')[0].id, 'd2')
  const discounts = sortDeals(DEALS, 'discount').map(discountPct)
  assert.deepEqual(discounts, [...discounts].sort((a, b) => b - a))
  assert.equal(sortDeals(DEALS, 'unknown')[0].id, 'd1', 'unknown sorts fall back to nearest')
  assert.deepEqual(DEALS.map(deal => deal.id), original, 'the source list is unchanged')
  assert.deepEqual(Object.keys(SORTS), ['nearest', 'cheapest', 'discount'])
})

test('cheap deals are the cheapest under the limit', () => {
  assert.deepEqual(cheapDeals(DEALS).map(deal => deal.priceEur), [2.9, 3.5, 4.2])
  assert.deepEqual(cheapDeals(DEALS, 3), [DEALS[1]])
  assert.deepEqual(cheapDeals([], 5), [])
  assert.equal(formatEur(4.9), '€4.90')
})
