/**
 * Pure helpers for the decisions feature (actions, simulator, report).
 * No React and no network: everything here is unit-tested with `node --test`.
 */

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const TIME_SLOTS = ['lunch', 'dinner']
export const TERMINAL_STATES = new Set(['ready', 'insufficient_data', 'error'])

// Restaurant dish categories -> redistribution offer categories (member 3's vocabulary).
// Pending member 3's confirmation, see docs/fixtures/decisions/REQUESTS.md.
export const OFFER_CATEGORY = {
  soup: 'prepared_meals',
  main: 'prepared_meals',
  side: 'prepared_meals',
  daily_menu: 'prepared_meals',
  dessert: 'bakery',
}
export const DEFAULT_OFFER_CATEGORY = 'prepared_meals'

const ron = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export function formatRon(value) {
  return value === null || value === undefined ? '—' : `${ron.format(value)} RON`
}

export function formatPortions(value) {
  if (value === null || value === undefined) return '—'
  const text = decimal.format(value)
  return `${text} ${text === '1' ? 'portion' : 'portions'}`
}

export function formatRate(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

export function formatPp(value) {
  return value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${decimal.format(value)} pp`
}

/** True when a component envelope `{status, result, limitations}` is finished. */
export function isSettled(envelope) {
  return Boolean(envelope && TERMINAL_STATES.has(envelope.status))
}

// Simulator

/** The curve point for a slider value, clamped to the curve; null when there is no curve. */
export function curvePoint(curve, quantity) {
  if (!curve || curve.length === 0) return null
  const index = Math.min(Math.max(Math.round(Number(quantity) || 0), 0), curve.length - 1)
  return curve[index]
}

/** Slider bounds and start value for a ready simulation result. */
export function sliderRange(result) {
  if (!result || result.status !== 'ready' || result.curve.length === 0) return null
  return { min: 0, max: result.curve.length - 1, start: result.baseline_quantity }
}

/** Display figures for one slider position; every number comes from the curve. */
export function simulationFigures(result, quantity) {
  const point = curvePoint(result?.curve, quantity)
  if (!point) return null
  const baseline = curvePoint(result.curve, result.baseline_quantity)
  const change = point.production_cost_change_ron_per_service
  return {
    quantity: point.quantity,
    baselineQuantity: result.baseline_quantity,
    unsold: formatPortions(point.waste_proxy_portions),
    unsoldAtBaseline: formatPortions(baseline.waste_proxy_portions),
    shortage: formatPortions(point.shortage_lower_bound_portions),
    risk: formatRate(point.risk_lower_bound),
    costChange: change === 0 ? 'No change in production cost per service'
      : change > 0 ? `${formatRon(change)} less production cost per service`
        : `${formatRon(-change)} more production cost per service`,
  }
}

/** Dish choices for the simulator from data the API already returns. */
export function dishOptions(summary, patterns) {
  const byId = new Map()
  for (const dish of summary?.result?.dishes || summary?.result?.top_dishes || []) {
    byId.set(dish.dish_id, dish.dish_name || dish.dish_id)
  }
  for (const item of patterns?.result?.items || []) {
    if (item.factor?.dish_id && !byId.has(item.factor.dish_id)) byId.set(item.factor.dish_id, item.factor.dish_id)
  }
  return [...byId].map(([id, name]) => ({ id, label: name === id ? id : `${name} (${id})` }))
}

// Actions

/** Display rows for recommendations; opportunities stay separate and are never totalled. */
export function actionRows(recommendations) {
  const result = recommendations?.result
  if (!result) return []
  return result.items.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    effort: item.effort,
    effortLabel: { low: 'Low effort', medium: 'Medium effort', high: 'High effort' }[item.effort] || item.effort,
    opportunity: item.opportunity_ron_per_30_days === null || item.opportunity_ron_per_30_days === undefined
      ? 'No estimate'
      : `About ${formatRon(item.opportunity_ron_per_30_days)} per 30 days (indicative)`,
    evidence: item.evidence_pattern_ids,
    isDataCollection: item.evidence_pattern_ids.length === 0,
  }))
}

/** Simulator selection suggested by an action's evidence pattern, if it names one dish and service. */
export function simulatorSelectionFor(action, patterns, summary) {
  const items = patterns?.result?.items || []
  const pattern = items.find(item => action.evidence.includes(item.id))
  if (!pattern?.factor) return null
  const dishes = summary?.result?.dishes || summary?.result?.top_dishes || []
  const byId = new Map(dishes.map(dish => [String(dish.dish_id), dish]))
  const { dish_id: dishId, category, ...condition } = pattern.factor
  let chosen = dishId ? String(dishId) : null
  if (!chosen && category) {
    // A category action: prefer the highest-ranked dish-level pattern for the same
    // condition (member 2's evidence), then the category's top dish by unsold cost.
    const sameCondition = item => item.factor?.dish_id && Object.entries(condition).every(([key, value]) => item.factor[key] === value)
      && Object.keys(item.factor).length === Object.keys(condition).length + 1
    const match = items.find(item => sameCondition(item) && byId.get(String(item.factor.dish_id))?.category === category)
    const ranked = [...(summary?.result?.top_dishes || []), ...dishes].find(dish => dish.category === category)
    chosen = match ? String(match.factor.dish_id) : ranked ? String(ranked.dish_id) : null
  }
  if (!chosen) return null
  const slots = byId.get(chosen)?.time_slots || TIME_SLOTS
  const slot = TIME_SLOTS.includes(condition.time_slot) ? condition.time_slot : slots.includes('dinner') ? 'dinner' : slots[0]
  return {
    dish_id: chosen,
    weekday: WEEKDAYS.includes(condition.weekday) ? condition.weekday : 'Friday',
    time_slot: slot,
  }
}

/**
 * Donation prefill for member 3's page: only a category and a description.
 * Never a quantity or deadline (portions are not converted to kg).
 */
export function prefillFor(action, patterns) {
  const pattern = (patterns?.result?.items || []).find(item => action.evidence.includes(item.id))
  const category = OFFER_CATEGORY[pattern?.factor?.category] || DEFAULT_OFFER_CATEGORY
  return {
    category,
    description: `Surplus related to the WasteDNA action "${action.title}". Confirm the real quantity and pickup deadline.`,
  }
}

// Report

/** Report sections built from component envelopes; a missing component never breaks the report. */
export function reportSections({ summary, patterns, model, recommendations }) {
  const summaryResult = summary?.result || null
  return {
    period: summaryResult?.period || null,
    kpis: summaryResult ? [
      { label: 'Prepared', value: formatPortions(summaryResult.prepared_portions) },
      { label: 'Sold', value: formatPortions(summaryResult.sold_portions) },
      { label: 'Unsold (not proven discarded)', value: `${formatPortions(summaryResult.unsold_portions)} (${formatRate(summaryResult.unsold_rate)})` },
      { label: 'Unsold production cost', value: formatRon(summaryResult.unsold_cost_ron) },
      { label: 'Monthly equivalent', value: formatRon(summaryResult.monthly_equivalent_unsold_cost_ron) },
    ] : [],
    patterns: section(patterns, result => result.items.slice(0, 3).map(item => ({
      id: item.id,
      title: item.title,
      detail: `${formatRate(item.group.unsold_rate)} vs ${formatRate(item.baseline.unsold_rate)} (${formatPp(item.effect_pp)}, ${item.support.days} days)`,
      interpretation: item.interpretation,
    }))),
    model: section(model, result => result.evaluation ? [{
      id: 'evaluation',
      title: `Temporal test on ${result.evaluation.test_days} later days`,
      detail: `Model error ${formatPp(result.evaluation.mae_model_pp).replace('+', '')} vs baseline ${formatPp(result.evaluation.mae_baseline_pp).replace('+', '')}`,
      interpretation: result.evaluation.mae_model_pp <= result.evaluation.mae_baseline_pp
        ? 'The model beats the simple baseline on held-out days.'
        : 'The simple baseline beats the model on held-out days.',
    }] : []),
    actions: section(recommendations, () => actionRows(recommendations)),
    limitations: [...new Set([summary, patterns, model, recommendations].flatMap(envelope => envelope?.limitations || []))],
  }
}

function section(envelope, build) {
  if (!envelope) return { state: 'unavailable', items: [] }
  if (!isSettled(envelope)) return { state: 'pending', items: [] }
  if (envelope.status === 'error' || !envelope.result) return { state: envelope.status === 'error' ? 'error' : 'unavailable', items: [] }
  return { state: envelope.status, items: build(envelope.result) }
}
