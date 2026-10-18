/** Formatting and small calculations for the dashboard and data pages. */

const TERMINAL = new Set(['ready', 'insufficient_data', 'error'])

/** A component envelope (`{ status, result }`) has finished processing. */
export const envelopeSettled = envelope => TERMINAL.has(envelope?.status)

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

export const formatNumber = value => (value == null || Number.isNaN(value) ? '—' : number.format(value))
export const formatRon = value => (value == null || Number.isNaN(value) ? '—' : `${number.format(value)} RON`)
export const formatPercent = rate => (rate == null ? '—' : `${decimal.format(rate * 100)}%`)

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
export const formatShortDate = iso => shortDate.format(new Date(`${iso}T00:00:00Z`))
export const formatLongDate = iso => longDate.format(new Date(`${iso}T00:00:00Z`))

/**
 * Sum `summary.daily` into weeks starting on Monday. Each point is
 * `{ week, label, unsold, prepared, days }`; the first and last weeks may be
 * partial, and `days` says how many dates they cover.
 */
export function weeklyTotals(daily = []) {
  const weeks = new Map()
  for (const day of daily) {
    const week = weekStart(day.date)
    const point = weeks.get(week) || { week, label: formatShortDate(week), unsold: 0, prepared: 0, days: 0 }
    point.unsold += day.unsold_portions
    point.prepared += day.prepared_portions
    point.days += 1
    weeks.set(week, point)
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week))
}

/** ISO date of the Monday that starts the week of `iso`. */
export function weekStart(iso) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

/**
 * Unsold portions in the last `days` dates against the `days` before them:
 * `{ current, previous, change }`, where `change` is a fraction (-0.1 = 10%
 * fewer). Null when the history is shorter than twice `days`.
 */
export function recentChange(daily = [], days = 30) {
  if (daily.length < days * 2) return null
  const sum = items => items.reduce((total, day) => total + day.unsold_portions, 0)
  const current = sum(daily.slice(-days))
  const previous = sum(daily.slice(-days * 2, -days))
  return { current, previous, change: previous ? (current - previous) / previous : null }
}

/** First simulated date of a connected inventory (`history_from` + 90 days of seed history), or null. */
export function firstSimulatedDate(info, initialDays = 90) {
  if (!info?.simulated_days) return null
  const date = new Date(`${info.history_from}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + initialDays)
  return date.toISOString().slice(0, 10)
}

/** Only weeks with all seven dates, so partial edges do not look like drops. */
export const fullWeeks = weeks => weeks.filter(week => week.days === 7)

/** Headline loss figures from a summary result, or null without one. */
export function lossFigures(summary) {
  if (!summary) return null
  const days = summary.period?.calendar_days || 0
  const monthly = summary.monthly_equivalent_unsold_cost_ron
  return {
    monthly,
    yearly: monthly == null ? null : (monthly / 30) * 365,
    total: summary.unsold_cost_ron,
    rate: summary.unsold_rate,
    unsoldPerDay: days ? summary.unsold_portions / days : null,
    days,
  }
}

/**
 * Top dishes with their share of the total unsold cost (0–1), for the
 * "where the money goes" bars. Shares are of the whole loss, not of the top 5.
 */
export function moneyByDish(summary) {
  const total = summary?.unsold_cost_ron || 0
  return (summary?.top_dishes || []).map(dish => ({ ...dish, share: total ? dish.unsold_cost_ron / total : 0 }))
}

const SERVICE_NAMES = { lunch: 'Lunch', dinner: 'Dinner' }
const categoryName = text => text.replace('_', ' ').replace(/^./, first => first.toUpperCase())

/**
 * Donut slices for the "Lunch vs dinner" card from a breakdown response.
 * `view` is 'service' (uses `by_time_slot`) or 'category' (uses
 * `by_category`). Returns `{ items: [{ key, name, value, share }], total }`,
 * slices sorted by unsold cost (largest first), `share` in 0–1.
 */
export function splitItems(breakdown, view) {
  const category = view === 'category'
  const source = (category ? breakdown?.by_category : breakdown?.by_time_slot) || []
  const total = source.reduce((sum, item) => sum + item.unsold_cost_ron, 0)
  const items = source
    .map(item => {
      const key = category ? item.category : item.time_slot
      return { key, name: category ? categoryName(key) : SERVICE_NAMES[key] || key, value: item.unsold_cost_ron, share: total ? item.unsold_cost_ron / total : 0 }
    })
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
  return { items, total }
}

/**
 * The single action with the largest indicative opportunity. Opportunities
 * are never added together: they overlap and are not guaranteed savings.
 */
export function bestQuickWin(envelope) {
  const items = envelope?.status === 'ready' ? envelope.result?.items || [] : []
  return items.reduce((best, item) => (item.opportunity_ron_per_30_days > (best?.opportunity_ron_per_30_days ?? -Infinity) ? item : best), null)
}

const COMPONENT_LABELS = {
  summary: 'Summary',
  patterns: 'Patterns',
  model: 'Model check',
  explanations: 'Explanations',
  anomalies: 'Unusual batches',
  recommendations: 'Recommendations',
  clusters: 'Dish groups',
}

const STATE_LABELS = { queued: 'Waiting', running: 'Analysing', ready: 'Ready', insufficient_data: 'Not enough data', error: 'Failed' }

/** Analysis components as `{ name, label, state, stateLabel }` rows. */
export function componentRows(components = {}) {
  return Object.entries(components).map(([name, state]) => ({
    name,
    label: COMPONENT_LABELS[name] || name,
    state,
    stateLabel: STATE_LABELS[state] || state,
  }))
}

/** Share of components that finished (any terminal state), 0–1. */
export function analysisProgress(components = {}) {
  const values = Object.values(components)
  return values.length ? values.filter(value => TERMINAL.has(value)).length / values.length : 0
}
