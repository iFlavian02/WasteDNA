import { Leaf, MapPin, PiggyBank, ShoppingBag, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProduceCrate } from '../../components/illustrations.jsx'
import { EmptyState } from '../../components/States.jsx'
import { PageHeader } from '../../components/ui.jsx'
import { ROLES } from '../../shell/navigation.js'
import './marketplace.css'

const BENEFITS = [
  { icon: PiggyBank, title: 'Save money', text: 'Big discounts' },
  { icon: Leaf, title: 'Reduce waste', text: 'Rescue good food' },
  { icon: Store, title: 'Support local', text: 'Restaurants near you' },
]

/**
 * Customer pages, mounted at `/map/*` and `/my-pickups` with `{ api,
 * sessionId }`. The live map and reservations arrive in plan step 5
 * (docs/UI_PLAN.md); until then the map area is a labelled placeholder.
 */
export function MapPage() {
  return <div className="we-market">
    <section className="we-market-hero" aria-labelledby="we-map-title">
      <div className="we-market-hero-text">
        <span className="we-market-hello">Hello, {ROLES.customer.user.name}!</span>
        <h1 id="we-map-title">Good food is closer than you think</h1>
        <p>Restaurants nearby sell their leftovers at big discounts. Reserve your portions and pick them up on the way.</p>
      </div>
      <ProduceCrate className="we-market-hero-art" />
      <ul className="we-benefits">
        {BENEFITS.map(({ icon: Icon, title, text }) => <li key={title}>
          <span aria-hidden="true"><Icon /></span>
          <div><strong>{title}</strong><small>{text}</small></div>
        </li>)}
      </ul>
    </section>

    <section className="we-map-preview" aria-labelledby="we-near-title">
      <div className="we-map-preview-head">
        <h2 id="we-near-title">Surplus food near you</h2>
        <span className="we-badge"><MapPin aria-hidden="true" />Iași</span>
      </div>
      <div className="we-map-placeholder">
        {[[22, 34], [48, 22], [64, 58], [34, 66], [78, 30], [56, 78]].map(([x, y], index) => <span key={index} className="we-map-dot" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />)}
        <div className="we-map-placeholder-card">
          <strong>The live map is coming next</strong>
          <span>Deals from restaurants will appear here as dots you can tap.</span>
        </div>
      </div>
    </section>
  </div>
}

export function MyPickupsPage() {
  return <section aria-labelledby="we-pickups-title">
    <PageHeader id="we-pickups-title" eyebrow="Customer" title="My pickups" description="Your reserved portions and pickup codes." />
    <EmptyState icon={ShoppingBag} title="No pickups yet" description="Reserve portions from a deal on the map and they will appear here with a pickup code.">
      <Link className="we-btn we-btn--primary" to="/map">Find deals near you</Link>
    </EmptyState>
  </section>
}
