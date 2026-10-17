import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States.jsx'
import { StatusBadge } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { formatDateTime, formatKg, nameOf, OFFER_STATUSES, STATUS_LABELS } from '../logic.js'

/** Offers of the session, most urgent (earliest deadline) first. */
export function OffersList({ client, directory }) {
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const offers = useLoad(() => client.offers({ status, category }), [client, status, category])

  return <section aria-labelledby="rd-offers-title">
    <div className="rd-heading">
      <h1 id="rd-offers-title">Surplus offers</h1>
      <Link className="rd-button" to="new">New offer</Link>
    </div>
    <div className="rd-filters">
      <label>Status <select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">All</option>
        {OFFER_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
      </select></label>
      <label>Category <select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">All</option>
        {directory.categories.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button type="button" className="rd-link" onClick={offers.reload}>Refresh</button>
    </div>
    {offers.error ? <ErrorState error={offers.error} onRetry={offers.reload} />
      : !offers.data ? <LoadingState label="Loading offers…" />
        : offers.data.length === 0 ? <EmptyState title="No offers match" description={status || category ? 'Change the filters, or create an offer.' : 'Create the first offer of this session.'} />
          : <ul className="rd-cards">
            {offers.data.map(offer => <li key={offer.id} className="rd-card">
              <div className="rd-card-head">
                <strong>{offer.category}</strong> · {formatKg(offer.quantity_kg)}
                <StatusBadge status={offer.status} />
              </div>
              <p>{offer.description || <em>No description</em>}</p>
              <dl className="rd-meta">
                <dt>Donor</dt><dd>{nameOf(directory.donorById, offer.donor_id)}</dd>
                <dt>Pickup</dt><dd>{formatDateTime(offer.available_from)} → {formatDateTime(offer.pickup_deadline)}</dd>
                <dt>Allergens</dt><dd>{offer.allergens === null ? 'Unknown' : offer.allergens.length ? offer.allergens.join(', ') : 'None declared'}</dd>
              </dl>
              <Link to={`offers/${encodeURIComponent(offer.id)}`}>{offer.status === 'available' ? 'Find organizations' : 'View details'}</Link>
            </li>)}
          </ul>}
  </section>
}
