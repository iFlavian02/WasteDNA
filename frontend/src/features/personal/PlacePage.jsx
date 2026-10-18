import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import CityMap from './CityMap.jsx'
import { OrderDialog } from './OrderDialog.jsx'
import {
  allergenText,
  categoryLabel,
  discountPct,
  displayName,
  formatKm,
  formatRon,
  isPriced,
  minutesLeft,
  pickupLabel,
  placeById,
  portionsLeft,
  priceUnit,
} from './places.js'

const TYPE_LABELS = { restaurant: 'Restaurant', supermarket: 'Shop' }

function timeLeft(minutes) {
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours} h ${minutes % 60} min left` : `${hours} h left`
}

function SaleItem({ offer, now, onOrder }) {
  const discount = discountPct(offer)
  const minutes = minutesLeft(offer, now)
  const left = portionsLeft(offer)
  const amount = [offer.portion_count ? `${left} of ${offer.portion_count} portions left` : 'Sold as one lot', `${offer.quantity_kg} kg`, ...offer.storage_requirements].filter(Boolean)
  return <li className="sale-item">
    <div className="sale-main">
      <span className="sale-category">{categoryLabel(offer.category)}</span>
      <h3>{displayName(offer.description) || categoryLabel(offer.category)}</h3>
      <p className="sale-meta"><Icon name="clock" size={14} /> {pickupLabel(offer, now)} <span className={minutes <= 60 ? 'sale-left is-soon' : 'sale-left'}>{timeLeft(minutes)}</span></p>
      <p className="sale-meta">{amount.join(' · ')}</p>
      <p className={`sale-allergens${offer.allergens === null ? ' is-unknown' : ''}`}>{allergenText(offer.allergens)}</p>
    </div>
    <div className="sale-price">
      {discount !== null && <span className="deal-badge">-{discount}%</span>}
      {isPriced(offer)
        ? <><strong>{formatRon(offer.price_ron)}</strong>{offer.original_price_ron && <s>{formatRon(offer.original_price_ron)}</s>}<small>{priceUnit(offer)}</small></>
        : <><strong>Price not set</strong><small>ask at pickup</small></>}
      <button type="button" className="order-primary sale-order" onClick={() => onOrder(offer)}><Icon name="bag" size={15} /> Order now</button>
    </div>
  </li>
}

/** `/personal/places/:donorId`: one restaurant's food on sale, from the same live data as the map. */
export function PlacePage({ map, customerId, onOrdered }) {
  const { donorId } = useParams()
  const [ordering, setOrdering] = useState(null)
  const back = <Link to="/personal" className="place-back"><Icon name="chevronLeft" size={14} /> Food map</Link>
  if (!map.ready) return <div className="food-page">{back}{map.error ? <ErrorState error={map.error} onRetry={map.reload} /> : <LoadingState />}</div>
  const place = placeById(map.donors, map.offers, donorId, { now: map.loadedAt })
  if (!place) return <div className="food-page">{back}<section className="place-missing"><h1>Place not found</h1><p>This restaurant isn't on the map. It may belong to an older demo session.</p></section></div>

  return <div className="food-page">
    {back}
    <section className="place-card" aria-labelledby="place-title">
      <div className="place-info">
        <b className={`food-avatar food-avatar--${place.type} food-avatar--large`} aria-hidden="true">{place.initials}</b>
        <div>
          <h1 id="place-title">{place.name}</h1>
          <p>{TYPE_LABELS[place.type] || place.type} · <Icon name="pin" size={13} /> {formatKm(place.distanceKm)} from you</p>
          <p className="place-summary">
            {place.count ? `${place.count} ${place.count === 1 ? 'item' : 'items'} on sale` : 'Nothing on sale right now'}
            {place.maxDiscount !== null && ` · up to ${place.maxDiscount}% off`}
          </p>
        </div>
        <span className="personal-demo">Demo data</span>
      </div>
      <CityMap places={[place]} center={place.location} zoom={15} still className="place-map" />
    </section>

    <section className="sale-card" aria-labelledby="sale-title">
      <div className="card-header"><div><h2 id="sale-title">On sale now</h2><p>Surplus food from today, soonest pickup first</p></div></div>
      {place.count
        ? <ul className="sale-list">{place.offers.map(offer => <SaleItem key={offer.id} offer={offer} now={map.loadedAt} onOrder={setOrdering} />)}</ul>
        : <p className="sale-empty">Check back later: offers appear here as soon as {place.name} publishes them.</p>}
      <p className="sale-note">Order now, then show your pickup code and pay at the restaurant during the pickup window.</p>
    </section>
    {ordering && <OrderDialog
      offer={ordering}
      place={place}
      client={map.client}
      customerId={customerId}
      now={map.loadedAt}
      onClose={() => setOrdering(null)}
      onChanged={() => { map.reload(); onOrdered() }}
    />}
  </div>
}
