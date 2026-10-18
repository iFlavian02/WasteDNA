import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { dashboardKpis, wasteValue, weeklyWaste } from './data.js'
import './dashboard.css'

function Filter({ label, children, accent = false }) {
  return <button type="button" className={`filter-control${accent ? ' filter-control--accent' : ''}`}>
    <span>{label}</span>
    <strong>{children}</strong>
  </button>
}

function KpiCard({ kpi }) {
  return <article className="kpi-card">
    <div className={`kpi-icon kpi-icon--${kpi.tone}`}><Icon name={kpi.icon} size={22} /></div>
    <div className="kpi-copy"><h2>{kpi.label}</h2><p>{kpi.detail}</p></div>
    <div className="kpi-value"><strong>{kpi.value}</strong><span><Icon name="arrowDown" size={12} />{kpi.change}</span></div>
  </article>
}

export default function Dashboard() {
  const [unit, setUnit] = useState('gr')
  const [showKpis, setShowKpis] = useState(true)
  const maxValue = Math.max(...weeklyWaste.map(item => wasteValue(item, unit)))

  return <div className="dashboard-page">
    <section className="mobile-filters" aria-label="Dashboard filters">
      <Filter label="Period">Month <Icon name="chevronDown" size={12} /></Filter>
      <Filter label="Date"><Icon name="chevronLeft" size={12} /> February 2025 <Icon name="chevronRight" size={12} /></Filter>
      <Filter label="Compare to">Base month <Icon name="chevronDown" size={12} /></Filter>
      <Filter label="Waste type" accent><i /> Edible <Icon name="chevronDown" size={12} /></Filter>
      <Filter label="Device">Hotel Luc (Main Scale) <Icon name="chevronDown" size={12} /></Filter>
    </section>

    <section className="kpi-panel" aria-label="Key performance indicators">
      {showKpis && <div className="kpi-grid">{dashboardKpis.map(kpi => <KpiCard key={kpi.label} kpi={kpi} />)}</div>}
      <button type="button" className="collapse-button" onClick={() => setShowKpis(value => !value)} aria-expanded={showKpis}>
        {showKpis ? 'See less' : 'See metrics'} <Icon name={showKpis ? 'chevronUp' : 'chevronDown'} size={12} />
      </button>
    </section>

    <div className="sync-status" role="status"><span className="live-dot"><i /></span>Connected to scale API <b>•</b> Live sync active <b>•</b> Last record received 12 mins ago</div>

    <section className="analytics-grid" aria-label="Waste analytics">
      <article className="chart-card bar-card">
        <header className="card-header">
          <div><h2>Average waste per guest per day</h2><p>Daily breakdown across breakfast, lunch &amp; dinner</p></div>
          <div className="unit-toggle" aria-label="Chart unit">
            {['gr', 'EUR'].map(option => <button type="button" key={option} className={unit === option ? 'active' : ''} aria-pressed={unit === option} onClick={() => setUnit(option)}>{option}</button>)}
          </div>
        </header>
        <div className="bar-chart" aria-label={`Daily waste in ${unit}`}>
          <div className="y-axis" aria-hidden="true">{unit === 'gr' ? [200, 150, 100, 50, 0].map(value => <span key={value}>{value} gr</span>) : ['1.80', '1.35', '0.90', '0.45', '0.00'].map(value => <span key={value}>€{value}</span>)}</div>
          <div className="grid-lines" aria-hidden="true">{[0, 1, 2, 3, 4].map(line => <i key={line} />)}</div>
          <div className="bars">{weeklyWaste.map(item => {
            const value = wasteValue(item, unit)
            return <div className="bar-column" key={item.day}><div className="bar-value" style={{ height: `${(value / maxValue) * 100}%` }} title={`${item.day}: ${unit === 'gr' ? `${value} gr` : `EUR ${value.toFixed(2)}`}`} /><span>{item.day}</span></div>
          })}</div>
        </div>
        <footer className="chart-footer"><span>Average target: &lt; 140 gr/guest</span><strong>Within hotel target goal</strong></footer>
      </article>

      <article className="chart-card donut-card">
        <header className="card-header"><div><h2>Edible vs. inedible waste</h2></div><button type="button" className="icon-button" aria-label="More waste ratio options"><Icon name="more" /></button></header>
        <div className="donut-wrap">
          <svg className="donut" viewBox="0 0 42 42" role="img" aria-label="74 percent edible waste">
            <circle cx="21" cy="21" r="16" className="donut-track" />
            <circle cx="21" cy="21" r="16" className="donut-progress" pathLength="100" strokeDasharray="74 26" />
          </svg>
          <div><strong>74%</strong><span>Edible</span></div>
        </div>
        <div className="legend">
          <div><span><i className="legend-dot legend-dot--green" />Edible waste</span><strong>775 kg (74%)</strong></div>
          <div><span><i className="legend-dot" />Inedible (bones, peelings)</span><strong>272 kg (26%)</strong></div>
        </div>
      </article>
    </section>
  </div>
}
