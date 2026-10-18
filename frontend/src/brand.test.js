import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { brand } from './brand.js'

test('WiseEat branding references the bundled logo asset', () => {
  assert.equal(brand.name, 'WiseEat')
  assert.equal(brand.tagline, 'Food Waste Intelligence')
  assert.equal(brand.logoSrc, '/wiseeat-logo.png')
  assert.equal(existsSync(new URL('../public/wiseeat-logo.png', import.meta.url)), true)
})

test('the app logo uses the transparent mark and wordmark cut-outs and PNG favicons', () => {
  for (const file of ['wiseeat-mark.png', 'wiseeat-mark-on-dark.png', 'wiseeat-wordmark.png', 'wiseeat-wordmark-on-dark.png']) {
    assert.equal(existsSync(new URL(`./brand/assets/${file}`, import.meta.url)), true, file)
  }
  for (const file of ['favicon.png', 'apple-touch-icon.png']) {
    assert.equal(existsSync(new URL(`../public/${file}`, import.meta.url)), true, file)
  }
})
