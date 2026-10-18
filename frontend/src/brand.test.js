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
