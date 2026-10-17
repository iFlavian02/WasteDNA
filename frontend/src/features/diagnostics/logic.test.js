import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  anomalyRows,
  combinedLimitations,
  evaluationView,
  explanationRows,
  formatPp,
  formatRate,
  isSettled,
  patternCards,
} from './logic.js'

const fixture = name => JSON.parse(readFileSync(new URL(`../../../../docs/fixtures/analytics/${name}`, import.meta.url), 'utf8'))
const envelope = result => ({ status: result.status, result, limitations: result.limitations || [] })

const patterns = envelope(fixture('patterns_ready.json'))
const model = envelope(fixture('model_ready.json'))

test('pattern cards preserve group, comparable baseline, support and indicative opportunity', () => {
  const [card] = patternCards(patterns)
  assert.equal(card.effect, '+10 pp')
  assert.equal(card.groupRate, '30%')
  assert.equal(card.baselineRate, '20%')
  assert.equal(card.support, '12 days · 12 rows')
  assert.match(card.opportunity, /420 RON per 30 days \(indicative\)/)
  assert.match(card.interval, /\+6\.2 pp to \+13\.8 pp/)
})

test('model evaluation compares held-out model and baseline honestly', () => {
  const view = evaluationView(model)
  assert.equal(view.periods, '108 train · 36 calibration · 36 test days')
  assert.equal(view.modelError, '8.2 pp')
  assert.equal(view.baselineError, '10.1 pp')
  assert.equal(view.wins, true)

  const losing = structuredClone(model)
  losing.result.evaluation.mae_model_pp = 12
  assert.equal(evaluationView(losing).wins, false)
  assert.match(evaluationView(losing).verdict, /baseline has lower/)
})

test('explanations are sorted by absolute contribution and remain associations', () => {
  const changed = structuredClone(model)
  changed.result.explanations.factors.push({ name: 'rain', mean_contribution_pp: -5.2, support_rows: 20, method: 'SHAP' })
  const factors = explanationRows(changed)
  assert.deepEqual(factors.map(item => item.name), ['rain', 'weekday=Friday'])
  assert.equal(factors[0].contribution, '-5.2 pp')
  assert.deepEqual(explanationRows(envelope(fixture('model_insufficient_data.json'))), [])
})

test('anomaly rows are chronological and retain portions and cost units', () => {
  const changed = structuredClone(model)
  changed.result.anomalies.push({ ...changed.result.anomalies[0], id: 'earlier', date: '2026-09-20' })
  const rows = anomalyRows(changed)
  assert.deepEqual(rows.map(item => item.id), ['earlier', 'anomaly-2026-09-25-dish-01-dinner'])
  assert.equal(rows[1].excessPortionsLabel, '10.5 portions')
  assert.equal(rows[1].excessCostLabel, '84 RON')
})

test('transport states and missing values are never presented as zero', () => {
  assert.equal(isSettled({ status: 'queued' }), false)
  assert.equal(isSettled({ status: 'running' }), false)
  assert.equal(isSettled({ status: 'ready' }), true)
  assert.equal(isSettled({ status: 'insufficient_data' }), true)
  assert.equal(isSettled({ status: 'error' }), true)
  assert.equal(formatRate(null), '—')
  assert.equal(formatPp(undefined), '—')
  assert.deepEqual(patternCards(envelope(fixture('patterns_insufficient_data.json'))), [])
})

test('limitations are deduplicated across transport and domain results', () => {
  const values = combinedLimitations(
    { limitations: ['A'], result: { limitations: ['A', 'B'] } },
    { limitations: ['B', 'C'], result: null },
  )
  assert.deepEqual(values, ['A', 'B', 'C'])
})
