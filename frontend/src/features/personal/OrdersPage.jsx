import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { describeError } from '../redistribution/logic.js'
import { canCancel, formatOrderedAt, orderState, ordersSummary, portionsText, splitOrders, totalText } from './orders.js'
import { categoryLabel, displayName, formatRon, initials, pickupLabel, placePath } from './places.js'

function OrderRow({ order, donor, now, onCancel }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const state = orderState(order, now)
  const active = canCancel(order, now)
  const name = donor ? displayName(donor.name) : 'Restaurant'
  const pickup = pickupLabel({ available_from: order.pickup_from, pickup_deadline: order.pickup_until }, now)

  async function cancel() {
    setBusy(true)
    setError(null)
    try { await onCancel(order) } catch (failure) { setError(describeError(failure)); setConfirming(false) } finally { setBusy(false) }
  }

  return <li className={`order-row order-row--${state.tone}`}>
    <b className="food-avatar" aria-hidden="true">{donor ? initials(donor.name) : '?'}</b>
    <div className="order-row-main">
      <div className="order-row-title">
        {donor ? <Link to={placePath(donor)}>{name}</Link> : <strong>{name}</strong>}
        <span className={`order-status order-status--${state.tone}`}>{state.label}</span>
      </div>
      <p className="order-row-item">{portionsText(order.portions, order.sold_whole)} · {displayName(order.description) || categoryLabel(order.category)}</p>
      <p className="order-row-meta">Ordered {formatOrderedAt(order)}{active && <> · {pickup}</>}</p>
      {error && <p className="order-error" role="alert">{error.message}</p>}
    </div>
    <div className="order-row-side">
      <strong>{totalText(order)}</strong>
      {order.original_total_ron !== null && order.total_price_ron !== null && <s>{formatRon(order.original_total_ron)}</s>}
      {active && <span className="order-row-code" title="Pickup code">{order.pickup_code}</span>}
      {active && (confirming
        ? <span className="order-row-confirm">
          <button type="button" className="order-link order-link--danger" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
          <button type="button" className="order-link" disabled={busy} onClick={() => setConfirming(false)}>Keep</button>
        </span>
        : <button type="button" className="order-link" onClick={() => setConfirming(true)}>Cancel order</button>)}
    </div>
  </li>
}

/** The current time, refreshed every 30 s so order statuses follow the clock. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** `/personal/orders`: the customer's order history, orders to collect first. */
export function OrdersPage({ map, orders }) {
  const now = useNow()
  const { data, error, loading, reload } = orders
  if (!data) return <div className="food-page">{error ? <ErrorState error={error} onRetry={reload} /> : loading && <LoadingState label="Loading your orders…" />}</div>

  const donorById = new Map(map.donors.map(donor => [donor.id, donor]))
  const { active, past } = splitOrders(data, now)
  const summary = ordersSummary(data)
  const cancel = async order => {
    await orders.client.cancelOrder(order.id)
    reload()
    map.reload()
  }
  const row = order => <OrderRow key={order.id} order={order} donor={donorById.get(order.donor_id)} now={now} onCancel={cancel} />

  return <div className="food-page">
    <header className="food-head">
      <div>
        <h1>Orders</h1>
        <p>{summary.count ? `${summary.count} ${summary.count === 1 ? 'order' : 'orders'} · ${formatRon(summary.spent)} spent` : 'Your order history'}</p>
      </div>
      <span className="personal-demo">Demo data</span>
    </header>

    {!data.length
      ? <section className="sale-card orders-empty">
        <span className="order-done-icon" aria-hidden="true"><Icon name="bag" size={24} /></span>
        <h2>No orders yet</h2>
        <p>Find surplus food on the map and tap <strong>Order now</strong>. Your orders and pickup codes show up here.</p>
        <Link to="/personal" className="order-primary">Open the food map</Link>
      </section>
      : <>
        {active.length > 0 && <section className="sale-card" aria-labelledby="orders-active">
          <div className="card-header"><div><h2 id="orders-active">To collect</h2><p>Show the pickup code at the restaurant and pay there</p></div></div>
          <ul className="order-list">{active.map(row)}</ul>
        </section>}
        {past.length > 0 && <section className="sale-card" aria-labelledby="orders-past">
          <div className="card-header"><div><h2 id="orders-past">History</h2><p>Newest first</p></div></div>
          <ul className="order-list">{past.map(row)}</ul>
        </section>}
      </>}
  </div>
}
