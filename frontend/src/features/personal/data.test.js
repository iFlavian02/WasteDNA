import assert from 'node:assert/strict'
import test from 'node:test'
import { personalKpis, recentRescues, totalSaved } from './data.js'

test('personal home has two KPIs and recent rescues', () => {
  assert.deepEqual(personalKpis.map(kpi => kpi.label), ['Food rescued', 'Money saved'])
  assert.equal(new Set(recentRescues.map(rescue => rescue.id)).size, recentRescues.length)
  assert.equal(totalSaved(recentRescues), 101)
  assert.equal(totalSaved([]), 0)
})
