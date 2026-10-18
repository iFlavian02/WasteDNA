import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/Icon.jsx'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States.jsx'
import { StatusBadge } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { formatDateTime, formatKg, nameOf, STATUS_LABELS } from '../logic.js'

const SALE_STATUSES = ['available', 'expired', 'cancelled']
const formatRon = value => `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} lei`
const discountOf = offer => offer.original_price_ron > 0 ? Math.round((1 - offer.price_ron / offer.original_price_ron) * 100) : null

/** Offers of the session, most urgent (earliest deadline) first. */
export function OffersList({ client, directory }) {
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const offers = useLoad(() => client.offers({ status, category }), [client, status, category])
  const saleOffers = (offers.data || []).filter(offer => offer.price_ron !== null && offer.price_ron !== undefined && SALE_STATUSES.includes(offer.status))

  return <section aria-labelledby="rd-offers-title">
    <div className="rd-heading">
      <h1 id="rd-offers-title">Discounted orders</h1>
      <Link className="rd-button" to="new"><Icon name="plus" size={16} strokeWidth={2.2} />New order</Link>
    </div>
    <div className="rd-filters">
      <label>Status <select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">All</option>
        {SALE_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
      </select></label>
      <label>Category <select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">All</option>
        {directory.categories.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button type="button" className="rd-link" onClick={offers.reload}>Refresh</button>
    </div>
    {offers.error ? <ErrorState error={offers.error} onRetry={offers.reload} />
      : !offers.data ? <LoadingState label="Loading orders…" />
        : saleOffers.length === 0 ? <EmptyState title="No orders match" description={status || category ? 'Change the filters, or create an order.' : 'Create the first discounted order.'} />
          : <ul className="rd-cards">
            {saleOffers.map(offer => <li key={offer.id} className="rd-card">
              <div className="rd-card-body">
                <div className="rd-card-head">
                  <span><strong>{offer.category}</strong><span aria-hidden="true"> · </span>{formatKg(offer.quantity_kg)}</span>
                  <StatusBadge status={offer.status} />
                </div>
                <p>{offer.description || <em>No description</em>}</p>
                <div className="rd-price-line">
                  <strong>{formatRon(offer.price_ron)}</strong>
                  {offer.original_price_ron !== null && <><s>{formatRon(offer.original_price_ron)}</s><span>-{discountOf(offer)}%</span></>}
                  <small>{offer.portion_count ? 'per portion' : 'for all of it'}</small>
                </div>
                <dl className="rd-meta">
                  <dt>Seller</dt><dd>{nameOf(directory.donorById, offer.donor_id)}</dd>
                  <dt>Pickup</dt><dd>{formatDateTime(offer.available_from)} → {formatDateTime(offer.pickup_deadline)}</dd>
                  <dt>Stock</dt><dd>{offer.portions_left ?? offer.portion_count ?? 1} {offer.portion_count ? 'portions' : 'lot'} available</dd>
                  <dt>Allergens</dt><dd>{offer.allergens === null ? 'Unknown' : offer.allergens.length ? offer.allergens.join(', ') : 'None declared'}</dd>
                </dl>
              </div>
              <div className="rd-card-footer"><Link to={`offers/${encodeURIComponent(offer.id)}`}>View details</Link></div>
            </li>)}
          </ul>}
  </section>
}
