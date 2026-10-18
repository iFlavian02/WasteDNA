import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeNavigation, bestQuickWin, breakdownQuery, dashboardKpis, donutSegments, envelopeSettled, formatPercent, formatRon, monthLabel,
  monthPeriod, monthsBetween, niceMax, percentChange, previousQuery, shiftMonth, splitItems, weekdayBars,
} from './data.js'

const available = { from: '2025-06-01', to: '2025-11-27' }

test('months come from the dataset range and are clipped to it', () => {
  assert.deepEqual(monthsBetween(available), ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11'])
  assert.deepEqual(monthsBetween(null), [])
  assert.equal(monthLabel('2025-11'), 'November 2025')
  assert.equal(shiftMonth('2025-01', -1), '2024-12')
  assert.equal(shiftMonth('2025-12', 1), '2026-01')
  assert.deepEqual(monthPeriod('2025-11', available), { from: '2025-11-01', to: '2025-11-27' })
  assert.deepEqual(monthPeriod('2025-02', { from: '2025-02-10', to: '2025-12-31' }), { from: '2025-02-10', to: '2025-02-28' })
  assert.equal(monthPeriod('2025-05', available), null)
})

test('filters become breakdown queries, with the month before for comparison', () => {
  const month = { period: 'month', month: '2025-11', timeSlot: 'dinner', category: '' }
  assert.deepEqual(breakdownQuery(month, available), { time_slot: 'dinner', category: '', from: '2025-11-01', to: '2025-11-27' })
  assert.deepEqual(previousQuery(month, available), { time_slot: 'dinner', category: '', from: '2025-10-01', to: '2025-10-31' })
  assert.equal(previousQuery({ ...month, month: '2025-06' }, available), null, 'nothing before the first month')
  assert.equal(breakdownQuery(month, null), null, 'wait for the dataset range')
  const all = { period: 'all', month: '2025-11', timeSlot: '', category: 'soup' }
  assert.deepEqual(breakdownQuery(all, available), { time_slot: '', category: 'soup' })
  assert.equal(previousQuery(all, available), null)
})

test('KPIs come from the breakdown totals and compare per-day averages', () => {
  const totals = { prepared_portions: 1000, unsold_portions: 90, unsold_cost_ron: 900, unsold_rate: 0.09, days_with_data: 9 }
  const previous = { prepared_portions: 2000, unsold_portions: 200, unsold_cost_ron: 2000, unsold_rate: 0.1, days_with_data: 10 }
  const [cost, portions, rate] = dashboardKpis(totals, previous, 'October 2025')
  assert.equal(cost.value, '900 RON')
  assert.deepEqual(cost.change, { direction: 'down', text: '50% less per day than October 2025' })
  assert.equal(portions.value, '90')
  assert.equal(portions.detail, 'Of 1,000 prepared')
  assert.deepEqual(portions.change, { direction: 'down', text: '50% less per day than October 2025' })
  assert.equal(rate.value, '9%')
  assert.deepEqual(rate.change, { direction: 'down', text: '1 pp lower than October 2025' })
  assert.ok(dashboardKpis(totals, null, null).every(kpi => kpi.change === null), 'no comparison without a previous month')
  assert.ok(dashboardKpis(null, null, null).every(kpi => kpi.value === '—'), 'no numbers before the data arrives')
  assert.equal(dashboardKpis({ ...totals, unsold_cost_ron: 1800 }, { ...previous, unsold_cost_ron: 1000 }, 'X')[0].change.direction, 'up')
  assert.equal(percentChange(5, 0), null)
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

test('weekday bars use the breakdown averages in portions or RON on a round axis', () => {
  const byWeekday = [
    { weekday: 'Monday', days: 4, unsold_portions_per_day: 12, unsold_cost_ron_per_day: 110 },
    { weekday: 'Tuesday', days: 0, unsold_portions_per_day: null, unsold_cost_ron_per_day: null },
    { weekday: 'Friday', days: 4, unsold_portions_per_day: 31.5, unsold_cost_ron_per_day: 402 },
  ]
  const portions = weekdayBars(byWeekday, 'portions')
  assert.deepEqual(portions.bars.map(bar => [bar.day, bar.value]), [['Mon', 12], ['Tue', null], ['Fri', 31.5]])
  assert.equal(portions.max, 50)
  assert.deepEqual(portions.ticks, [50, 37.5, 25, 12.5, 0])
  assert.equal(portions.peak.weekday, 'Friday')
  assert.equal(weekdayBars(byWeekday, 'RON').max, 500)
  assert.equal(weekdayBars([], 'RON').peak, null)
  assert.deepEqual([niceMax(0), niceMax(1.2), niceMax(180), niceMax(250)], [1, 2, 200, 250])
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
