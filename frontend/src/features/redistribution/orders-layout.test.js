import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const offers = readFileSync(new URL('./pages/OffersList.jsx', import.meta.url), 'utf8')
const feature = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')
const form = readFileSync(new URL('./pages/OfferForm.jsx', import.meta.url), 'utf8')
const detail = readFileSync(new URL('./pages/OfferDetail.jsx', import.meta.url), 'utf8')
const hooks = readFileSync(new URL('./hooks.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./redistribution.css', import.meta.url), 'utf8')

test('business Orders cards contain only priced customer-sale actions', () => {
  assert.doesNotMatch(offers, /Find organizations/)
  assert.match(offers, />View details<\/Link>/)
  assert.match(offers, /offer\.price_ron !== null/)
})

test('Orders routes do not expose charity matching or reservation workflows', () => {
  assert.match(feature, /rd--orders/)
  assert.doesNotMatch(feature, /Reservations|Impact|Forecasts|NavLink/)
  assert.doesNotMatch(detail, /matches|reserve|organization|handover/i)
  assert.doesNotMatch(hooks, /client\.organizations/)
})

test('new order collects product, price and discount and keeps the responsive card layout', () => {
  assert.match(form, /label="Product"/)
  assert.match(form, /label="Regular price per portion \(lei\)"/)
  assert.match(form, /label="Discount \(%\)"/)
  assert.match(form, /Customer price/)
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 640px\)/)
})
