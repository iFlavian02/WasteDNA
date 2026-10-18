import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  formatRate,
  isSettled,
  patternCards,
} from './logic.js'

const fixture = name => JSON.parse(readFileSync(new URL(`../../../../docs/fixtures/analytics/${name}`, import.meta.url), 'utf8'))
const envelope = result => ({ status: result.status, result, limitations: result.limitations || [] })

const patterns = envelope(fixture('patterns_ready.json'))

test('pattern cards expose four statistics and the 30-day opportunity without secondary copy', () => {
  const [card] = patternCards(patterns)
  assert.deepEqual(card.statistics, [
    { label: 'Group unsold', value: '30%' },
    { label: 'Comparable baseline', value: '20%' },
    { label: 'Support', value: '12 days · 12 rows' },
    { label: 'Volume', value: '300 prepared portions' },
  ])
  assert.equal(card.opportunity, '420 RON per 30 days')
  assert.equal(card.effect, undefined)
  assert.equal(card.interval, undefined)
  assert.equal(card.interpretation, undefined)
})

test('pattern cards stay capped at four statistics when sales ratios are available', () => {
  const changed = structuredClone(patterns)
  changed.result.items[0].group.unsold_over_sales = 0.3
  changed.result.items[0].baseline.unsold_over_sales = 0.1
  const [card] = patternCards(changed)
  assert.equal(card.statistics.length, 4)
  assert.deepEqual(card.statistics.map(item => item.label), ['Group unsold', 'Comparable baseline', 'Support', 'Volume'])
})

test('pattern card layout gives titles full width and keeps cards equal height', () => {
  const component = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('./diagnostics.css', import.meta.url), 'utf8')

  assert.match(component, /<article className="diagnostics-pattern-card"[\s\S]*?<h3>\{card\.title\}<\/h3>/)
  assert.doesNotMatch(component, /card\.effect/)
  assert.match(styles, /\.diagnostics-pattern-grid\s*\{[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch;/s)
  assert.match(styles, /\.diagnostics-pattern-card > h3\s*\{[^}]*width:\s*100%;/s)
})

test('statistics page renders and requests only supported patterns', () => {
  const component = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')

  assert.match(component, /useComponent\(api, datasetId, 'patterns'\)/)
  assert.doesNotMatch(component, /useComponent\(api, datasetId, '(?:model|clusters)'\)/)
  assert.doesNotMatch(component, /ModelSection|ClustersSection|diagnostics-hero|diagnostics-limitations|recharts/)
})

test('transport states and missing values are never presented as zero', () => {
  assert.equal(isSettled({ status: 'queued' }), false)
  assert.equal(isSettled({ status: 'running' }), false)
  assert.equal(isSettled({ status: 'ready' }), true)
  assert.equal(isSettled({ status: 'insufficient_data' }), true)
  assert.equal(isSettled({ status: 'error' }), true)
  assert.equal(formatRate(null), '—')
  assert.deepEqual(patternCards(envelope(fixture('patterns_insufficient_data.json'))), [])
})
