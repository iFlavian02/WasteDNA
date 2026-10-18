/**
 * Pure helpers for customer orders (Order now and the Orders tab). The
 * backend owns the rules (portions left, cancelling); these only word and
 * total them. Tested with `node --test`.
 */
import { formatRon, portionsLeft, TIME_ZONE } from './places.js'

/** At most this many portions in one order (the stepper's upper bound). */
export const MAX_ORDER_PORTIONS = 10

export const maxPortions = offer => Math.min(portionsLeft(offer), MAX_ORDER_PORTIONS)

export function clampPortions(value, offer) {
  const number = Math.round(Number(value))
  return Math.min(Math.max(Number.isFinite(number) ? number : 1, 1), Math.max(maxPortions(offer), 1))
}

/** Price of `portions` units, or null for an unpriced offer. */
export function orderTotal(offer, portions) {
  if (offer.price_ron === null || offer.price_ron === undefined) return null
  return Math.round(offer.price_ron * portions * 100) / 100
}

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export const formatOrderedAt = order => dateTime.format(new Date(order.created_at))

/**
 * Status shown for an order. `tone` is a CSS modifier: `ready`, `upcoming`,
 * `ended` or `cancelled`. The backend only knows placed and cancelled; the
 * rest follows from the pickup window.
 */
export function orderState(order, now = new Date()) {
  const current = new Date(now).getTime()
  if (order.status === 'cancelled') return { tone: 'cancelled', label: 'Cancelled' }
  if (current >= Date.parse(order.pickup_until)) return { tone: 'ended', label: 'Pickup window ended' }
  if (current < Date.parse(order.pickup_from)) return { tone: 'upcoming', label: `Pickup from ${clock.format(new Date(order.pickup_from))}` }
  return { tone: 'ready', label: `Ready for pickup until ${clock.format(new Date(order.pickup_until))}` }
}

/** The customer can cancel a placed order until its pickup window ends (same rule as the backend). */
export const canCancel = (order, now = new Date()) => order.status === 'placed' && new Date(now).getTime() < Date.parse(order.pickup_until)

/** Orders still to collect, soonest pickup first; then the rest, newest first. */
export function splitOrders(orders, now = new Date()) {
  const active = orders.filter(order => canCancel(order, now)).sort((a, b) => Date.parse(a.pickup_until) - Date.parse(b.pickup_until))
  const past = orders.filter(order => !canCancel(order, now)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return { active, past }
}

/** Count and money spent, excluding cancelled orders. */
export function ordersSummary(orders) {
  const kept = orders.filter(order => order.status !== 'cancelled')
  const spent = kept.reduce((sum, order) => sum + (order.total_price_ron || 0), 0)
  return { count: kept.length, spent: Math.round(spent * 100) / 100 }
}

export function totalText(order) {
  return order.total_price_ron === null || order.total_price_ron === undefined ? 'Price at pickup' : formatRon(order.total_price_ron)
}

export const portionsText = (portions, soldWhole = false) => (soldWhole ? 'Everything on offer' : `${portions} ${portions === 1 ? 'portion' : 'portions'}`)
