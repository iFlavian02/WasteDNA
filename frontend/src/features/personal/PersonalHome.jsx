import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { ACCOUNTS } from '../accounts/accounts.js'
import '../dashboard/dashboard.css'
import { cheapDeals, DEALS, discountPct, formatEur, SORTS, sortDeals } from './data.js'
import './personal.css'

/**
 * Home of the personal demo account at `/personal`: surplus deals near the
 * user and the cheapest ones right now. Presentation data only (data.js).
 */
export default function PersonalHome() {
  const account = ACCOUNTS.personal
  const [sort, setSort] = useState('nearest')
  const cheap = cheapDeals(DEALS)
  const maxDiscount = Math.max(...DEALS.map(discountPct))

  return <div className="dashboard-page personal-page">
    <header className="personal-head">
      <div>
        <h1>Surplus deals near you</h1>
        <p>{account.organization} · {DEALS.length} deals within {Math.ceil(Math.max(...DEALS.map(deal => deal.distanceKm)))} km · up to {maxDiscount}% off</p>
      </div>
      <span className="personal-demo">Demo data</span>
    </header>

    <section className="chart-card" aria-labelledby="cheap-title">
      <div className="card-header">
        <div><h2 id="cheap-title">Cheap deals</h2><p>Leftovers for {formatEur(5)} or less, cheapest first</p></div>
      </div>
      <ul className="cheap-grid">
        {cheap.map(deal => <li key={deal.id} className="cheap-card">
          <span className="deal-badge">−{discountPct(deal)}%</span>
          <strong className="cheap-price">{formatEur(deal.priceEur)}</strong>
          <span className="deal-was">{formatEur(deal.originalEur)}</span>
          <h3>{deal.item}</h3>
          <span className="deal-place">{deal.place} · {deal.distanceKm.toFixed(1)} km</span>
        </li>)}
      </ul>
    </section>

    <section className="chart-card" aria-labelledby="near-title">
      <div className="card-header">
        <div><h2 id="near-title">All surplus deals nearby</h2><p>Restaurants, bakeries and hotels selling leftovers today</p></div>
        <div className="unit-toggle" role="group" aria-label="Sort deals">
          {Object.entries(SORTS).map(([key, label]) => <button key={key} type="button" className={sort === key ? 'active' : ''} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}</button>)}
        </div>
      </div>
      <ul className="deal-list">
        {sortDeals(DEALS, sort).map(deal => <li key={deal.id}>
          <span className="deal-icon" aria-hidden="true"><Icon name="store" size={18} /></span>
          <div className="deal-main">
            <div className="deal-title"><strong>{deal.item}</strong><span className="deal-category">{deal.category}</span></div>
            <span className="deal-place">{deal.place} · {deal.area}</span>
            <span className="deal-meta">{deal.distanceKm.toFixed(1)} km · {deal.pickup} · {deal.left} left</span>
          </div>
          <div className="deal-price">
            <span className="deal-badge">−{discountPct(deal)}%</span>
            <strong>{formatEur(deal.priceEur)}</strong>
            <span className="deal-was">{formatEur(deal.originalEur)}</span>
          </div>
        </li>)}
      </ul>
      <div className="chart-footer"><span>Reservations open soon. Pay at pickup.</span><strong>{DEALS.reduce((sum, deal) => sum + deal.left, 0)} portions available</strong></div>
    </section>
  </div>
}
