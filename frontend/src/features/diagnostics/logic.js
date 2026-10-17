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

export function formatPp(value) {
  if (value === null || value === undefined) return '—'
  return `${value > 0 ? '+' : ''}${decimal.format(value)} pp`
}

export function formatRon(value) {
  return value === null || value === undefined ? '—' : `${integer.format(value)} RON`
}

export function patternCards(envelope) {
  return (envelope?.result?.items || []).map(item => ({
    id: item.id,
    title: item.title,
    effect: formatPp(item.effect_pp),
    groupRate: formatRate(item.group.unsold_rate),
    baselineRate: formatRate(item.baseline.unsold_rate),
    support: `${item.support.days} days · ${item.support.rows} rows`,
    prepared: `${integer.format(item.group.prepared_portions)} prepared portions`,
    opportunity: item.opportunity_ron_per_30_days === null || item.opportunity_ron_per_30_days === undefined
      ? null
      : `${formatRon(item.opportunity_ron_per_30_days)} per 30 days (indicative)`,
    interval: item.effect_ci_pp ? `${formatPp(item.effect_ci_pp[0])} to ${formatPp(item.effect_ci_pp[1])}` : null,
    interpretation: item.interpretation,
  }))
}

export function evaluationView(envelope) {
  const evaluation = envelope?.result?.evaluation
  if (!evaluation) return null
  const wins = evaluation.mae_model_pp <= evaluation.mae_baseline_pp
  return {
    split: evaluation.split,
    periods: `${evaluation.train_days} train · ${evaluation.calibration_days} calibration · ${evaluation.test_days} test days`,
    modelError: `${decimal.format(evaluation.mae_model_pp)} pp`,
    baselineError: `${decimal.format(evaluation.mae_baseline_pp)} pp`,
    verdict: wins
      ? 'The model has lower held-out error than the dish-and-service baseline.'
      : 'The simple dish-and-service baseline has lower held-out error than the model.',
    wins,
  }
}

export function explanationRows(envelope) {
  const explanations = envelope?.result?.explanations
  if (!explanations || explanations.status !== 'ready') return []
  return [...explanations.factors]
    .sort((left, right) => Math.abs(right.mean_contribution_pp) - Math.abs(left.mean_contribution_pp) || left.name.localeCompare(right.name))
    .map(factor => ({
      name: factor.name,
      contribution: formatPp(factor.mean_contribution_pp),
      contributionPp: factor.mean_contribution_pp,
      support: `${factor.support_rows} rows`,
      method: factor.method,
    }))
}

export function anomalyRows(envelope) {
  return [...(envelope?.result?.anomalies || [])]
    .sort((left, right) => left.date.localeCompare(right.date) || left.dish_id.localeCompare(right.dish_id) || left.time_slot.localeCompare(right.time_slot))
    .map(item => ({
      id: item.id,
      date: item.date,
      dish: item.dish_id,
      service: item.time_slot,
      excessPortions: item.excess_unsold_portions,
      excessPortionsLabel: `${decimal.format(item.excess_unsold_portions)} portions`,
      excessCostLabel: formatRon(item.excess_cost_ron),
      observedExpected: `${decimal.format(item.observed_unsold_portions)} observed vs ${decimal.format(item.expected_unsold_portions)} expected`,
      interpretation: item.interpretation,
    }))
}

export function clusterCards(envelope) {
  return (envelope?.result?.items || []).map(item => ({
    id: item.id,
    label: item.label,
    members: item.member_dish_ids,
    memberCount: `${item.member_count} dishes`,
    support: `At least ${item.support_days} days per dish`,
    unsoldRate: formatRate(item.center.unsold_rate),
    dailyVariation: `${decimal.format(item.center.daily_variation * 100)} pp`,
    dinnerShare: formatRate(item.center.dinner_share),
    meanPrepared: `${decimal.format(item.center.mean_prepared_portions)} portions/day`,
  }))
}

export function combinedLimitations(...envelopes) {
  return [...new Set(envelopes.flatMap(envelope => [
    ...(envelope?.limitations || []),
    ...(envelope?.result?.limitations || []),
  ]))]
}
