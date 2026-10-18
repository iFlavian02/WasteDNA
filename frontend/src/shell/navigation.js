/**
 * WiseEat navigation: the two roles, their menu items and redirects from the
 * routes used before the redesign. Icons are lucide-react names, resolved by
 * the layout, so this module stays free of React and is testable with node.
 */

export const ROLES = {
  business: { label: 'Business', home: '/business', user: { name: 'Bistro Copou', subtitle: 'Restaurant · demo', initials: 'BC' } },
  customer: { label: 'Customer', home: '/map', user: { name: 'Guest', subtitle: 'Customer · Iași', initials: 'G' } },
}

export const NAV_ITEMS = {
  business: [
    { to: '/business', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
    { to: '/business/deals', label: 'Deals', icon: 'Tag' },
    { to: '/business/actions', label: 'Actions', icon: 'Lightbulb' },
    { to: '/business/data', label: 'Data', icon: 'Database' },
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
  ['/upload', () => '/business/data'],
  ['/business/upload', () => '/business/data'],
  ['/summary', () => '/business'],
  // Insights was removed from the UI; its old links land on the dashboard.
  ['/diagnostics', () => '/business'],
  ['/business/insights', () => '/business'],
  ['/decisions', rest => `/business/actions${rest}`],
  ['/redistribution', () => '/business/deals'],
]

/**
 * New path for a route used before the redesign, or null if the path is not
 * a legacy one. Sub-paths of decisions are kept.
 */
export function legacyPath(pathname) {
  for (const [prefix, target] of LEGACY) {
    if (startsWithSegment(pathname, prefix)) return target(pathname.slice(prefix.length).replace(/\/$/, ''))
  }
  return null
}

/** Menu label of the section a path belongs to (longest matching item), or null. */
export function sectionFor(pathname) {
  const matches = NAV_ITEMS[roleFor(pathname)].filter(item => startsWithSegment(pathname, item.to))
  return matches.sort((a, b) => b.to.length - a.to.length)[0]?.label ?? null
}
