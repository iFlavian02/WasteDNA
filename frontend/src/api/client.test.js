import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createClient, createFixtureTransport } from './client.js'
import { createSessionController, SESSION_KEY } from './session.js'

test('redistribution calls attach session and expose common error', async () => {
  const seen = []
  const transport = createFixtureTransport({
    'GET /api/redistribution/offers': (_url, options) => {
      seen.push(options.headers['X-Demo-Session-Id'])
      return { status: 409, body: { error: { code: 'CONFLICT', message: 'Stale offer', details: [{ field: 'version', message: 'Old' }], request_id: 'req-1' } } }
    },
  })
  const client = createClient({ transport, getSessionId: () => 'sess-1' })
  await assert.rejects(client.request('/api/redistribution/offers'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 409)
    assert.equal(error.code, 'CONFLICT')
    assert.equal(error.requestId, 'req-1')
    assert.equal(error.details[0].field, 'version')
    return true
  })
  assert.deepEqual(seen, ['sess-1'])
})

test('demo session persists and resets after unknown session', async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let created = 0
  let reset = 0
  let session
  const transport = createFixtureTransport({
    'POST /api/redistribution/demo': () => ({ body: { session_id: `sess-${++created}` } }),
    'GET /api/redistribution/offers': (_url, options) => options.headers['X-Demo-Session-Id'] === 'sess-1'
      ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Unknown session' } } }
      : { body: [] },
    'GET /api/redistribution/donors': (_url, options) => options.headers['X-Demo-Session-Id'] === 'sess-1'
      ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Unknown session' } } }
      : { body: [] },
  })
  const client = createClient({ transport, getSessionId: () => session.getSessionId() })
  session = createSessionController({ client, storage, onReset: () => reset++ })
  assert.equal(await session.ensure(), 'sess-1')
  assert.equal(storage.getItem(SESSION_KEY), 'sess-1')
  await assert.rejects(session.request('/api/redistribution/offers'), { code: 'NOT_FOUND' })
  assert.equal(storage.getItem(SESSION_KEY), 'sess-2')
  assert.equal(reset, 1)
  assert.deepEqual(await session.request('/api/redistribution/offers'), [])
  assert.equal(await createSessionController({ client, storage }).ensure(), 'sess-2')
})

test('missing offer does not reset a valid session', async () => {
  const values = new Map([[SESSION_KEY, 'sess-valid']])
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let session
  const client = createClient({
    getSessionId: () => session.getSessionId(),
    transport: createFixtureTransport({
      'GET /api/redistribution/offers/missing': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Offer missing' } } },
      'GET /api/redistribution/donors': { body: [] },
    }),
  })
  session = createSessionController({ client, storage })
  await assert.rejects(session.request('/api/redistribution/offers/missing'), { status: 404 })
  assert.equal(session.getSessionId(), 'sess-valid')
})
