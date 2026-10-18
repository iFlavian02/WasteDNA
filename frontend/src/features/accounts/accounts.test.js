import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_KEY, ACCOUNTS, accountForPath, clearAccount, readAccount, saveAccount } from './accounts.js'

const memory = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('two preset accounts, each with its own home', () => {
  assert.deepEqual(Object.keys(ACCOUNTS), ['business', 'personal'])
  assert.equal(ACCOUNTS.business.home, '/dashboard')
  assert.equal(ACCOUNTS.personal.home, '/personal')
  for (const account of Object.values(ACCOUNTS)) assert.ok(account.name && account.initials && account.features.length)
})

test('the chosen account survives a refresh and can be cleared', () => {
  const storage = memory()
  assert.equal(readAccount(storage), null)
  assert.equal(saveAccount(storage, 'personal').id, 'personal')
  assert.equal(storage.getItem(ACCOUNT_KEY), 'personal')
  assert.equal(readAccount(storage).id, 'personal')
  clearAccount(storage)
  assert.equal(readAccount(storage), null)
})

test('unknown or unreadable storage is treated as no account', () => {
  const storage = memory()
  storage.setItem(ACCOUNT_KEY, 'admin')
  assert.equal(readAccount(storage), null)
  assert.throws(() => saveAccount(storage, 'admin'), /Unknown account/)
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.equal(readAccount(blocked), null)
  assert.equal(saveAccount(blocked, 'business').id, 'business')
  assert.doesNotThrow(() => clearAccount(blocked))
})

test('paths map to the account that owns them', () => {
  assert.equal(accountForPath('/'), null)
  assert.equal(accountForPath('/help'), null)
  assert.equal(accountForPath('/personal'), 'personal')
  assert.equal(accountForPath('/personal/places/donor-iasi-sushi-copou'), 'personal')
  assert.equal(accountForPath('/dashboard'), 'business')
  assert.equal(accountForPath('/decisions/actions'), 'business')
  assert.equal(accountForPath('/personalised'), 'business', 'only whole segments count')
})
