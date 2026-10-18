import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { describeError, newKey } from '../redistribution/logic.js'
import { clampPortions, maxPortions, orderTotal, portionsText, totalText } from './orders.js'
import { displayName, formatRon, pickupLabel, priceUnit } from './places.js'

/**
 * "Order now" for one item: choose portions, confirm, get a pickup code.
 * A native modal <dialog> (focus trap and Esc for free). One idempotency key
 * per attempt, so a double click or a retry never orders twice; changing the
 * portions starts a new attempt.
 */
export function OrderDialog({ offer, place, client, customerId, now, onClose, onChanged }) {
  const dialog = useRef(null)
  const key = useRef(newKey('order'))
  const [portions, setPortions] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [order, setOrder] = useState(null)
  const portioned = !!offer.portion_count
  const max = maxPortions(offer)
  const total = orderTotal(offer, portions)

  // No close() in a cleanup: it fires `close`, which would unmount the dialog
  // under StrictMode's double effect. Unmounting removes the modal anyway.
  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal()
  }, [])

  const change = value => {
    setPortions(clampPortions(value, offer))
    key.current = newKey('order')
    setError(null)
  }

  async function confirm() {
    setSaving(true)
    setError(null)
    try {
      setOrder(await client.placeOrder(offer.id, { customer_id: customerId, portions, idempotency_key: key.current }))
      onChanged()
    } catch (failure) {
      setError(describeError(failure))
      if (failure?.status === 409) { key.current = newKey('order'); onChanged() }
    } finally {
      setSaving(false)
    }
  }

  const title = displayName(offer.description) || 'this item'
  return <dialog ref={dialog} className="order-dialog" aria-labelledby="order-title" onClose={onClose}>
    {order
      ? <div className="order-done" role="status">
        <span className="order-done-icon" aria-hidden="true"><Icon name="check" size={26} /></span>
        <h2 id="order-title">Order placed</h2>
        <p>Show this code at <strong>{place.name}</strong>. {pickupLabel(offer, now)}.</p>
        <p className="order-code" aria-label={`Pickup code ${order.pickup_code.split('').join(' ')}`}>{order.pickup_code}</p>
        <p className="order-done-meta">{portionsText(order.portions, order.sold_whole)} · {title} · {totalText(order)}</p>
        <div className="order-actions">
          <Link to="/personal/orders" className="order-secondary" onClick={onClose}>View my orders</Link>
          <button type="button" className="order-primary" onClick={onClose} autoFocus>Done</button>
        </div>
      </div>
      : <>
        <header className="order-head">
          <div><span>{place.name}</span><h2 id="order-title">{title}</h2></div>
          <button type="button" className="order-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <p className="order-meta"><Icon name="clock" size={14} /> {pickupLabel(offer, now)}</p>

        {portioned
          ? <div className="order-portions">
            <span id="order-portions-label">Portions <small>({max === offer.portions_left ? `${max} left` : `up to ${max} per order`})</small></span>
            <div className="order-stepper" role="group" aria-labelledby="order-portions-label">
              <button type="button" aria-label="One portion less" disabled={portions <= 1 || saving} onClick={() => change(portions - 1)}><Icon name="minus" size={16} /></button>
              <output aria-live="polite">{portions}</output>
              <button type="button" aria-label="One portion more" disabled={portions >= max || saving} onClick={() => change(portions + 1)}><Icon name="plus" size={16} /></button>
            </div>
          </div>
          : <p className="order-whole">You order everything on offer ({offer.quantity_kg} kg).</p>}

        <div className="order-total">
          <span>Total</span>
          <span>
            {offer.original_price_ron && total !== null && <s>{formatRon(Math.round(offer.original_price_ron * portions * 100) / 100)}</s>}
            <strong>{total === null ? 'Price at pickup' : formatRon(total)}</strong>
          </span>
        </div>
        {total !== null && <p className="order-unit">{formatRon(offer.price_ron)} {priceUnit(offer)} · pay at pickup</p>}

        {error && <div className="order-error" role="alert"><strong>{error.title}</strong> {error.message}</div>}
        <div className="order-actions">
          <button type="button" className="order-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="order-primary" onClick={confirm} disabled={saving || max < 1}>{saving ? 'Placing order…' : 'Confirm order'}</button>
        </div>
      </>}
  </dialog>
}
