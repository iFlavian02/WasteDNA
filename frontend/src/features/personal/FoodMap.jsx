import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { ErrorState } from '../../components/States.jsx'
import CityMap from './CityMap.jsx'
import { formatKm, formatRon, placePath, TIME_ZONE } from './places.js'

const time = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** `/personal`: live map of Iași with every place that has surplus food on sale. */
export function FoodMap({ map }) {
  const navigate = useNavigate()
  const { places, fresh, ready, loading, error, loadedAt, reload } = map
  if (!ready && error) return <div className="food-page"><ErrorState error={error} onRetry={reload} /></div>

  return <div className="food-page">
    <header className="food-head">
      <div>
        <h1>Food near you</h1>
        <p>
          {loading ? 'Loading surplus food in Iași…' : `${places.length} ${places.length === 1 ? 'place' : 'places'} in Iași with surplus food`}
          {loadedAt && <> · <span className="food-live"><i aria-hidden="true" />live, updated {time.format(loadedAt)}</span></>}
          {ready && error && <> · <span className="food-stale">couldn't refresh</span></>}
        </p>
      </div>
      <span className="personal-demo">Demo data</span>
    </header>

    <div className="food-layout">
      <section className="food-map-card" aria-label="Map of Iași with restaurants that have food on sale">
        <CityMap places={places} fresh={fresh} onOpen={place => navigate(placePath(place))} />
        {ready && !places.length && <div className="food-map-empty" role="status">
          <strong>No surplus food right now</strong>
          <span>Restaurants show up here as soon as they publish an offer.</span>
        </div>}
      </section>

      <aside className="food-list" aria-labelledby="food-list-title">
        <h2 id="food-list-title">Nearby</h2>
        {ready && !places.length && <p className="food-list-empty">Nothing on sale yet.</p>}
        <ol>
          {places.map(place => <li key={place.id} className={fresh.has(place.id) ? 'is-new' : undefined}>
            <Link to={placePath(place)}>
              <b className={`food-avatar food-avatar--${place.type}`} aria-hidden="true">{place.initials}</b>
              <span className="food-list-main">
                <strong>{place.name}</strong>
                <small>{place.count} on sale{place.cheapest !== null && ` · from ${formatRon(place.cheapest)}`}</small>
              </span>
              <span className="food-list-side">
                {place.maxDiscount !== null && <span className="deal-badge">-{place.maxDiscount}%</span>}
                <small>{formatKm(place.distanceKm)}</small>
              </span>
            </Link>
          </li>)}
        </ol>
        <p className="food-list-note"><Icon name="pin" size={14} /> Distances from Centru, Iași</p>
      </aside>
    </div>
  </div>
}
