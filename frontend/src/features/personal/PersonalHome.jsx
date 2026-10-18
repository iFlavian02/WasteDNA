import Icon from '../../components/Icon.jsx'
import { ACCOUNTS } from '../accounts/accounts.js'
import '../dashboard/dashboard.css'
import { personalKpis, recentRescues, totalSaved } from './data.js'
import './personal.css'

/** Home of the personal demo account at `/personal`. Presentation data only. */
export default function PersonalHome() {
  const account = ACCOUNTS.personal
  return <div className="dashboard-page personal-page">
    <header className="personal-head">
      <div>
        <h1>Hello, {account.name.split(' ')[0]}!</h1>
        <p>Your food-saving activity in {account.organization}.</p>
      </div>
      <span className="personal-demo">Demo data</span>
    </header>

    <section className="kpi-panel personal-kpis" aria-label="Your impact">
      <div className="kpi-grid">{personalKpis.map(kpi => <article key={kpi.label} className="kpi-card">
        <div className={`kpi-icon kpi-icon--${kpi.tone}`}><Icon name={kpi.icon} size={22} /></div>
        <div className="kpi-copy"><h2>{kpi.label}</h2><p>{kpi.detail}</p></div>
        <div className="kpi-value"><strong>{kpi.value}</strong><span>{kpi.change}</span></div>
      </article>)}</div>
    </section>

    <div className="analytics-grid personal-grid">
      <section className="chart-card" aria-labelledby="personal-rescues-title">
        <div className="card-header">
          <div><h2 id="personal-rescues-title">Recent rescues</h2><p>Surplus portions you picked up</p></div>
        </div>
        <ul className="rescue-list">
          {recentRescues.map(rescue => <li key={rescue.id}>
            <span className="rescue-icon" aria-hidden="true"><Icon name="store" size={16} /></span>
            <div><strong>{rescue.place}</strong><span>{rescue.item}</span></div>
            <div className="rescue-meta"><b>{rescue.saved} RON saved</b><span>{rescue.when}</span></div>
          </li>)}
        </ul>
        <div className="chart-footer"><span>Total from these pickups</span><strong>{totalSaved(recentRescues)} RON</strong></div>
      </section>

      <section className="chart-card personal-soon" aria-labelledby="personal-soon-title">
        <div className="card-header"><div><h2 id="personal-soon-title">Surplus near you</h2><p>Live map of discounted leftovers</p></div></div>
        <div className="personal-soon-body">
          <span className="kpi-icon kpi-icon--green" aria-hidden="true"><Icon name="leaf" size={22} /></span>
          <strong>Coming soon</strong>
          <p>Restaurants nearby will show their leftovers here so you can reserve portions at a discount.</p>
        </div>
      </section>
    </div>
  </div>
}
