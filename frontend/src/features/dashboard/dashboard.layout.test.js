import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./dashboard.css', import.meta.url), 'utf8')

test('the split chart stacks a compact centered donut above its legend', () => {
  assert.match(styles, /\.split-content\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s)
  assert.match(styles, /\.split-donut-wrap\s*\{[^}]*width:\s*clamp\(8\.5rem,\s*45%,\s*10rem\);[^}]*margin:\s*0 auto;/s)
  assert.match(styles, /\.split-legend\s*\{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*repeat\(auto-fit,/s)
})

test('the paired charts reserve a compact height for their visualizations', () => {
  assert.match(styles, /\.bar-chart\s*\{[^}]*min-height:\s*7rem;[^}]*flex:\s*1;/s)
  assert.match(styles, /\.split-content\s*\{[^}]*gap:\s*\.55rem;[^}]*padding-top:\s*\.55rem;/s)
})

test('the desktop chart cards share a shorter row and quick win grows within bounds', () => {
  assert.match(styles, /\.dashboard-page\s*\{[^}]*grid-template-rows:\s*auto clamp\(18\.5rem,\s*44vh,\s*20rem\) clamp\(4\.5rem,\s*12vh,\s*7rem\);[^}]*align-content:\s*start;/s)
  assert.match(styles, /\.analytics-grid\s*\{[^}]*height:\s*100%;/s)
  assert.match(styles, /\.quick-win\s*\{[^}]*height:\s*100%;[^}]*box-sizing:\s*border-box;/s)
})

test('category mode compacts the donut and legend inside the desktop card', () => {
  assert.match(styles, /\.split-card--category \.split-donut-wrap\s*\{[^}]*width:\s*7\.25rem;/s)
  assert.match(styles, /\.split-card--category \.split-legend\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s)
})

test('the split chart legend and total use proportional type sizes', () => {
  assert.match(styles, /\.split-donut-wrap strong\s*\{[^}]*font-size:\s*1rem;/s)
  assert.match(styles, /\.split-legend li\s*\{[^}]*font-size:\s*\.78rem;/s)
  assert.match(styles, /\.split-legend strong\s*\{[^}]*font-size:\s*\.82rem;/s)
})

test('without data the dashboard is a centered prompt, not the fixed-height chart grid', () => {
  assert.match(styles, /\.dashboard-page\.dashboard-page--empty\s*\{[^}]*height:\s*auto;[^}]*display:\s*grid;[^}]*place-items:\s*center;/s)
  const source = readFileSync(new URL('./Dashboard.jsx', import.meta.url), 'utf8')
  assert.match(source, /if \(!dataset\?\.dataset_id\) return <NoDataPrompt/)
  assert.doesNotMatch(source, /presentationBreakdown|presentationRecommendations/, 'no sample numbers before data is loaded')
})
