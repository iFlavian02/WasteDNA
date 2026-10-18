/**
 * Preset demo accounts for the home screen (docs/ACCOUNTS.md). There is no
 * login: choosing an account only stores its id in localStorage so a refresh
 * keeps the same view. Never treat this as authentication.
 */

export const ACCOUNT_KEY = 'wiseeat-account'

export const ACCOUNTS = {
  business: {
    id: 'business',
    kind: 'Business account',
    name: 'Hotel Luc Berlin',
    initials: 'HL',
    role: 'Hotel & restaurant',
    organization: 'Berlin-Mitte',
    home: '/dashboard',
    summary: 'Track food waste across your kitchen, compare periods and act on recommendations.',
    features: ['Waste dashboard and KPIs', 'Recommended actions and simulator', 'Surplus redistribution'],
  },
  personal: {
    id: 'personal',
    kind: 'Personal account',
    name: 'Lena Hoffmann',
    initials: 'LH',
    role: 'Personal account',
    organization: 'Centru, Iași',
    home: '/personal',
    summary: 'See restaurants in Iași with surplus food on a live map and buy it at a discount.',
    features: ['Live map of surplus food in Iași', "Each restaurant's food on sale", 'Up to 60% off regular prices'],
  },
}

/** The account stored in `storage`, or null when none (or an unknown one) is stored. */
export function readAccount(storage) {
  try {
    return ACCOUNTS[storage.getItem(ACCOUNT_KEY)] || null
  } catch {
    return null
  }
}

export function saveAccount(storage, id) {
  if (!ACCOUNTS[id]) throw new Error(`Unknown account: ${id}`)
  try { storage.setItem(ACCOUNT_KEY, id) } catch { /* private mode: the choice lasts for this page only */ }
  return ACCOUNTS[id]
}

export function clearAccount(storage) {
  try { storage.removeItem(ACCOUNT_KEY) } catch { /* nothing stored */ }
}

const PERSONAL_PATHS = ['/personal']

/** Which account a path belongs to: 'personal', 'business' or null for the home screen and shared pages. */
export function accountForPath(pathname) {
  if (pathname === '/' || pathname === '/help') return null
  return PERSONAL_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`)) ? 'personal' : 'business'
}
