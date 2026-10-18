import assert from 'node:assert/strict'
import test from 'node:test'
import { activeNavigation, dashboardKpis, wasteValue, weeklyWaste } from './data.js'

test('dashboard exposes the supplied KPI and seven-day chart data', () => {
  assert.equal(dashboardKpis.length, 2)
  assert.equal(dashboardKpis[0].value, '775 kg')
  assert.deepEqual(weeklyWaste.map(item => item.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
})

test('chart values switch from grams to cost without mutating source data', () => {
  assert.equal(wasteValue(weeklyWaste[0], 'gr'), 80)
  assert.equal(wasteValue(weeklyWaste[0], 'EUR'), 0.72)
  assert.equal(weeklyWaste[0].grams, 80)
})

test('feature routes map to the redesigned navigation', () => {
  assert.equal(activeNavigation('/dashboard'), 'overview')
  assert.equal(activeNavigation('/personal'), 'overview')
  assert.equal(activeNavigation('/personal/places/donor-iasi-sushi-copou'), 'overview')
  assert.equal(activeNavigation('/'), null, 'the home menu is outside the shell')
  assert.equal(activeNavigation('/decisions/report'), 'goals')
  assert.equal(activeNavigation('/redistribution/offers/1'), 'tracked')
  assert.equal(activeNavigation('/upload'), 'settings')
  assert.equal(activeNavigation('/missing'), null)
})
