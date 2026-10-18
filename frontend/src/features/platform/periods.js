/**
 * Dashboard periods. Dates are ISO `YYYY-MM-DD` strings handled in UTC so
 * results never depend on the viewer's time zone. A period is identified by
 * its type and its first day (`anchor`).
 */

export const PERIOD_TYPES = { week: 'Week', month: 'Month', quarter: 'Quarter' }

const toDate = iso => new Date(`${iso}T00:00:00Z`)
const toIso = date => date.toISOString().slice(0, 10)
const addDays = (iso, days) => { const date = toDate(iso); date.setUTCDate(date.getUTCDate() + days); return toIso(date) }

/** First day of the period of `type` that contains `iso`. */
export function periodStart(type, iso) {
  const date = toDate(iso)
  if (type === 'week') return addDays(iso, -((date.getUTCDay() + 6) % 7))
  const month = type === 'quarter' ? Math.floor(date.getUTCMonth() / 3) * 3 : date.getUTCMonth()
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), month, 1)))
}

/** `{ from, to }` of the period of `type` starting at (or containing) `anchor`. */
export function periodRange(type, anchor) {
  const from = periodStart(type, anchor)
  if (type === 'week') return { from, to: addDays(from, 6) }
  const start = toDate(from)
  const months = type === 'quarter' ? 3 : 1
  return { from, to: toIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0))) }
}

/** Anchor of the period `delta` periods away (negative = earlier). */
export function shiftPeriod(type, anchor, delta) {
  const from = periodStart(type, anchor)
  if (type === 'week') return addDays(from, delta * 7)
  const start = toDate(from)
  const months = (type === 'quarter' ? 3 : 1) * delta
  return toIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1)))
}

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthOnly = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })

/** "October 2026", "Q4 2026" or "12 – 18 Oct". */
export function periodLabel(type, anchor) {
  const { from, to } = periodRange(type, anchor)
  if (type === 'month') return monthYear.format(toDate(from))
  if (type === 'quarter') return `Q${Math.floor(toDate(from).getUTCMonth() / 3) + 1} ${toDate(from).getUTCFullYear()}`
  return `${dayMonth.format(toDate(from))} – ${dayMonth.format(toDate(to))}`
}

/** Short name of the comparison period for "vs …" texts: "September", "Q3", "previous week". */
export function comparisonName(type, anchor) {
  const previous = shiftPeriod(type, anchor, -1)
  if (type === 'month') return monthOnly.format(toDate(previous))
  if (type === 'quarter') return periodLabel('quarter', previous).split(' ')[0]
  return 'previous week'
}

/** The period range limited to the dates that have data, or null if none overlap. */
export function clampRange(range, available) {
  if (!available) return null
  const from = range.from > available.from ? range.from : available.from
  const to = range.to < available.to ? range.to : available.to
  return from <= to ? { from, to } : null
}

/** Whether moving `delta` periods still lands on dates with data. */
export function canShift(type, anchor, delta, available) {
  return clampRange(periodRange(type, shiftPeriod(type, anchor, delta)), available) !== null
}

/**
 * Change of a total between two periods, compared per day with data so a
 * partial current month is not unfairly lower than a full previous one.
 * Returns a fraction (-0.1 = 10% less) or null when it cannot be compared.
 */
export function perDayChange(current, previous, field) {
  if (!current?.days_with_data || !previous?.days_with_data) return null
  const now = current[field] / current.days_with_data
  const before = previous[field] / previous.days_with_data
  return before ? (now - before) / before : null
}
