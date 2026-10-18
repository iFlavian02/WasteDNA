export const weeklyWaste = [
  { day: 'Mon', grams: 80 },
  { day: 'Tue', grams: 140 },
  { day: 'Wed', grams: 160 },
  { day: 'Thu', grams: 120 },
  { day: 'Fri', grams: 180 },
  { day: 'Sat', grams: 200 },
  { day: 'Sun', grams: 100 },
]

export const dashboardKpis = [
  { label: 'Edible waste weight', detail: 'Over selected time period', value: '775 kg', change: '10% from base month', icon: 'scale', tone: 'rose' },
  { label: 'Edible waste cost', detail: 'Over selected time period', value: "EUR 6'985", change: '9% from base month', icon: 'coins', tone: 'green' },
]

export function wasteValue(item, unit) {
  return unit === 'EUR' ? Number((item.grams * 0.009).toFixed(2)) : item.grams
}

export function activeNavigation(pathname) {
  if (pathname === '/personal/orders' || pathname.startsWith('/personal/orders/')) return 'orders'
  if (pathname === '/dashboard' || pathname === '/personal' || pathname.startsWith('/personal/')) return 'overview'
  if (pathname.startsWith('/diagnostics')) return 'categories'
  if (pathname.startsWith('/decisions')) return 'goals'
  if (pathname.startsWith('/redistribution')) return 'tracked'
  if (pathname.startsWith('/upload') || pathname.startsWith('/summary')) return 'settings'
  return null
}
