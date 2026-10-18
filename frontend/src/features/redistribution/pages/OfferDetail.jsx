import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States.jsx'
import { ApiErrorBox, StatusBadge } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { formatDateTime, formatKg, nameOf } from '../logic.js'

const money = value => `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} lei`
const discount = offer => Math.round((1 - offer.price_ron / offer.original_price_ron) * 100)

/** Customer-sale details. Charity matching and reservations are not part of business Orders. */
export function OfferDetail({ client, directory }) {
  const { offerId } = useParams()
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)
  const view = useLoad(() => client.offer(offerId), [client, offerId])

  async function cancel() {
    setBusy(true)
    setActionError(null)
    try {
      await client.cancelOffer(offerId)
      view.reload()
    } catch (error) {
      setActionError(error)
    } finally {
      setBusy(false)
    }
  }

  if (view.error && !view.data) return <><BackLink /><ErrorState error={view.error} onRetry={view.reload} /></>
  if (!view.data) return <LoadingState label="Loading order…" />
  const offer = view.data
  if (offer.price_ron === null || offer.price_ron === undefined) return <><BackLink /><EmptyState title="Not a customer order" description="This item is not available in business Orders." /></>

  return <section className="rd-order-detail" aria-labelledby="rd-offer-title">
    <BackLink />
    <div className="rd-heading">
      <div><span className="rd-eyebrow">Product</span><h1 id="rd-offer-title">{offer.description || offer.category}</h1></div>
      <StatusBadge status={offer.status} />
    </div>
    <div className="rd-detail-grid">
      <section className="rd-panel" aria-labelledby="rd-sale-title">
        <h2 id="rd-sale-title">Sale details</h2>
        <div className="rd-price-line rd-price-line--large">
          <strong>{money(offer.price_ron)}</strong>
          {offer.original_price_ron !== null && <><s>{money(offer.original_price_ron)}</s><span>-{discount(offer)}%</span></>}
          <small>{offer.portion_count ? 'per portion' : 'for all of it'}</small>
        </div>
        <dl className="rd-meta">
          <dt>Seller</dt><dd>{nameOf(directory.donorById, offer.donor_id)}</dd>
          <dt>Category</dt><dd>{offer.category}</dd>
          <dt>Stock</dt><dd>{offer.portion_count ? `${offer.portions_left ?? offer.portion_count} of ${offer.portion_count} portions available` : 'One lot available'} · {formatKg(offer.quantity_kg)} total</dd>
          <dt>Pickup</dt><dd>{formatDateTime(offer.available_from)} → {formatDateTime(offer.pickup_deadline)}</dd>
          <dt>Allergens</dt><dd>{offer.allergens === null ? 'Unknown' : offer.allergens.length ? offer.allergens.join(', ') : 'None declared'}</dd>
          <dt>Storage</dt><dd>{offer.storage_requirements.join(', ') || 'No special requirements'}</dd>
        </dl>
      </section>
    </div>
    <ApiErrorBox error={actionError} onDismiss={() => setActionError(null)} />
    {view.error && <ApiErrorBox error={view.error} />}
    {offer.status === 'expired' && <p className="rd-notice">This order expired when its pickup window closed.</p>}
    {offer.status === 'cancelled' && <p className="rd-notice">This order is no longer on sale.</p>}
    {offer.status === 'available' && <button type="button" className="rd-danger" disabled={busy} onClick={() => window.confirm('Remove this product from sale? Existing customer orders will be cancelled.') && cancel()}>{busy ? 'Removing…' : 'Remove from sale'}</button>}
  </section>
}

function BackLink() {
  return <Link to=".." className="rd-back">← All orders</Link>
}
