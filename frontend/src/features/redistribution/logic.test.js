import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeReservationFor,
  bucharestDate,
  describeError,
  EMPTY_OFFER_FORM,
  localInputToIso,
  mapPrefill,
  parseTags,
  reserveKey,
  toLocalInput,
  validateHandover,
  validateOffer,
  validateSurplusLog,
} from './logic.js'

const NOW = new Date('2026-10-17T07:00:00Z') // 10:00 in Bucharest (EEST, +03:00)
const ACCEPTED = ['bakery', 'bread', 'canned', 'dairy', 'prepared_meals', 'produce']

const validForm = {
  ...EMPTY_OFFER_FORM,
  donorId: 'donor-restaurant-copou',
  category: 'prepared_meals',
  description: ' Soup ',
  allergenMode: 'declared',
  allergens: 'Celery, gluten, celery',
  storage: ['chilled'],
  quantityKg: '12,5',
  availableFrom: '2026-10-17T18:00',
  pickupDeadline: '2026-10-17T20:00',
  confirmed: true,
}

test('Bucharest wall time converts to an offset timestamp in summer and winter', () => {
  assert.equal(localInputToIso('2026-10-17T17:00'), '2026-10-17T17:00:00+03:00')
  assert.equal(localInputToIso('2026-01-15T10:30'), '2026-01-15T10:30:00+02:00')
  assert.equal(localInputToIso('2026-10-25T05:00'), '2026-10-25T05:00:00+02:00') // after the DST change
  assert.equal(localInputToIso('not a date'), null)
  assert.equal(toLocalInput('2026-10-17T14:00:00Z'), '2026-10-17T17:00')
  assert.equal(toLocalInput(localInputToIso('2026-01-15T10:30')), '2026-01-15T10:30')
  assert.equal(bucharestDate('2026-10-17T22:30:00Z'), '2026-10-18')
})

test('valid offer builds the API payload', () => {
  const { errors, payload } = validateOffer(validForm, NOW)
  assert.deepEqual(errors, {})
  assert.deepEqual(payload, {
    donor_id: 'donor-restaurant-copou',
    category: 'prepared_meals',
    description: 'Soup',
    allergens: ['celery', 'gluten'],
    storage_requirements: ['chilled'],
    quantity_kg: 12.5,
    portion_count: null,
    available_from: '2026-10-17T18:00:00+03:00',
    pickup_deadline: '2026-10-17T20:00:00+03:00',
  })
})

test('allergen modes: none is an empty list, unknown is null, undecided is an error', () => {
  assert.deepEqual(validateOffer({ ...validForm, allergenMode: 'none', allergens: 'ignored' }, NOW).payload.allergens, [])
  assert.equal(validateOffer({ ...validForm, allergenMode: 'unknown' }, NOW).payload.allergens, null)
  assert.ok(validateOffer({ ...validForm, allergenMode: '' }, NOW).errors.allergens)
  assert.ok(validateOffer({ ...validForm, allergens: ' , ' }, NOW).errors.allergens)
})

test('offer form requires real quantity, a future window and donor confirmation', () => {
  const { errors } = validateOffer({ ...EMPTY_OFFER_FORM }, NOW)
  assert.deepEqual(Object.keys(errors).sort(), ['allergens', 'availableFrom', 'category', 'confirmed', 'donorId', 'pickupDeadline', 'quantityKg'])
  assert.ok(validateOffer({ ...validForm, quantityKg: '0' }, NOW).errors.quantityKg)
  assert.ok(validateOffer({ ...validForm, quantityKg: 'abc' }, NOW).errors.quantityKg)
  assert.ok(validateOffer({ ...validForm, portionCount: '2.5' }, NOW).errors.portionCount)
  assert.match(validateOffer({ ...validForm, pickupDeadline: '2026-10-17T17:00' }, NOW).errors.pickupDeadline, /after the start/)
  assert.match(validateOffer({ ...validForm, availableFrom: '2026-10-17T08:00', pickupDeadline: '2026-10-17T09:00' }, NOW).errors.pickupDeadline, /future/)
  assert.ok(validateOffer({ ...validForm, confirmed: false }, NOW).errors.confirmed)
})

test('prefill maps restaurant dish categories and never carries quantity or deadline', () => {
  assert.deepEqual(mapPrefill({ category: 'main', description: 'Unsold Friday mains', quantity_kg: 99 }, ACCEPTED), {
    category: 'prepared_meals',
    description: 'Unsold Friday mains',
    note: 'Dish category "main" is offered as "prepared_meals".',
  })
  for (const dish of ['soup', 'side', 'daily_menu']) assert.equal(mapPrefill({ category: dish }, ACCEPTED).category, 'prepared_meals')
  assert.equal(mapPrefill({ category: 'dessert' }, ACCEPTED).category, 'bakery')
  assert.equal(mapPrefill({ category: 'Bread' }, ACCEPTED).category, 'bread')
  assert.equal(mapPrefill({ category: 'alcohol' }, ACCEPTED).category, '')
  assert.match(mapPrefill({ category: 'alcohol' }, ACCEPTED).note, /not accepted/)
  assert.equal(mapPrefill(null, ACCEPTED), null)
})

test('handover validation enforces offered quantity, time and keeps the key', () => {
  const offer = { quantity_kg: 8, pickup_deadline: '2026-10-17T19:30:00+03:00' }
  const ok = validateHandover({ receivedKg: '7.5', receivedAt: '2026-10-17T09:55', idempotencyKey: 'h-1' }, offer, NOW)
  assert.deepEqual(ok.payload, { received_quantity_kg: 7.5, received_at: '2026-10-17T09:55:00+03:00', idempotency_key: 'h-1' })
  assert.match(validateHandover({ receivedKg: '8.5', receivedAt: '2026-10-17T09:55' }, offer, NOW).errors.receivedKg, /Cannot exceed/)
  assert.ok(validateHandover({ receivedKg: '0', receivedAt: '2026-10-17T09:55' }, offer, NOW).errors.receivedKg)
  assert.match(validateHandover({ receivedKg: '1', receivedAt: '2026-10-17T12:00' }, offer, NOW).errors.receivedAt, /future/)
})

test('surplus log accepts a confirmed zero and rejects future days', () => {
  assert.deepEqual(validateSurplusLog({ donorId: 'd', date: '2026-10-16', quantityKg: '0' }, NOW).payload, { donor_id: 'd', date: '2026-10-16', quantity_kg: 0 })
  assert.ok(validateSurplusLog({ donorId: 'd', date: '2026-10-18', quantityKg: '1' }, NOW).errors.date)
  assert.ok(validateSurplusLog({ donorId: 'd', date: '2026-10-16', quantityKg: '' }, NOW).errors.quantityKg)
  assert.ok(validateSurplusLog({ donorId: 'd', date: '2026-10-16', quantityKg: '-1' }, NOW).errors.quantityKg)
})

test('reservation key is stable for retries of the same offer version', () => {
  const offer = { id: 'offer-1', version: 2 }
  assert.equal(reserveKey(offer, 'org-a'), reserveKey(offer, 'org-a'))
  assert.notEqual(reserveKey(offer, 'org-a'), reserveKey({ ...offer, version: 3 }, 'org-a'))
})

test('errors are worded per status, including network failures', () => {
  const conflict = describeError({ status: 409, message: 'Offer is reserved and cannot be reserved.', details: [] })
  assert.equal(conflict.title, 'Changed in the meantime')
  assert.match(conflict.message, /reloaded/)
  const invalid = describeError({ status: 400, message: 'Invalid', details: [{ field: 'body.quantity_kg', message: 'too small' }] })
  assert.deepEqual(invalid.details, ['quantity_kg: too small'])
  assert.equal(describeError(new TypeError('Failed to fetch')).title, 'Cannot reach the server')
})

test('helpers: tags and active reservation', () => {
  assert.deepEqual(parseTags('Gluten, , milk,gluten'), ['gluten', 'milk'])
  const reservations = [
    { reservation_id: 'r1', offer_id: 'o1', status: 'released' },
    { reservation_id: 'r2', offer_id: 'o1', status: 'reserved' },
    { reservation_id: 'r3', offer_id: 'o2', status: 'collected' },
  ]
  assert.equal(activeReservationFor('o1', reservations).reservation_id, 'r2')
  assert.equal(activeReservationFor('o2', reservations).reservation_id, 'r3')
  assert.equal(activeReservationFor('o3', reservations), null)
})

test('offer prices are optional, validated and only sent when entered', () => {
  assert.equal('price_ron' in validateOffer(validForm, NOW).payload, false)
  const priced = validateOffer({ ...validForm, priceRon: '12,5', originalPriceRon: '30' }, NOW)
  assert.deepEqual(priced.errors, {})
  assert.equal(priced.payload.price_ron, 12.5)
  assert.equal(priced.payload.original_price_ron, 30)
  assert.equal(validateOffer({ ...validForm, priceRon: '0' }, NOW).payload.original_price_ron, null, 'free, with no regular price')
  assert.match(validateOffer({ ...validForm, originalPriceRon: '30' }, NOW).errors.priceRon, /sale price/)
  assert.match(validateOffer({ ...validForm, priceRon: '31', originalPriceRon: '30' }, NOW).errors.priceRon, /not be higher/)
  assert.ok(validateOffer({ ...validForm, priceRon: '-1' }, NOW).errors.priceRon)
  assert.ok(validateOffer({ ...validForm, priceRon: 'abc' }, NOW).errors.priceRon)
  assert.ok(validateOffer({ ...validForm, priceRon: '5', originalPriceRon: '0' }, NOW).errors.originalPriceRon)
})
