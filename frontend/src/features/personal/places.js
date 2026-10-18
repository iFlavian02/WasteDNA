/**
 * Pure helpers for the personal account's food map (docs/PERSONAL_MAP.md).
 * They turn the redistribution API's donors and offers into map places. No
 * React, Leaflet or network here, so everything is tested with `node --test`.
 */

export const TIME_ZONE = 'Europe/Bucharest'
/** Map view: central Iași, between Piața Unirii, Palas and Tătărași. */
export const IASI_CENTER = { lat: 47.1625, lon: 27.5915 }
export const IASI_ZOOM = 14
/** The demo customer's position (Centru, near Palas). */
export const USER_LOCATION = { lat: 47.1600, lon: 27.5865 }
/** How often the map asks the backend for new or changed offers. */
export const POLL_MS = 15000

export const CATEGORY_LABELS = {
  prepared_meals: 'Ready meals',
  bakery: 'Bakery & desserts',
  bread: 'Bread',
  produce: 'Fruit & veg',
  dairy: 'Dairy',
  canned: 'Pantry',
}

/** Route of a place's page. */
export const placePath = place => `/personal/places/${encodeURIComponent(place.id)}`

export const categoryLabel = category => CATEGORY_LABELS[category] || String(category || '').replace(/_/g, ' ')

/** Demo names carry "Demo … (synthetic)"; the page shows a "Demo data" badge instead. */
export function displayName(name) {
  return String(name || '').replace(/\s*\(synthetic\)\s*$/i, '').replace(/^Demo\s+/, '').trim()
}

export function initials(name) {
  const words = displayName(name).split(/\s+/).filter(word => /\p{L}/u.test(word))
  return words.slice(0, 2).map(word => word.match(/\p{L}/u)[0].toUpperCase()).join('') || '?'
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const rad = degrees => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function formatKm(km) {
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`
}

/** Whole percent off the regular price, or null when the offer has no regular price. */
export function discountPct(offer) {
  const { price_ron: price, original_price_ron: original } = offer
  if (price === null || price === undefined || !original) return null
  return Math.round((1 - price / original) * 100)
}

export function formatRon(value) {
  const amount = Number(value)
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',')
  return `${text} lei`
}

export const isPriced = offer => offer.price_ron !== null && offer.price_ron !== undefined

/** What the price buys: one portion, or the whole offer when it has no portions. */
export const priceUnit = offer => (offer.portion_count ? 'per portion' : 'for all of it')

/** An offer a customer can still collect: available and before its deadline. */
export function isLive(offer, now = new Date()) {
  return offer.status === 'available' && Date.parse(offer.pickup_deadline) > new Date(now).getTime()
}

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "Pickup now until 19:30", "Pickup 17:00–19:30" or "Tomorrow 17:00–19:30" (Bucharest time). */
export function pickupLabel(offer, now = new Date()) {
  const from = new Date(offer.available_from)
  const to = new Date(offer.pickup_deadline)
  const current = new Date(now)
  if (from <= current) return `Pickup now until ${clock.format(to)}`
  const tomorrow = day.format(new Date(current.getTime() + 864e5))
  const prefix = day.format(from) === day.format(current) ? 'Pickup' : day.format(from) === tomorrow ? 'Tomorrow' : day.format(from)
  return `${prefix} ${clock.format(from)}–${clock.format(to)}`
}

/** Minutes until the deadline (never negative). */
export function minutesLeft(offer, now = new Date()) {
  return Math.max(0, Math.floor((Date.parse(offer.pickup_deadline) - new Date(now).getTime()) / 60000))
}

export function allergenText(allergens) {
  if (allergens === null || allergens === undefined) return 'Allergens not declared: ask the restaurant'
  return allergens.length ? `Contains ${allergens.join(', ')}` : 'No allergens declared'
}

function placeOf(donor, offers, now, from) {
  const live = offers
    .filter(offer => offer.donor_id === donor.id && isLive(offer, now))
    .sort((a, b) => Date.parse(a.pickup_deadline) - Date.parse(b.pickup_deadline) || a.id.localeCompare(b.id))
  const prices = live.filter(isPriced).map(offer => offer.price_ron)
  const discounts = live.map(discountPct).filter(value => value !== null)
  return {
    id: donor.id,
    name: displayName(donor.name),
    type: donor.type,
    initials: initials(donor.name),
    location: donor.location,
    offers: live,
    count: live.length,
    cheapest: prices.length ? Math.min(...prices) : null,
    maxDiscount: discounts.length ? Math.max(...discounts) : null,
    distanceKm: distanceKm(from, donor.location),
  }
}

/**
 * Places for the map: every restaurant or shop with at least one live offer,
 * nearest first. Households are never shown, because their location is a
 * private home.
 */
export function placesFromOffers(donors, offers, { now = new Date(), from = USER_LOCATION } = {}) {
  return donors
    .filter(donor => donor.type !== 'household')
    .map(donor => placeOf(donor, offers, now, from))
    .filter(place => place.count > 0)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
}

/** One place for its page, also when it has nothing on sale; null for unknown donors and households. */
export function placeById(donors, offers, donorId, { now = new Date(), from = USER_LOCATION } = {}) {
  const donor = donors.find(item => item.id === donorId)
  return donor && donor.type !== 'household' ? placeOf(donor, offers, now, from) : null
}

/** IDs of places that gained an offer since the previous load (`seen` = offer IDs then). */
export function placesWithNewOffers(places, seen) {
  if (!seen) return new Set()
  return new Set(places.filter(place => place.offers.some(offer => !seen.has(offer.id))).map(place => place.id))
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

/** HTML of a map circle (a Leaflet divIcon): initials, offer count and a name label. */
export function markerHtml(place, { isNew = false } = {}) {
  const price = place.cheapest === null ? `${place.count} on sale` : `from ${formatRon(place.cheapest)}`
  return `<span class="food-pin food-pin--${escapeHtml(place.type)}${isNew ? ' is-new' : ''}">`
    + `<span class="food-pin-circle">${escapeHtml(place.initials)}</span>`
    + `<span class="food-pin-count">${place.count}</span>`
    + `<span class="food-pin-label"><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(price)}</small></span>`
    + '</span>'
}
