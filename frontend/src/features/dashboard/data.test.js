import assert from 'node:assert/strict'
import test from 'node:test'
import { activeNavigation, bestQuickWin, dashboardKpis, donutSegments, envelopeSettled, formatPercent, formatRon, splitItems, wasteValue, weeklyWaste } from './data.js'

test('dashboard exposes the supplied KPI and seven-day chart data', () => {
  assert.equal(dashboardKpis.length, 1)
  assert.equal(dashboardKpis[0].value, "EUR 6'985")
  assert.deepEqual(weeklyWaste.map(item => item.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
})

test('split items calculate service and category shares ordered by cost', () => {
  const breakdown = {
    by_time_slot: [{ time_slot: 'dinner', unsold_cost_ron: 30 }, { time_slot: 'lunch', unsold_cost_ron: 70 }],
    by_category: [{ category: 'daily_menu', unsold_cost_ron: 10 }, { category: 'main', unsold_cost_ron: 40 }],
  }
  assert.deepEqual(splitItems(breakdown, 'service'), { total: 100, items: [
    { key: 'lunch', name: 'Lunch', value: 70, share: 0.7 },
    { key: 'dinner', name: 'Dinner', value: 30, share: 0.3 },
  ] })
  assert.deepEqual(splitItems(breakdown, 'category').items.map(item => item.name), ['Main', 'Daily Menu'])
  assert.deepEqual(splitItems(null, 'service'), { items: [], total: 0 })
  assert.deepEqual(donutSegments(splitItems(breakdown, 'service').items).map(item => item.offset), [0, 70])
})

test('quick win selects one largest ready opportunity and formats its evidence', () => {
  const envelope = { status: 'ready', result: { items: [
    { id: 'small', opportunity_ron_per_30_days: 100 },
    { id: 'large', opportunity_ron_per_30_days: 751.15 },
  ] } }
  assert.equal(bestQuickWin(envelope).id, 'large')
  assert.equal(bestQuickWin({ status: 'running', result: envelope.result }), null)
  assert.equal(envelopeSettled({ status: 'insufficient_data' }), true)
  assert.equal(envelopeSettled({ status: 'queued' }), false)
  assert.equal(formatRon(751.15), '751 RON')
  assert.equal(formatPercent(0.533), '53.3%')
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
  assert.equal(activeNavigation('/personal/orders'), 'orders')
  assert.equal(activeNavigation('/'), null, 'the home menu is outside the shell')
  assert.equal(activeNavigation('/decisions/report'), 'goals')
  assert.equal(activeNavigation('/redistribution/offers/1'), 'tracked')
  assert.equal(activeNavigation('/upload'), 'settings')
  assert.equal(activeNavigation('/summary'), 'settings', 'the dataset summary is part of the Data tab')
  assert.equal(activeNavigation('/missing'), null)
})
