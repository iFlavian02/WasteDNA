/**
 * WiseEat navigation: the two roles, their menu items and redirects from the
 * routes used before the redesign. Icons are lucide-react names, resolved by
 * the layout, so this module stays free of React and is testable with node.
 */

export const ROLES = {
  business: { label: 'Business', home: '/business' },
  customer: { label: 'Customer', home: '/map' },
}

export const NAV_ITEMS = {
  business: [
    { to: '/business', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
    { to: '/business/deals', label: 'Deals', icon: 'Tag' },
    { to: '/business/insights', label: 'Insights', icon: 'ChartLine' },
    { to: '/business/actions', label: 'Actions', icon: 'Lightbulb' },
  ],
  customer: [
    { to: '/map', label: 'Map', icon: 'Map' },
    { to: '/my-pickups', label: 'My pickups', icon: 'ShoppingBag' },
  ],
}

const CUSTOMER_PREFIXES = ['/map', '/my-pickups']

const startsWithSegment = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** The role a path belongs to. Unknown paths count as business. */
export function roleFor(pathname) {
  return CUSTOMER_PREFIXES.some(prefix => startsWithSegment(pathname, prefix)) ? 'customer' : 'business'
}

const LEGACY = [
  ['/upload', () => '/business/upload'],
  ['/summary', () => '/business'],
  ['/diagnostics', rest => `/business/insights${rest}`],
  ['/decisions', rest => `/business/actions${rest}`],
  ['/redistribution', () => '/business/deals'],
]

/**
 * New path for a route used before the redesign, or null if the path is not
 * a legacy one. Sub-paths of diagnostics and decisions are kept.
 */
export function legacyPath(pathname) {
  for (const [prefix, target] of LEGACY) {
    if (startsWithSegment(pathname, prefix)) return target(pathname.slice(prefix.length).replace(/\/$/, ''))
  }
  return null
}
