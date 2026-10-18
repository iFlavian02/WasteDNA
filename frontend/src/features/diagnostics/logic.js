/** Pure presentation helpers for the diagnostics feature. */

export const TERMINAL_STATES = new Set(['ready', 'insufficient_data', 'error'])

const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function isSettled(envelope) {
  return Boolean(envelope && TERMINAL_STATES.has(envelope.status))
}

export function formatRate(value) {
  return value === null || value === undefined ? '—' : `${decimal.format(value * 100)}%`
}

export function formatRon(value) {
  return value === null || value === undefined ? '—' : `${integer.format(value)} RON`
}

export function patternCards(envelope) {
  return (envelope?.result?.items || []).map(item => ({
    id: item.id,
    title: item.title,
    statistics: [
      { label: 'Group unsold', value: formatRate(item.group.unsold_rate) },
      { label: 'Comparable baseline', value: formatRate(item.baseline.unsold_rate) },
      { label: 'Support', value: `${item.support.days} days · ${item.support.rows} rows` },
      { label: 'Volume', value: `${integer.format(item.group.prepared_portions)} prepared portions` },
    ],
    opportunity: item.opportunity_ron_per_30_days === null || item.opportunity_ron_per_30_days === undefined
      ? null
      : `${formatRon(item.opportunity_ron_per_30_days)} per 30 days`,
  }))
}
