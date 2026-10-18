import assert from 'node:assert/strict'
import test from 'node:test'
import { analysisProgress, bestQuickWin, componentRows, envelopeSettled, formatPercent, formatRon, fullWeeks, lossFigures, moneyByDish, weeklyTotals } from './logic.js'

const summary = {
  prepared_portions: 1000,
  sold_portions: 800,
  unsold_portions: 200,
  unsold_cost_ron: 3000,
  unsold_rate: 0.2,
  monthly_equivalent_unsold_cost_ron: 1500,
  period: { from: '2025-06-01', to: '2025-07-30', calendar_days: 60 },
  top_dishes: [
    { dish_id: 'd1', dish_name: 'Soup', category: 'soup', unsold_cost_ron: 1200, unsold_portions: 80 },
    { dish_id: 'd2', dish_name: 'Cake', category: 'dessert', unsold_cost_ron: 300, unsold_portions: 20 },
  ],
}

test('formatting handles missing values', () => {
  assert.equal(formatRon(157463.5), '157,464 RON')
  assert.equal(formatRon(null), '—')
  assert.equal(formatPercent(0.1743), '17.4%')
  assert.equal(formatPercent(null), '—')
})

test('weekly totals start on Monday and keep partial weeks', () => {
  const weeks = weeklyTotals([
    { date: '2025-06-01', prepared_portions: 10, sold_portions: 8, unsold_portions: 2 }, // Sunday
    { date: '2025-06-02', prepared_portions: 10, sold_portions: 5, unsold_portions: 5 }, // Monday
    { date: '2025-06-08', prepared_portions: 10, sold_portions: 9, unsold_portions: 1 }, // Sunday
  ])
  assert.deepEqual(weeks.map(week => [week.week, week.unsold, week.days]), [['2025-05-26', 2, 1], ['2025-06-02', 6, 2]])
  assert.equal(weeks[1].label, '2 Jun')
  assert.deepEqual(weeklyTotals(), [])
  assert.deepEqual(fullWeeks([{ days: 7 }, { days: 3 }]), [{ days: 7 }])
})

test('loss figures derive yearly and per-day values', () => {
  const figures = lossFigures(summary)
  assert.equal(figures.monthly, 1500)
  assert.equal(Math.round(figures.yearly), 18250)
  assert.equal(figures.unsoldPerDay, 200 / 60)
  assert.equal(lossFigures(null), null)
})

test('money by dish is a share of the whole loss', () => {
  assert.deepEqual(moneyByDish(summary).map(dish => dish.share), [0.4, 0.1])
  assert.deepEqual(moneyByDish({}), [])
})

test('the best quick win is the largest single opportunity, only when ready', () => {
  const envelope = { status: 'ready', result: { items: [{ id: 'a', opportunity_ron_per_30_days: 10 }, { id: 'b', opportunity_ron_per_30_days: 50 }, { id: 'c', opportunity_ron_per_30_days: null }] } }
  assert.equal(bestQuickWin(envelope).id, 'b')
  assert.equal(bestQuickWin({ status: 'running', result: null }), null)
  assert.equal(bestQuickWin({ status: 'ready', result: { items: [] } }), null)
})

test('analysis rows and progress count every terminal state', () => {
  const components = { summary: 'ready', patterns: 'running', model: 'insufficient_data', clusters: 'error' }
  assert.equal(analysisProgress(components), 0.75)
  assert.equal(analysisProgress({}), 0)
  assert.deepEqual(componentRows({ model: 'running' }), [{ name: 'model', label: 'Model check', state: 'running', stateLabel: 'Analysing' }])
  assert.equal(envelopeSettled({ status: 'insufficient_data' }), true)
  assert.equal(envelopeSettled({ status: 'queued' }), false)
})
