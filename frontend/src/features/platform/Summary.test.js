import assert from 'node:assert/strict'
import test from 'node:test'
import { allSettled } from './status.js'

test('polling stops only when every component reaches a terminal state', () => {
  assert.equal(allSettled({ patterns: 'ready', model: 'running' }), false)
  assert.equal(allSettled({ patterns: 'error', model: 'insufficient_data' }), true)
  assert.equal(allSettled({ patterns: 'queued', model: 'ready' }), false)
  assert.equal(allSettled({ patterns: 'ready', model: 'ready' }), true)
})
