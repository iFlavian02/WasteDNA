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
  { label: 'Edible waste cost', detail: 'Over selected time period', value: "EUR 6'985", change: '9% from base month', icon: 'coins', tone: 'green' },
]

export const presentationBreakdown = {
  by_time_slot: [
    { time_slot: 'lunch', unsold_cost_ron: 4997.5 },
    { time_slot: 'dinner', unsold_cost_ron: 4827 },
  ],
  by_category: [
    { category: 'main', unsold_cost_ron: 3685 },
    { category: 'dessert', unsold_cost_ron: 2440 },
    { category: 'daily_menu', unsold_cost_ron: 2120 },
    { category: 'soup', unsold_cost_ron: 1579.5 },
  ],
}

export const presentationRecommendations = {
  status: 'ready',
  result: { items: [{
    id: 'presentation-quick-win',
    title: 'Prepare fewer portions of main dishes on Mondays',
    opportunity_ron_per_30_days: 751.15,
  }] },
}

const serviceNames = { lunch: 'Lunch', dinner: 'Dinner' }
const categoryName = key => key.split('_').map(word => `${word[0]?.toUpperCase() || ''}${word.slice(1)}`).join(' ')
const terminalStatuses = new Set(['ready', 'insufficient_data', 'error'])

export const envelopeSettled = envelope => terminalStatuses.has(envelope?.status)

export function splitItems(breakdown, view) {
  const category = view === 'category'
  const source = (category ? breakdown?.by_category : breakdown?.by_time_slot) || []
  const total = source.reduce((sum, item) => sum + item.unsold_cost_ron, 0)
  const items = source.map(item => {
    const key = category ? item.category : item.time_slot
    return { key, name: category ? categoryName(key) : serviceNames[key] || key, value: item.unsold_cost_ron, share: total ? item.unsold_cost_ron / total : 0 }
  }).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
  return { items, total }
}

export function donutSegments(items) {
  return items.map((item, index) => ({
    ...item,
    colorIndex: index,
    offset: items.slice(0, index).reduce((sum, previous) => sum + previous.share * 100, 0),
  }))
}

export function bestQuickWin(envelope) {
  const items = envelope?.status === 'ready' ? envelope.result?.items || [] : []
  return items.reduce((best, item) => item.opportunity_ron_per_30_days > (best?.opportunity_ron_per_30_days ?? -Infinity) ? item : best, null)
}

export const formatRon = value => value == null || Number.isNaN(value) ? '—' : `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value)} RON`
export const formatPercent = value => value == null ? '—' : `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value * 100)}%`

export function wasteValue(item, unit) {
  return unit === 'EUR' ? Number((item.grams * 0.009).toFixed(2)) : item.grams
}

export function activeNavigation(pathname) {
  if (pathname === '/') return 'overview'
  if (pathname.startsWith('/diagnostics')) return 'categories'
  if (pathname.startsWith('/decisions')) return 'goals'
  if (pathname.startsWith('/redistribution') || pathname.startsWith('/summary')) return 'tracked'
  if (pathname.startsWith('/upload')) return 'settings'
  return null
}
