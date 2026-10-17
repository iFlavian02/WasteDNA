import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  actionRows, curvePoint, dishOptions, formatPortions, formatPp, formatRate, formatRon, isSettled, prefillFor,
  reportSections, simulationFigures, simulatorSelectionFor, sliderRange,
} from './logic.js'

const fixture = (domain, name) => JSON.parse(readFileSync(new URL(`../../../../docs/fixtures/${domain}/${name}`, import.meta.url), 'utf8'))
const envelope = result => ({ status: result.status, result, limitations: result.limitations || [] })

const simulation = fixture('decisions', 'simulation_ready.json')
const recommendations = envelope(fixture('decisions', 'recommendations_ready.json'))
const patterns = envelope(fixture('analytics', 'patterns_ready.json'))

test('curve point is clamped to the curve and absent without a curve', () => {
  assert.equal(curvePoint(simulation.curve, 15).quantity, 15)
  assert.equal(curvePoint(simulation.curve, -4).quantity, 0)
  assert.equal(curvePoint(simulation.curve, 10_000).quantity, simulation.curve.length - 1)
  assert.equal(curvePoint(simulation.curve, '7.6').quantity, 8)
  assert.equal(curvePoint([], 3), null)
})

test('slider starts at the baseline and spans the whole curve', () => {
  assert.deepEqual(sliderRange(simulation), { min: 0, max: simulation.curve.length - 1, start: 19 })
  assert.equal(sliderRange(fixture('decisions', 'simulation_insufficient_data.json')), null)
})

test('figures use only curve values and describe cost change per service, not profit', () => {
  const figures = simulationFigures(simulation, 15)
  assert.equal(figures.unsold, '1.8 portions')
  assert.equal(figures.shortage, '0.4 portions')
  assert.equal(figures.risk, '25%')
  assert.equal(figures.costChange, '38 RON less production cost per service')
  assert.match(simulationFigures(simulation, 19).costChange, /No change/)
  assert.match(simulationFigures(simulation, 25).costChange, /more production cost/)
  assert.ok(!JSON.stringify(figures).toLowerCase().includes('profit'))
})

test('slider updates are local and fast', () => {
  const started = performance.now()
  for (let q = 0; q < 10_000; q += 1) simulationFigures(simulation, q % simulation.curve.length)
  assert.ok(performance.now() - started < 1000)
})

test('action rows keep opportunities separate and never total them', () => {
  const rows = actionRows(recommendations)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].effortLabel, 'Medium effort')
  assert.match(rows[0].opportunity, /About 420 RON per 30 days \(indicative\)/)
  assert.deepEqual(rows[0].evidence, ['pattern-friday-dinner-01'])
  const collect = actionRows(envelope(fixture('decisions', 'recommendations_insufficient_data.json')))
  assert.equal(collect[0].isDataCollection, true)
  assert.equal(collect[0].opportunity, 'No estimate')
  assert.deepEqual(actionRows(null), [])
})

test('donation prefill has only category and description, never quantity or deadline', () => {
  const [row] = actionRows(recommendations)
  const prefill = prefillFor(row, patterns)
  assert.deepEqual(Object.keys(prefill).sort(), ['category', 'description'])
  assert.equal(prefill.category, 'prepared_meals')
  const dessert = { result: { items: [{ id: 'p', factor: { category: 'dessert', rain_bin: 'rain' } }] } }
  assert.equal(prefillFor({ title: 'x', evidence: ['p'] }, dessert).category, 'bakery')
})

test('simulator selection comes from a dish-level evidence pattern only', () => {
  const dishPatterns = { result: { items: [{ id: 'p', factor: { dish_id: 'dish-06', weekday: 'Friday' } }] } }
  assert.deepEqual(simulatorSelectionFor({ evidence: ['p'] }, dishPatterns), { dish_id: 'dish-06', weekday: 'Friday', time_slot: 'dinner' })
  assert.equal(simulatorSelectionFor({ evidence: ['missing'] }, dishPatterns), null)
})

test('a category action opens a dish of that category, on a service the dish has', () => {
  const summary = { result: {
    top_dishes: [{ dish_id: 'dish-06', category: 'main', time_slots: ['dinner', 'lunch'] }],
    dishes: [
      { dish_id: 'dish-01', category: 'soup', time_slots: ['dinner', 'lunch'] },
      { dish_id: 'dish-04', category: 'main', time_slots: ['dinner', 'lunch'] },
      { dish_id: 'dish-05', category: 'daily_menu', time_slots: ['lunch'] },
      { dish_id: 'dish-06', category: 'main', time_slots: ['dinner', 'lunch'] },
      { dish_id: 'dish-14', category: 'dessert', time_slots: ['dinner', 'lunch'] },
    ],
  } }
  const items = [
    { id: 'friday', factor: { category: 'main', weekday: 'Friday' } },
    { id: 'rain', factor: { category: 'dessert', rain_bin: 'rain' } },
    { id: 'break', factor: { dish_id: 'dish-05', university_state: 'break' } },
    { id: 'soup-friday', factor: { dish_id: 'dish-01', weekday: 'Friday' } },
    { id: 'd04-friday', factor: { dish_id: 'dish-04', weekday: 'Friday' } },
    { id: 'd14-rain', factor: { dish_id: 'dish-14', rain_bin: 'rain' } },
  ]
  const envelope = { result: { items } }
  // Same condition and category, from member 2's ranked dish-level patterns; never the soup.
  assert.deepEqual(simulatorSelectionFor({ evidence: ['friday'] }, envelope, summary), { dish_id: 'dish-04', weekday: 'Friday', time_slot: 'dinner' })
  assert.equal(simulatorSelectionFor({ evidence: ['rain'] }, envelope, summary).dish_id, 'dish-14')
  // dish-05 is served at lunch only.
  assert.equal(simulatorSelectionFor({ evidence: ['break'] }, envelope, summary).time_slot, 'lunch')
  // Without dish-level evidence, fall back to the category's top dish by unsold cost.
  assert.equal(simulatorSelectionFor({ evidence: ['friday'] }, { result: { items: items.slice(0, 1) } }, summary).dish_id, 'dish-06')
})

test('dish options merge summary dishes and pattern dishes without duplicates', () => {
  const summary = { result: { top_dishes: [{ dish_id: 'dish-06', dish_name: 'Tochitură' }] } }
  const dishPatterns = { result: { items: [{ id: 'a', factor: { dish_id: 'dish-06' } }, { id: 'b', factor: { dish_id: 'dish-02' } }] } }
  assert.deepEqual(dishOptions(summary, dishPatterns), [
    { id: 'dish-06', label: 'Tochitură (dish-06)' },
    { id: 'dish-02', label: 'dish-02' },
  ])
})

test('report survives a missing or pending model and keeps limitations', () => {
  const model = envelope(fixture('analytics', 'model_insufficient_data.json'))
  const report = reportSections({ summary: null, patterns, model, recommendations })
  assert.equal(report.model.state, 'insufficient_data')
  assert.deepEqual(report.model.items, [])
  assert.equal(report.patterns.state, 'ready')
  assert.match(report.patterns.items[0].detail, /30% vs 20% \(\+10 pp, 12 days\)/)
  assert.ok(report.limitations.length > 0)
  assert.equal(reportSections({ model: { status: 'queued', result: null, limitations: [] } }).model.state, 'pending')
  assert.equal(reportSections({}).actions.state, 'unavailable')
})

test('report reads model evaluation honestly', () => {
  const report = reportSections({ model: envelope(fixture('analytics', 'model_ready.json')) })
  assert.equal(report.model.state, 'ready')
  assert.match(report.model.items[0].detail, /Model error .* vs baseline/)
})

test('formatters show unknown values as a dash, never zero', () => {
  assert.equal(formatRon(null), '—')
  assert.equal(formatPortions(1), '1 portion')
  assert.equal(formatPortions(2.25), '2.3 portions')
  assert.equal(formatRate(undefined), '—')
  assert.equal(formatPp(-2.5), '-2.5 pp')
  assert.equal(isSettled({ status: 'running' }), false)
  assert.equal(isSettled({ status: 'insufficient_data' }), true)
})
