import assert from 'node:assert/strict'
import test from 'node:test'
import { analysisProgress, csvFileProblem, datasetHealth, formatDay, formatFileSize, MAX_UPLOAD_BYTES } from './dataHealth.js'

const file = (name, size, type = '') => ({ name, size, type })

test('a staged file must be a non-empty CSV within the upload limit', () => {
  assert.equal(csvFileProblem(file('kitchen.csv', 1200)), null)
  assert.equal(csvFileProblem(file('EXPORT.CSV', 1200)), null)
  assert.equal(csvFileProblem(file('export', 1200, 'text/csv')), null)
  assert.match(csvFileProblem(null), /Choose a CSV/)
  assert.match(csvFileProblem(file('menu.xlsx', 1200)), /not a \.csv/)
  assert.match(csvFileProblem(file('empty.csv', 0)), /empty/)
  assert.match(csvFileProblem(file('big.csv', MAX_UPLOAD_BYTES + 1)), /5\.0 MB; the limit is 5\.0 MB/)
  assert.equal(csvFileProblem(file('edge.csv', MAX_UPLOAD_BYTES)), null)
})

test('file sizes', () => {
  assert.equal(formatFileSize(512), '512 B')
  assert.equal(formatFileSize(2_345), '2.3 kB')
  assert.equal(formatFileSize(84_000), '84 kB')
  assert.equal(formatFileSize(4_200_000), '4.2 MB')
})

test('analysis progress counts finished components', () => {
  assert.deepEqual(analysisProgress({ summary: 'ready', model: 'running', patterns: 'insufficient_data' }), { total: 3, done: 2, ready: 1, settled: false })
  assert.equal(analysisProgress({ summary: 'ready', model: 'error' }).settled, true)
  assert.deepEqual(analysisProgress(), { total: 0, done: 0, ready: 0, settled: true })
})

const RESULT = {
  unsold_portions: 16858,
  unsold_cost_ron: 157463.5,
  unsold_rate: 0.17435,
  period: { from: '2025-06-01', to: '2025-11-27', calendar_days: 180 },
  daily: Array.from({ length: 178 }, (_, index) => ({ date: `d${index}` })),
  dishes: Array.from({ length: 12 }, (_, index) => ({ dish_id: `x${index}` })),
}

test('the dataset card is built only from backend values', () => {
  const { stats, checks } = datasetHealth({ result: RESULT, components: { summary: 'ready', model: 'ready' }, isSynthetic: true })
  const byId = Object.fromEntries(stats.map(stat => [stat.id, stat]))
  assert.deepEqual(byId.status, { id: 'status', label: 'Status', value: 'Demo dataset active', note: '2 of 2 analyses ready', tone: 'ok' })
  assert.equal(byId.records.value, '12 dishes')
  assert.equal(byId.records.note, '178 days with records')
  assert.equal(byId.coverage.value, '180 days')
  assert.equal(byId.coverage.note, '1 Jun 2025 – 27 Nov 2025')
  assert.equal(byId.unsold.value, '16,858 portions')
  assert.equal(byId.unsold.note, '157,464 RON cost · 17.4% of prepared')
  assert.equal(checks.length, 3)
})

test('uploads, running analysis and a missing rate are worded honestly', () => {
  const { stats } = datasetHealth({ result: { ...RESULT, unsold_rate: null, dishes: [{}] }, components: { summary: 'ready', model: 'queued' }, isSynthetic: false })
  assert.equal(stats[0].value, 'Uploaded dataset active')
  assert.equal(stats[0].note, 'Analysing… 1 of 2 done')
  assert.equal(stats[0].tone, 'busy')
  assert.equal(stats[1].value, '1 dish')
  const single = datasetHealth({ result: { ...RESULT, daily: [{}], period: { from: '2025-06-02', to: '2025-06-02', calendar_days: 1 } }, components: {} }).stats
  assert.equal(single[1].note, '1 day with records')
  assert.equal(single[2].value, '1 day')
  assert.equal(stats[3].note, '157,464 RON cost')
  assert.equal(formatDay('2025-02-01'), '1 Feb 2025')
})
