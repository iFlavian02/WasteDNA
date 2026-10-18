import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allergenText,
  categoryLabel,
  discountPct,
  displayName,
  distanceKm,
  escapeHtml,
  formatKm,
  formatRon,
  initials,
  markerHtml,
  minutesLeft,
  pickupLabel,
  placePath,
  placeById,
  placesFromOffers,
  placesWithNewOffers,
  priceUnit,
  USER_LOCATION,
} from './places.js'

// Saturday 17 October 2026, 18:00 in Iași (UTC+3).
const NOW = new Date('2026-10-17T15:00:00Z')

const DONORS = [
  { id: 'donor-iasi-trattoria-unirii', type: 'restaurant', name: 'Trattoria Unirii (synthetic)', location: { lat: 47.1655, lon: 27.5808 } },
  { id: 'donor-iasi-sushi-copou', type: 'restaurant', name: 'Sushi Corner Copou (synthetic)', location: { lat: 47.1785, lon: 27.5735 } },
  { id: 'donor-supermarket-pacurari', type: 'supermarket', name: 'Demo Market Păcurari (synthetic)', location: { lat: 47.17, lon: 27.555 } },
  { id: 'donor-household-nicolina', type: 'household', name: 'Demo Household Nicolina (synthetic)', location: { lat: 47.145, lon: 27.59 } },
  { id: 'donor-iasi-bistro-tudor', type: 'restaurant', name: 'Bistro Tudor Vladimirescu (synthetic)', location: { lat: 47.1595, lon: 27.6185 } },
]

const offer = (id, donorId, overrides = {}) => ({
  id,
  donor_id: donorId,
  category: 'prepared_meals',
  description: 'Lasagna (synthetic)',
  allergens: [],
  status: 'available',
  quantity_kg: 2,
  portion_count: 4,
  price_ron: 18,
  original_price_ron: 42,
  available_from: '2026-10-17T18:30:00+03:00',
  pickup_deadline: '2026-10-17T21:00:00+03:00',
  ...overrides,
})

const OFFERS = [
  offer('o-late', 'donor-iasi-trattoria-unirii'),
  offer('o-early', 'donor-iasi-trattoria-unirii', { price_ron: 9, original_price_ron: 22, pickup_deadline: '2026-10-17T19:00:00+03:00' }),
  offer('o-sushi', 'donor-iasi-sushi-copou', { price_ron: 22, original_price_ron: 55 }),
  offer('o-free', 'donor-supermarket-pacurari', { price_ron: null, original_price_ron: null, portion_count: null }),
  offer('o-home', 'donor-household-nicolina'),
  offer('o-reserved', 'donor-iasi-bistro-tudor', { status: 'reserved' }),
  offer('o-gone', 'donor-iasi-bistro-tudor', { pickup_deadline: '2026-10-17T17:59:00+03:00' }),
]

test('places are restaurants and shops with live offers, nearest first', () => {
  const places = placesFromOffers(DONORS, OFFERS, { now: NOW })
  assert.deepEqual(places.map(place => place.id), ['donor-iasi-trattoria-unirii', 'donor-iasi-sushi-copou', 'donor-supermarket-pacurari'])
  const [trattoria, , market] = places
  assert.equal(trattoria.name, 'Trattoria Unirii')
  assert.equal(trattoria.initials, 'TU')
  assert.equal(trattoria.count, 2)
  assert.deepEqual(trattoria.offers.map(item => item.id), ['o-early', 'o-late'], 'soonest deadline first')
  assert.equal(trattoria.cheapest, 9)
  assert.equal(trattoria.maxDiscount, 59)
  assert.equal(market.cheapest, null, 'an unpriced offer has no price')
  assert.equal(market.maxDiscount, null)
})

test('households, reserved and past offers never reach the map', () => {
  const ids = placesFromOffers(DONORS, OFFERS, { now: NOW }).flatMap(place => place.offers.map(item => item.id))
  assert.ok(!ids.includes('o-home') && !ids.includes('o-reserved') && !ids.includes('o-gone'))
  assert.equal(placeById(DONORS, OFFERS, 'donor-household-nicolina', { now: NOW }), null)
  assert.equal(placeById(DONORS, OFFERS, 'donor-unknown', { now: NOW }), null)
  const tudor = placeById(DONORS, OFFERS, 'donor-iasi-bistro-tudor', { now: NOW })
  assert.equal(tudor.count, 0, 'a restaurant page still exists when nothing is on sale')
})

test('a newly created offer is flagged on the next poll', () => {
  const before = placesFromOffers(DONORS, OFFERS, { now: NOW })
  const seen = new Set(before.flatMap(place => place.offers.map(item => item.id)))
  assert.equal(placesWithNewOffers(before, null).size, 0, 'nothing is new on the first load')
  const after = placesFromOffers(DONORS, [...OFFERS, offer('o-new', 'donor-iasi-bistro-tudor')], { now: NOW })
  assert.deepEqual([...placesWithNewOffers(after, seen)], ['donor-iasi-bistro-tudor'])
})

test('names, initials and distance', () => {
  assert.equal(displayName('Demo Bistro Copou (synthetic)'), 'Bistro Copou')
  assert.equal(initials('Ciorbăria Podu Roș (synthetic)'), 'CP')
  assert.equal(initials('Ștefan'), 'Ș')
  assert.equal(initials(''), '?')
  assert.equal(placePath({ id: 'donor a/b' }), '/personal/places/donor%20a%2Fb')
  assert.equal(distanceKm(USER_LOCATION, USER_LOCATION), 0)
  const km = distanceKm({ lat: 47.1585, lon: 27.6014 }, { lat: 47.1785, lon: 27.5735 })
  assert.ok(km > 2.8 && km < 3.2, `Palas to Copou is about 3 km, got ${km}`)
  assert.equal(formatKm(0.42), '400 m')
  assert.equal(formatKm(0.01), '50 m')
  assert.equal(formatKm(2.345), '2.3 km')
})

test('prices and discounts', () => {
  assert.equal(discountPct(offer('a', 'd')), 57)
  assert.equal(discountPct(offer('a', 'd', { original_price_ron: null })), null)
  assert.equal(discountPct(offer('a', 'd', { price_ron: null, original_price_ron: null })), null)
  assert.equal(discountPct(offer('a', 'd', { price_ron: 0, original_price_ron: 10 })), 100)
  assert.equal(formatRon(18), '18 lei')
  assert.equal(formatRon(12.5), '12,50 lei')
  assert.equal(priceUnit(offer('a', 'd')), 'per portion')
  assert.equal(priceUnit(offer('a', 'd', { portion_count: null })), 'for all of it')
})

test('pickup windows are shown in Bucharest time', () => {
  assert.equal(pickupLabel(offer('a', 'd', { available_from: '2026-10-17T17:00:00+03:00' }), NOW), 'Pickup now until 21:00')
  assert.equal(pickupLabel(offer('a', 'd'), NOW), 'Pickup 18:30–21:00')
  assert.equal(pickupLabel(offer('a', 'd', { available_from: '2026-10-18T17:00:00+03:00', pickup_deadline: '2026-10-18T19:30:00+03:00' }), NOW), 'Tomorrow 17:00–19:30')
  assert.equal(minutesLeft(offer('a', 'd'), NOW), 180)
  assert.equal(minutesLeft(offer('a', 'd', { pickup_deadline: '2026-10-17T10:00:00+03:00' }), NOW), 0)
})

test('labels for categories and allergens', () => {
  assert.equal(categoryLabel('prepared_meals'), 'Ready meals')
  assert.equal(categoryLabel('frozen_goods'), 'frozen goods')
  assert.equal(allergenText(null), 'Allergens not declared: ask the restaurant')
  assert.equal(allergenText([]), 'No allergens declared')
  assert.equal(allergenText(['gluten', 'milk']), 'Contains gluten, milk')
})

test('map circles escape names and show the cheapest price', () => {
  const [place] = placesFromOffers(DONORS, OFFERS, { now: NOW })
  const html = markerHtml(place, { isNew: true })
  assert.match(html, /food-pin food-pin--restaurant is-new/)
  assert.match(html, />TU</)
  assert.match(html, /food-pin-count">2</)
  assert.match(html, /from 9 lei/)
  assert.equal(escapeHtml(`<img src=x onerror="a">&'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')
  const evil = markerHtml({ ...place, name: '<script>x</script>', initials: '<b>', type: 'x" onclick="y' })
  assert.ok(!evil.includes('<script>') && !evil.includes('<b>') && !evil.includes('" onclick'))
})
