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
    const date = new Date(`${day.date}T00:00:00Z`)
    const monday = new Date(date)
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    const week = monday.toISOString().slice(0, 10)
    const point = weeks.get(week) || { week, label: formatShortDate(week), unsold: 0, prepared: 0, days: 0 }
    point.unsold += day.unsold_portions
    point.prepared += day.prepared_portions
    point.days += 1
    weeks.set(week, point)
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week))
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
