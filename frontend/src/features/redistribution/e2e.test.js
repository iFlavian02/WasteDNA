/**
 * Opt-in end-to-end check against a running backend, through the same modules
 * the pages use (member 1's client + session controller, this feature's api.js
 * and logic.js). Skipped unless WASTEDNA_API_URL is set, e.g.
 *   WASTEDNA_API_URL=http://localhost:8000 node --test src/features/redistribution/e2e.test.js
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createClient } from '../../api/client.js'
import { createSessionController } from '../../api/session.js'
import { redistributionApi } from './api.js'
import { localInputToIso, mapPrefill, reserveKey, toLocalInput, validateOffer } from './logic.js'

const BASE = process.env.WASTEDNA_API_URL
const memoryStorage = () => {
  const items = new Map()
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
}

function connect() {
  let controller
  const client = createClient({ baseUrl: BASE, getSessionId: () => controller.getSessionId() })
  controller = createSessionController({ client, storage: memoryStorage() })
  return { api: redistributionApi({ request: controller.request }), controller }
}

const inHours = hours => toLocalInput(Date.now() + hours * 3600000)

test('offer → match → reserve → handover → impact for every donor type', { skip: !BASE }, async t => {
  const { api, controller } = connect()
  const [donors, organizations] = await Promise.all([api.donors(), api.organizations()])
  assert.ok(controller.getSessionId().startsWith('sess-'))
  assert.deepEqual(new Set(donors.map(donor => donor.type)), new Set(['restaurant', 'supermarket', 'household']))
  const categories = [...new Set(organizations.flatMap(org => org.accepted_categories))]
  const before = await api.impact()

  let received = 0
  for (const donor of donors) {
    // Prefill from member 4 maps the dish category; quantity and window are entered by the donor.
    const suggestion = mapPrefill({ category: 'main', description: `Test surplus from ${donor.type}` }, categories)
    const { payload, errors } = validateOffer({
      donorId: donor.id, category: suggestion.category, description: suggestion.description,
      allergenMode: 'none', allergens: '', storage: ['chilled'], quantityKg: '3', portionCount: '',
      availableFrom: inHours(0.1), pickupDeadline: inHours(3), confirmed: true,
    })
    assert.deepEqual(errors, {})
    const offer = await api.createOffer(payload)
    const matches = await api.matches(offer.id)
    // Opening hours may close the window depending on when this runs; then there is simply no match.
    if (matches.eligible.length === 0) {
      assert.ok(matches.rejected.every(item => item.reasons.length > 0))
      continue
    }
    const organizationId = matches.eligible[0].organization_id
    const body = { organization_id: organizationId, offer_version: offer.version, idempotency_key: reserveKey(offer, organizationId) }
    const reservation = await api.reserve(offer.id, body)
    assert.deepEqual(await api.reserve(offer.id, body), reservation, 'retry replays the original reservation')
    const handover = { received_quantity_kg: 2.5, received_at: localInputToIso(toLocalInput(Date.now())), idempotency_key: `h-${offer.id}` }
    await api.handover(reservation.reservation_id, handover)
    await api.handover(reservation.reservation_id, handover)
    received += 2.5
  }
  const after = await api.impact()
  t.diagnostic(`completed handovers: ${received / 2.5} of ${donors.length} donors (others had no open organization at this hour)`)
  if (process.env.WASTEDNA_E2E_REQUIRE_MATCHES) assert.equal(received / 2.5, donors.length)
  assert.equal(Math.round((after.handed_over_quantity_kg - before.handed_over_quantity_kg) * 100) / 100, received)
})

test('no-match, unknown allergens, expired and conflict states', { skip: !BASE }, async () => {
  const { api } = connect()
  const offers = await api.offers()
  const byScenario = description => offers.find(offer => offer.description.startsWith(description))

  const frozen = byScenario('Frozen dumplings')
  const cake = byScenario('Homemade cake')
  const expired = offers.find(offer => offer.status === 'expired')
  if (frozen.status === 'available') assert.deepEqual((await api.matches(frozen.id)).eligible, [])
  if (cake.status === 'available') {
    const matches = await api.matches(cake.id)
    assert.deepEqual(matches.eligible, [])
    assert.ok(matches.rejected.every(item => item.reasons.some(reason => reason.startsWith('Allergens unknown'))))
  }
  await assert.rejects(api.matches(expired.id), error => error instanceof ApiError && error.status === 409)

  const bread = byScenario('Unsold loaves')
  if (bread.status === 'available') {
    const { eligible } = await api.matches(bread.id)
    if (eligible.length >= 2) {
      await api.reserve(bread.id, { organization_id: eligible[0].organization_id, offer_version: bread.version, idempotency_key: 'first' })
      await assert.rejects(
        api.reserve(bread.id, { organization_id: eligible[1].organization_id, offer_version: bread.version, idempotency_key: 'second' }),
        error => error.status === 409 && error.code === 'CONFLICT',
      )
    }
  }
})

test('forecasts and surplus log', { skip: !BASE }, async () => {
  const { api } = connect()
  const forecast = await api.forecasts(7)
  const states = Object.fromEntries(forecast.items.map(item => [item.donor_id, item.status]))
  assert.equal(states['donor-household-nicolina'], 'insufficient_data')
  assert.equal(states['donor-restaurant-copou'], 'ready')
  const entry = await api.logSurplus({ donor_id: 'donor-household-nicolina', date: '2020-01-01', quantity_kg: 0 })
  assert.equal(entry.quantity_kg, 0)
  await assert.rejects(api.logSurplus({ donor_id: 'donor-household-nicolina', date: '2020-01-01', quantity_kg: 1 }), error => error.status === 409)
})
