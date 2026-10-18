import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canCancel,
  clampPortions,
  formatOrderedAt,
  MAX_ORDER_PORTIONS,
  maxPortions,
  orderState,
  ordersSummary,
  orderTotal,
  portionsText,
  splitOrders,
  totalText,
} from './orders.js'
import { isLive, placesFromOffers, portionsLeft } from './places.js'

// 17 October 2026, 18:00 in Iași (UTC+3).
const NOW = new Date('2026-10-17T15:00:00Z')

const offer = (overrides = {}) => ({
  id: 'o1', donor_id: 'd1', status: 'available', portion_count: 6, portions_left: 4, price_ron: 12.5, original_price_ron: 30,
  quantity_kg: 3, available_from: '2026-10-17T17:00:00+03:00', pickup_deadline: '2026-10-17T21:00:00+03:00', ...overrides,
})

const order = (overrides = {}) => ({
  id: 'order-1', offer_id: 'o1', donor_id: 'd1', status: 'placed', portions: 2, sold_whole: false,
  total_price_ron: 25, original_total_ron: 60, pickup_code: 'K7QX',
  pickup_from: '2026-10-17T17:00:00+03:00', pickup_until: '2026-10-17T21:00:00+03:00', created_at: '2026-10-17T17:40:00+03:00', ...overrides,
})

test('portions left, with fallbacks for older offers and whole lots', () => {
  assert.equal(portionsLeft(offer()), 4)
  assert.equal(portionsLeft(offer({ portions_left: undefined })), 6)
  assert.equal(portionsLeft(offer({ portions_left: undefined, portion_count: null })), 1)
  assert.equal(portionsLeft(offer({ portions_left: 0 })), 0)
})

test('sold-out offers leave the map', () => {
  assert.equal(isLive(offer({ portions_left: 0 }), NOW), false)
  const donors = [{ id: 'd1', type: 'restaurant', name: 'Trattoria Unirii (synthetic)', location: { lat: 47.16, lon: 27.58 } }]
  assert.equal(placesFromOffers(donors, [offer({ portions_left: 0 })], { now: NOW }).length, 0)
  assert.equal(placesFromOffers(donors, [offer()], { now: NOW }).length, 1)
})

test('the portion stepper stays between 1 and what is left (at most 10)', () => {
  assert.equal(maxPortions(offer()), 4)
  assert.equal(maxPortions(offer({ portions_left: 30 })), MAX_ORDER_PORTIONS)
  assert.equal(clampPortions(9, offer()), 4)
  assert.equal(clampPortions(0, offer()), 1)
  assert.equal(clampPortions('abc', offer()), 1)
  assert.equal(clampPortions(2.6, offer()), 3)
})

test('order totals', () => {
  assert.equal(orderTotal(offer(), 3), 37.5)
  assert.equal(orderTotal(offer({ price_ron: 0.1 }), 3), 0.3)
  assert.equal(orderTotal(offer({ price_ron: null }), 2), null)
  assert.equal(totalText(order()), '25 lei')
  assert.equal(totalText(order({ total_price_ron: null })), 'Price at pickup')
  assert.equal(portionsText(1), '1 portion')
  assert.equal(portionsText(3), '3 portions')
  assert.equal(portionsText(1, true), 'Everything on offer')
})

test('order status follows the pickup window', () => {
  assert.deepEqual(orderState(order(), NOW), { tone: 'ready', label: 'Ready for pickup until 21:00' })
  assert.deepEqual(orderState(order({ pickup_from: '2026-10-17T19:00:00+03:00' }), NOW), { tone: 'upcoming', label: 'Pickup from 19:00' })
  assert.equal(orderState(order({ pickup_until: '2026-10-17T17:30:00+03:00' }), NOW).tone, 'ended')
  assert.equal(orderState(order({ status: 'cancelled' }), NOW).label, 'Cancelled')
  assert.equal(canCancel(order(), NOW), true)
  assert.equal(canCancel(order({ status: 'cancelled' }), NOW), false)
  assert.equal(canCancel(order({ pickup_until: '2026-10-17T18:00:00+03:00' }), NOW), false, 'not at the deadline itself')
  assert.equal(formatOrderedAt(order()), '17 Oct, 17:40')
})

test('active orders first (soonest pickup), then history newest first; summary skips cancelled', () => {
  const orders = [
    order({ id: 'late', pickup_until: '2026-10-17T22:00:00+03:00' }),
    order({ id: 'soon', pickup_until: '2026-10-17T19:00:00+03:00' }),
    order({ id: 'old', pickup_until: '2026-10-16T21:00:00+03:00', created_at: '2026-10-16T12:00:00+03:00' }),
    order({ id: 'cancelled', status: 'cancelled', created_at: '2026-10-17T12:00:00+03:00', total_price_ron: 99 }),
  ]
  const { active, past } = splitOrders(orders, NOW)
  assert.deepEqual(active.map(item => item.id), ['soon', 'late'])
  assert.deepEqual(past.map(item => item.id), ['cancelled', 'old'])
  assert.deepEqual(ordersSummary(orders), { count: 3, spent: 75 })
  assert.deepEqual(ordersSummary([]), { count: 0, spent: 0 })
})
