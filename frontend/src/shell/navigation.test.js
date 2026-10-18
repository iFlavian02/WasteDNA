import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyPath, NAV_ITEMS, ROLES, roleFor, sectionFor } from './navigation.js'

test('paths map to the business or customer role', () => {
  assert.equal(roleFor('/business'), 'business')
  assert.equal(roleFor('/business/deals'), 'business')
  assert.equal(roleFor('/map'), 'customer')
  assert.equal(roleFor('/map/deal/offer-1'), 'customer')
  assert.equal(roleFor('/my-pickups'), 'customer')
  assert.equal(roleFor('/mapping'), 'business', 'only whole segments count')
  assert.equal(roleFor('/unknown'), 'business')
})

test('every nav item belongs to the role whose menu lists it', () => {
  for (const [role, items] of Object.entries(NAV_ITEMS)) {
    assert.ok(ROLES[role])
    for (const item of items) assert.equal(roleFor(item.to), role, item.to)
  }
  assert.equal(roleFor(ROLES.customer.home), 'customer')
  assert.equal(roleFor(ROLES.business.home), 'business')
  for (const role of Object.values(ROLES)) assert.ok(role.user.name && role.user.initials)
})

test('routes from before the redesign redirect to the new ones', () => {
  assert.equal(legacyPath('/upload'), '/business/data')
  assert.equal(legacyPath('/business/upload'), '/business/data')
  assert.equal(legacyPath('/summary'), '/business')
  assert.equal(legacyPath('/diagnostics'), '/business')
  assert.equal(legacyPath('/business/insights/patterns'), '/business')
  assert.ok(!NAV_ITEMS.business.some(item => item.label === 'Insights'), 'Insights is not in the menu')
  assert.equal(legacyPath('/decisions'), '/business/actions')
  assert.equal(legacyPath('/decisions/simulator'), '/business/actions/simulator')
  assert.equal(legacyPath('/decisions/report/'), '/business/actions/report')
  assert.equal(legacyPath('/redistribution'), '/business/deals')
  assert.equal(legacyPath('/redistribution/offers/abc'), '/business/deals')
  assert.equal(legacyPath('/business'), null)
  assert.equal(legacyPath('/summary-extra'), null)
})

test('the top bar names the section of the current path', () => {
  assert.equal(sectionFor('/business'), 'Dashboard')
  assert.equal(sectionFor('/business/actions/simulator'), 'Actions')
  assert.equal(sectionFor('/business/data'), 'Data')
  assert.equal(sectionFor('/map/deal/x'), 'Map')
  assert.equal(sectionFor('/elsewhere'), null)
})
