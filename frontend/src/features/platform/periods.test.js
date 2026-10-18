import assert from 'node:assert/strict'
import test from 'node:test'
import { canShift, clampRange, comparisonName, periodLabel, periodRange, periodStart, perDayChange, shiftPeriod } from './periods.js'

test('period ranges for week, month and quarter', () => {
  assert.equal(periodStart('week', '2026-10-18'), '2026-10-12')
  assert.deepEqual(periodRange('week', '2026-10-18'), { from: '2026-10-12', to: '2026-10-18' })
  assert.deepEqual(periodRange('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(periodRange('month', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' })
  assert.deepEqual(periodRange('quarter', '2026-11-30'), { from: '2026-10-01', to: '2026-12-31' })
})

test('shifting crosses year boundaries', () => {
  assert.equal(shiftPeriod('month', '2026-01-15', -1), '2025-12-01')
  assert.equal(shiftPeriod('quarter', '2026-11-01', 1), '2027-01-01')
  assert.equal(shiftPeriod('week', '2026-12-30', 1), '2027-01-04')
})

test('labels and comparison names', () => {
  assert.equal(periodLabel('month', '2026-10-05'), 'October 2026')
  assert.equal(periodLabel('quarter', '2026-10-05'), 'Q4 2026')
  assert.equal(periodLabel('week', '2026-10-14'), '12 Oct – 18 Oct')
  assert.equal(comparisonName('month', '2026-01-01'), 'December')
  assert.equal(comparisonName('quarter', '2026-01-01'), 'Q4')
  assert.equal(comparisonName('week', '2026-01-01'), 'previous week')
})

test('ranges are limited to dates with data and navigation stops at the edges', () => {
  const available = { from: '2026-07-20', to: '2026-10-17' }
  assert.deepEqual(clampRange(periodRange('month', '2026-10-01'), available), { from: '2026-10-01', to: '2026-10-17' })
  assert.deepEqual(clampRange(periodRange('month', '2026-07-01'), available), { from: '2026-07-20', to: '2026-07-31' })
  assert.equal(clampRange(periodRange('month', '2026-11-01'), available), null)
  assert.equal(canShift('month', '2026-10-01', 1, available), false)
  assert.equal(canShift('month', '2026-10-01', -1, available), true)
  assert.equal(canShift('month', '2026-07-01', -1, available), false)
  assert.equal(clampRange({ from: '2026-01-01', to: '2026-01-31' }, null), null)
})

test('change is compared per day with data', () => {
  const current = { unsold_cost_ron: 170, days_with_data: 17 }
  const previous = { unsold_cost_ron: 300, days_with_data: 30 }
  assert.equal(perDayChange(current, previous, 'unsold_cost_ron'), 0)
  assert.equal(Math.round(perDayChange({ unsold_cost_ron: 90, days_with_data: 10 }, previous, 'unsold_cost_ron') * 100), -10)
  assert.equal(perDayChange(current, { unsold_cost_ron: 0, days_with_data: 30 }, 'unsold_cost_ron'), null)
  assert.equal(perDayChange(current, { days_with_data: 0 }, 'unsold_cost_ron'), null)
})
