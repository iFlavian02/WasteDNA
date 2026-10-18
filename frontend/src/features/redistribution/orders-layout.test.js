import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const offers = readFileSync(new URL('./pages/OffersList.jsx', import.meta.url), 'utf8')
const feature = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./redistribution.css', import.meta.url), 'utf8')

test('business Orders cards expose details without a find-organizations action', () => {
  assert.doesNotMatch(offers, /Find organizations/)
  assert.match(offers, />View details<\/Link>/)
})

test('Orders index uses the focused card layout while deeper workflows retain navigation', () => {
  assert.match(feature, /rd--orders/)
  assert.match(feature, /!offersIndex &&/)
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 640px\)/)
})
