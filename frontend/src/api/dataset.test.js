import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatasetController, isMissingDataset } from './dataset.js'
import { createClient, createFixtureTransport } from './client.js'

test('dataset selection persists and can be cleared', () => {
  const data = new Map()
  const changes = []
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  const controller = createDatasetController({ storage, onChange: value => changes.push(value) })
  assert.equal(controller.read(), null)
  controller.save({ dataset_id: 'abc', is_synthetic: true, extra: 'ignored' })
  assert.deepEqual(createDatasetController({ storage, onChange() {} }).read(), { dataset_id: 'abc', is_synthetic: true })
  controller.clear()
  assert.equal(controller.read(), null)
  assert.deepEqual(changes, [{ dataset_id: 'abc', is_synthetic: true }, null])
})

test('invalid persisted state and missing dataset responses are handled', () => {
  const storage = { getItem: () => '{bad' }
  assert.equal(createDatasetController({ storage, onChange() {} }).read(), null)
  assert.equal(isMissingDataset({ status: 404 }), true)
  assert.equal(isMissingDataset({ status: 410 }), true)
  assert.equal(isMissingDataset({ status: 500 }), false)
})

test('invalid upload preserves the selected dataset and exposes row errors', async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const controller = createDatasetController({ storage, onChange() {} })
  controller.save({ dataset_id: 'existing', is_synthetic: false })
  const client = createClient({ transport: createFixtureTransport({
    'POST /api/datasets': { status: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid CSV', details: [{ row: 2, message: 'Sold exceeds prepared' }] } } },
  }) })
  const body = new FormData()
  body.append('file', new Blob(['date,dish_id\ninvalid,row'], { type: 'text/csv' }), 'bad.csv')
  await assert.rejects(client.request('/api/datasets', { method: 'POST', body }), error => {
    assert.equal(error.status, 422)
    assert.deepEqual(error.details, [{ row: 2, message: 'Sold exceeds prepared' }])
    return true
  })
  assert.deepEqual(controller.read(), { dataset_id: 'existing', is_synthetic: false })
})

test('switching datasets replaces persisted identity across refresh', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const controller = createDatasetController({ storage, onChange() {} })
  controller.save({ dataset_id: 'first', is_synthetic: false })
  controller.save({ dataset_id: 'second', is_synthetic: true })
  assert.deepEqual(createDatasetController({ storage, onChange() {} }).read(), { dataset_id: 'second', is_synthetic: true })
})
