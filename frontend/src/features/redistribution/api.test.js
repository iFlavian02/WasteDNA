import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ApiError, createClient, createFixtureTransport } from '../../api/client.js'
import { redistributionApi } from './api.js'

const fixture = name => JSON.parse(readFileSync(new URL(`../../../../docs/fixtures/redistribution/${name}`, import.meta.url), 'utf8'))

function clientWith(fixtures, calls = []) {
  const recorded = Object.fromEntries(Object.entries(fixtures).map(([key, value]) => [key, (url, options) => {
    calls.push({ key, url, body: options.body ? JSON.parse(options.body) : undefined, session: options.headers['X-Demo-Session-Id'] })
    return value
  }]))
  return redistributionApi(createClient({ transport: createFixtureTransport(recorded), getSessionId: () => 'sess-test' }))
}

test('wrappers call the documented paths with the session header and bodies', async () => {
  const calls = []
  const client = clientWith({
    'GET /api/redistribution/offers': { body: [fixture('offer_created.json')] },
    'GET /api/redistribution/offers/offer-demo01/matches': { body: fixture('matches_success.json') },
    'POST /api/redistribution/offers/offer-demo01/reservations': { status: 201, body: fixture('reservation_created.json') },
    'POST /api/redistribution/reservations/res-demo01/handover': { status: 201, body: fixture('handover_collected.json') },
    'GET /api/redistribution/forecasts': { body: fixture('forecasts_demo.json') },
    'GET /api/redistribution/impact': { body: fixture('impact.json') },
  }, calls)

  const offers = await client.offers({ status: 'available', category: '' })
  assert.equal(offers[0].id, 'offer-demo01')
  assert.equal((await client.matches('offer-demo01')).eligible.length, 2)
  const body = { organization_id: 'org-foodbank-nord', offer_version: 1, idempotency_key: 'k' }
  assert.equal((await client.reserve('offer-demo01', body)).status, 'reserved')
  await client.handover('res-demo01', { received_quantity_kg: 7.5, received_at: '2026-10-17T17:40:00+03:00', idempotency_key: 'h' })
  assert.equal((await client.forecasts(7)).horizon_days, 7)
  assert.equal((await client.impact({ from: '2026-10-17' })).handover_count, 1)

  assert.ok(calls.every(call => call.session === 'sess-test'))
  assert.equal(calls[0].url, '/api/redistribution/offers?status=available')
  assert.deepEqual(calls[2].body, body)
  assert.equal(calls[4].url, '/api/redistribution/forecasts?days=7')
  assert.equal(calls[5].url, '/api/redistribution/impact?from=2026-10-17')
})

test('conflicts surface as ApiError with the common envelope', async () => {
  const client = clientWith({ 'POST /api/redistribution/offers/offer-demo01/reservations': { status: 409, body: fixture('reservation_conflict_error.json') } })
  await assert.rejects(client.reserve('offer-demo01', {}), error => error instanceof ApiError && error.status === 409 && error.code === 'CONFLICT')
})

test('ids are URL-encoded', async () => {
  const calls = []
  const client = clientWith({ 'GET /api/redistribution/offers/a%2Fb': { body: {} } }, calls)
  await client.offer('a/b')
  assert.equal(calls[0].url, '/api/redistribution/offers/a%2Fb')
})
