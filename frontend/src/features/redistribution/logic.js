/**
 * Pure rules for the redistribution pages: form validation, prefill mapping,
 * Europe/Bucharest time handling and error wording. No React, no network, so
 * everything here is unit-tested with `node --test`.
 */

export const TIME_ZONE = 'Europe/Bucharest'
export const STORAGE_OPTIONS = ['ambient', 'chilled', 'frozen']
export const OFFER_STATUSES = ['available', 'reserved', 'collected', 'expired', 'cancelled']
export const STATUS_LABELS = {
  available: 'Available',
  reserved: 'Reserved',
  collected: 'Collected',
  expired: 'Expired',
  cancelled: 'Cancelled',
  released: 'Released',
}

/**
 * Restaurant dish categories (member 4's actions) mapped to offer categories.
 * Agreed with member 4 in docs/fixtures/decisions/REQUESTS.md.
 */
export const RESTAURANT_CATEGORY_MAP = {
  soup: 'prepared_meals',
  main: 'prepared_meals',
  side: 'prepared_meals',
  daily_menu: 'prepared_meals',
  dessert: 'bakery',
}

// Time handling. The backend needs timestamps with an explicit offset; the
// demo works in Europe/Bucharest regardless of the viewer's own time zone.

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function wallParts(ms) {
  const parts = Object.fromEntries(wallClock.formatToParts(new Date(ms)).map(part => [part.type, part.value]))
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second }
}

/** Offset of Europe/Bucharest from UTC, in minutes, at the instant `ms`. */
export function bucharestOffsetMinutes(ms) {
  const p = wallParts(ms)
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000)
}

const pad = value => String(value).padStart(2, '0')

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** `"2026-10-17T17:00"` (Bucharest wall time) → `"2026-10-17T17:00:00+03:00"`. */
export function localInputToIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const offset = bucharestOffsetMinutes(wall - bucharestOffsetMinutes(wall) * 60000)
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00${formatOffset(offset)}`
}

/** Instant (ISO string, Date or ms) → `"YYYY-MM-DDTHH:mm"` in Bucharest wall time. */
export function toLocalInput(instant) {
  const p = wallParts(new Date(instant).getTime())
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** `"YYYY-MM-DD"` for the Bucharest calendar day of `instant`. */
export function bucharestDate(instant) {
  return toLocalInput(instant).slice(0, 10)
}

const displayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(instant) {
  return instant ? displayFormat.format(new Date(instant)) : '—'
}

export function formatKg(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kg`
}

// Prefill (member 4's actions screen sends only category + description)

/**
 * Turn navigation prefill into form suggestions. Quantity and deadlines are
 * never prefilled: the donor confirms the real values.
 */
export function mapPrefill(prefill, acceptedCategories = []) {
  if (!prefill) return null
  const raw = String(prefill.category || '').trim().toLowerCase()
  const accepted = new Set(acceptedCategories)
  let category = ''
  let note = null
  if (accepted.has(raw)) category = raw
  else if (RESTAURANT_CATEGORY_MAP[raw]) {
    category = RESTAURANT_CATEGORY_MAP[raw]
    note = `Dish category "${raw}" is offered as "${category}".`
  } else if (raw) note = `Category "${raw}" is not accepted by any organization in this demo; choose one.`
  return { category, description: String(prefill.description || '').slice(0, 500), note }
}

// Validation

function parseNumber(text) {
  if (text === null || text === undefined || String(text).trim() === '') return null
  const value = Number(String(text).replace(',', '.'))
  return Number.isFinite(value) ? value : NaN
}

export function parseTags(text) {
  return [...new Set(String(text || '').split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort()
}

export const EMPTY_OFFER_FORM = {
  donorId: '',
  category: '',
  description: '',
  allergenMode: '', // 'declared' | 'none' | 'unknown'
  allergens: '',
  storage: [],
  quantityKg: '',
  portionCount: '',
  priceRon: '', // optional customer price (per portion, or for the whole offer)
  originalPriceRon: '', // optional regular price, for the discount
  availableFrom: '',
  pickupDeadline: '',
  confirmed: false,
}

/**
 * Validate the offer form. Returns `{ errors, payload }`; `payload` is the
 * POST /offers body and is null while there are errors.
 */
export function validateOffer(form, now = new Date()) {
  const errors = {}
  if (!form.donorId) errors.donorId = 'Choose the donor.'
  if (!form.category) errors.category = 'Choose a food category.'
  const allergens = parseTags(form.allergens)
  if (!form.allergenMode) errors.allergens = 'State the allergens, confirm there are none, or mark them unknown.'
  else if (form.allergenMode === 'declared' && allergens.length === 0) errors.allergens = 'List at least one allergen, or choose "no allergens".'
  const quantity = parseNumber(form.quantityKg)
  if (quantity === null) errors.quantityKg = 'Enter the real quantity available, in kg.'
  else if (!(quantity > 0)) errors.quantityKg = 'Quantity must be a number greater than zero.'
  else if (quantity > 100000) errors.quantityKg = 'Quantity is unrealistically large.'
  const portions = parseNumber(form.portionCount)
  if (portions !== null && !(Number.isInteger(portions) && portions > 0)) errors.portionCount = 'Portions must be a whole number above zero, or empty.'
  const price = parseNumber(form.priceRon)
  const original = parseNumber(form.originalPriceRon)
  if (price !== null && !(price >= 0 && price <= 10000)) errors.priceRon = 'Price must be between 0 and 10,000 lei, or empty.'
  if (original !== null && !(original > 0 && original <= 10000)) errors.originalPriceRon = 'Regular price must be above 0 and at most 10,000 lei, or empty.'
  else if (original !== null && price === null) errors.priceRon = 'Enter the sale price, or leave the regular price empty.'
  else if (original !== null && price > original) errors.priceRon = 'The sale price must not be higher than the regular price.'
  const from = localInputToIso(form.availableFrom)
  const deadline = localInputToIso(form.pickupDeadline)
  if (!from) errors.availableFrom = 'Enter when the food can be picked up.'
  if (!deadline) errors.pickupDeadline = 'Enter the pickup deadline.'
  if (from && deadline && Date.parse(from) >= Date.parse(deadline)) errors.pickupDeadline = 'The deadline must be after the start of the pickup window.'
  else if (deadline && Date.parse(deadline) <= new Date(now).getTime()) errors.pickupDeadline = 'The deadline must be in the future.'
  if (!form.confirmed) errors.confirmed = 'The donor must confirm the quantity and pickup deadline.'
  if (Object.keys(errors).length) return { errors, payload: null }
  return {
    errors,
    payload: {
      donor_id: form.donorId,
      category: form.category,
      description: form.description.trim(),
      allergens: form.allergenMode === 'unknown' ? null : form.allergenMode === 'none' ? [] : allergens,
      storage_requirements: [...form.storage].sort(),
      quantity_kg: quantity,
      portion_count: portions,
      available_from: from,
      pickup_deadline: deadline,
      ...(price === null ? {} : { price_ron: price, original_price_ron: original }),
    },
  }
}

export function validateHandover(form, offer, now = new Date()) {
  const errors = {}
  const quantity = parseNumber(form.receivedKg)
  if (quantity === null) errors.receivedKg = 'Enter the quantity actually received, in kg.'
  else if (!(quantity > 0)) errors.receivedKg = 'Received quantity must be greater than zero.'
  else if (offer && quantity > offer.quantity_kg) errors.receivedKg = `Cannot exceed the offered ${formatKg(offer.quantity_kg)}.`
  const receivedAt = localInputToIso(form.receivedAt)
  if (!receivedAt) errors.receivedAt = 'Enter when the food was received.'
  else if (Date.parse(receivedAt) > new Date(now).getTime() + 5 * 60000) errors.receivedAt = 'Received time cannot be in the future.'
  else if (offer && Date.parse(receivedAt) > Date.parse(offer.pickup_deadline)) errors.receivedAt = 'Received time must be before the pickup deadline.'
  if (Object.keys(errors).length) return { errors, payload: null }
  return { errors, payload: { received_quantity_kg: quantity, received_at: receivedAt, idempotency_key: form.idempotencyKey } }
}

export function validateSurplusLog(form, now = new Date()) {
  const errors = {}
  if (!form.donorId) errors.donorId = 'Choose the donor.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '')) errors.date = 'Choose the day.'
  else if (form.date > bucharestDate(now)) errors.date = 'Only today or past days can be confirmed.'
  const quantity = parseNumber(form.quantityKg)
  if (quantity === null) errors.quantityKg = 'Enter the total surplus in kg (0 if there was none).'
  else if (!(quantity >= 0)) errors.quantityKg = 'Quantity cannot be negative.'
  if (Object.keys(errors).length) return { errors, payload: null }
  return { errors, payload: { donor_id: form.donorId, date: form.date, quantity_kg: quantity } }
}

// Idempotency keys

/**
 * Deterministic: retrying the same reservation (same offer version and
 * organization) replays the original result instead of conflicting.
 */
export function reserveKey(offer, organizationId) {
  return `reserve-${offer.id}-${organizationId}-v${offer.version}`
}

export function newKey(prefix) {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${random}`
}

// Errors

/** Human wording for an `ApiError` (or a network failure). */
export function describeError(error) {
  const details = (error?.details || []).map(detail => (detail.field ? `${detail.field.replace(/^body\./, '')}: ${detail.message}` : detail.message))
  switch (error?.status) {
    case 409:
      return { title: 'Changed in the meantime', message: `${error.message} The latest data has been reloaded.`, details }
    case 422:
      return { title: 'Not accepted', message: error.message, details }
    case 400:
      return { title: 'Check the form', message: error.message, details }
    case 404:
      return { title: 'Not found', message: `${error.message} If the demo session was reset, previous offers are gone.`, details }
    case undefined:
      return { title: 'Cannot reach the server', message: 'Check that the backend is running, then try again.', details }
    default:
      return { title: 'Something went wrong', message: error.message || 'Unexpected error.', details }
  }
}

/** Latest reservation that holds the offer (reserved or collected), if any. */
export function activeReservationFor(offerId, reservations) {
  return [...reservations].reverse().find(item => item.offer_id === offerId && (item.status === 'reserved' || item.status === 'collected')) || null
}

/** Organization display name; falls back to the opaque ID. */
export function nameOf(directory, id) {
  return directory?.get(id)?.name || id
}
