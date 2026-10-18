/**
 * Pure helpers for the business dashboard. Every number comes from
 * `GET /api/datasets/{id}/breakdown` for the selected period and filters.
 */

const WEEKDAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/** 'YYYY-MM' → 'November 2025'. */
export const monthLabel = month => monthFormat.format(new Date(`${month}-01T00:00:00Z`))

export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** Every 'YYYY-MM' touched by the dataset's available range, oldest first. */
export function monthsBetween(available) {
  if (!available) return []
  const months = []
  for (let month = available.from.slice(0, 7); month <= available.to.slice(0, 7); month = shiftMonth(month, 1)) months.push(month)
  return months
}

/** The part of `month` covered by the dataset, or null when it has no data. */
export function monthPeriod(month, available) {
  if (!available) return null
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const from = `${month}-01` < available.from ? available.from : `${month}-01`
  const to = last > available.to ? available.to : last
  return from <= to ? { from, to } : null
}

/**
 * Breakdown query for the dashboard filters
 * `{ period: 'month' | 'all', month: 'YYYY-MM', timeSlot, category }`.
 * Null while a month is selected but the dataset range is not known yet.
 */
export function breakdownQuery(filters, available, month = filters.month) {
  const base = { time_slot: filters.timeSlot || '', category: filters.category || '' }
  if (filters.period === 'all') return base
  const period = month && monthPeriod(month, available)
  return period ? { ...base, ...period } : null
}

/** The month before the selected one, or null when there is none to compare with. */
export function previousQuery(filters, available) {
  if (filters.period === 'all' || !filters.month) return null
  return breakdownQuery(filters, available, shiftMonth(filters.month, -1))
}

/** Relative change, or null when there is nothing to compare with. */
export function percentChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null
  return (current - previous) / previous
}

const perDay = (totals, key) => totals?.days_with_data ? totals[key] / totals.days_with_data : null

function describeChange(value, against, points = false) {
  if (value == null) return null
  const size = Math.abs(value * 100)
  if (size < 0.05) return { direction: 'flat', text: `Same as ${against}` }
  const amount = new Intl.NumberFormat('en-GB', { maximumFractionDigits: points ? 1 : 0 }).format(size)
  const direction = value < 0 ? 'down' : 'up'
  return {
    direction,
    text: points
      ? `${amount} pp ${direction === 'down' ? 'lower' : 'higher'} than ${against}`
      : `${amount}% ${direction === 'down' ? 'less' : 'more'} per day than ${against}`,
  }
}

/**
 * The three KPI tiles. Changes compare per-day averages, so a partial month
 * is compared fairly with a full one. Down is good (less food left over).
 */
export function dashboardKpis(totals, previous, againstLabel) {
  const against = previous?.days_with_data ? againstLabel : null
  const relative = key => against ? describeChange(percentChange(perDay(totals, key), perDay(previous, key)), against) : null
  return [
    {
      id: 'cost', label: 'Unsold food cost', icon: 'coins', tone: 'green',
      detail: totals ? `Production cost of unsold portions · ${totals.days_with_data} days` : 'Loading…',
      value: totals ? formatRon(totals.unsold_cost_ron) : '—',
      change: totals ? relative('unsold_cost_ron') : null,
    },
    {
      id: 'portions', label: 'Unsold portions', icon: 'scale', tone: 'green',
      detail: totals ? `Of ${integer.format(totals.prepared_portions)} prepared` : 'Loading…',
      value: totals ? integer.format(totals.unsold_portions) : '—',
      change: totals ? relative('unsold_portions') : null,
    },
    {
      id: 'rate', label: 'Unsold rate', icon: 'leaf', tone: 'green',
      detail: 'Unsold ÷ prepared portions',
      value: totals ? formatPercent(totals.unsold_rate) : '—',
      change: against && totals?.unsold_rate != null && previous.unsold_rate != null
        ? describeChange(totals.unsold_rate - previous.unsold_rate, against, true)
        : null,
    },
  ]
}

/** A round axis maximum (1, 2, 2.5 or 5 × 10^n) at or above `value`. */
export function niceMax(value) {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 2.5, 5, 10].map(step => step * power).find(step => step >= value - 1e-9)
}

/** Bars for "average unsold food per day" by weekday, in portions or RON. */
export function weekdayBars(byWeekday, unit) {
  const key = unit === 'RON' ? 'unsold_cost_ron_per_day' : 'unsold_portions_per_day'
  const bars = (byWeekday || []).map(item => ({ day: WEEKDAY_SHORT[item.weekday] || item.weekday, weekday: item.weekday, value: item[key], days: item.days }))
  const values = bars.map(bar => bar.value).filter(value => value != null)
  const max = niceMax(Math.max(0, ...values))
  const peak = bars.reduce((best, bar) => bar.value != null && (best === null || bar.value > best.value) ? bar : best, null)
  return { bars, max, ticks: [1, .75, .5, .25, 0].map(share => max * share), peak }
}

export const formatAxis = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: value % 1 ? 1 : 0 }).format(value)
export const formatBarValue = (value, unit) => value == null
  ? 'no data'
  : unit === 'RON' ? formatRon(value) : `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value)} portions`

const serviceNames = { lunch: 'Lunch', dinner: 'Dinner' }
export const categoryName = key => key.split('_').map(word => `${word[0]?.toUpperCase() || ''}${word.slice(1)}`).join(' ')
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


export function activeNavigation(pathname) {
  if (pathname === '/personal/orders' || pathname.startsWith('/personal/orders/')) return 'orders'
  if (pathname === '/dashboard' || pathname === '/personal' || pathname.startsWith('/personal/')) return 'overview'
  if (pathname.startsWith('/diagnostics')) return 'categories'
  if (pathname.startsWith('/decisions')) return 'goals'
  if (pathname.startsWith('/redistribution')) return 'tracked'
  if (pathname.startsWith('/upload') || pathname.startsWith('/summary')) return 'settings'
  return null
}
