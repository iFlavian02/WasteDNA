import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { NAVIGATION } from './navigation.js'

test('business uses the guif tabs while personal navigation stays unchanged', () => {
  assert.deepEqual(NAVIGATION.business.map(item => item.label), ['Overview', 'Categories', 'Actions', 'Orders', 'Data'])
  assert.deepEqual(NAVIGATION.personal.map(item => item.label), ['Food map', 'Orders'])
})

test('Help remains personal-only in the shared sidebar', () => {
  const sidebar = readFileSync(new URL('./Sidebar.jsx', import.meta.url), 'utf8')
  assert.match(sidebar, /\{!business && <Link to="\/help"/)
})
