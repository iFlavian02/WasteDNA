import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatasetController, isMissingDataset } from './dataset.js'

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
