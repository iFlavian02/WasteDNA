import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import Icon from '../../components/Icon.jsx'
import { bestQuickWin, dashboardKpis, donutSegments, envelopeSettled, formatPercent, formatRon, presentationBreakdown, presentationRecommendations, splitItems, wasteValue, weeklyWaste } from './data.js'
import { useBreakdown } from './useBreakdown.js'
import './dashboard.css'

const splitColors = ['#1c4b3e', '#91c24c', '#5c9a2e', '#2a6352', '#c9d6cd', '#f5a524', '#b93a12']

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

function SplitPanel({ breakdown, error, loading }) {
  const [view, setView] = useState('service')
  const category = view === 'category'
  const { items, total } = splitItems(breakdown, view)
  const segments = donutSegments(items)

  return <article className={`chart-card split-card${loading ? ' is-loading' : ''}`} aria-labelledby="split-title" aria-busy={loading}>
    <header className="card-header compact-header">
      <div><h2 id="split-title">{category ? 'Unsold cost by category' : 'Lunch vs dinner'}</h2><p>Share of unsold production cost</p></div>
      <div className="split-toggle" role="group" aria-label="Split by">
        <button type="button" aria-pressed={!category} onClick={() => setView('service')}>Service</button>
        <button type="button" aria-pressed={category} onClick={() => setView('category')}>Category</button>
      </div>
    </header>
    {error && !breakdown ? <p className="chart-empty">Could not load this breakdown.</p>
      : total === 0 ? <p className="chart-empty">No unsold food for this selection.</p>
        : <div className="split-content">
          <div className="split-donut-wrap">
            <svg className="split-donut" viewBox="0 0 42 42" role="img" aria-label={`${items.map(item => `${item.name} ${formatPercent(item.share)}`).join(', ')}.`}>
              <circle cx="21" cy="21" r="16" className="donut-track" />
              {segments.map(item => <circle key={`${view}-${item.key}`} cx="21" cy="21" r="16" pathLength="100" className="split-segment" stroke={splitColors[item.colorIndex % splitColors.length]} strokeDasharray={`${item.share * 100} ${100 - item.share * 100}`} strokeDashoffset={-item.offset} />)}
            </svg>
            <div><strong>{formatRon(total)}</strong><span>Total</span></div>
          </div>
          <ul className="split-legend">{items.map((item, index) => <li key={item.key}>
            <i style={{ background: splitColors[index % splitColors.length] }} aria-hidden="true" />
            <span>{item.name}<small>{formatRon(item.value)}</small></span>
            <strong>{formatPercent(item.share)}</strong>
          </li>)}</ul>
        </div>}
  </article>
}

function QuickWin({ envelope, error, pending }) {
  const win = bestQuickWin(envelope)
  return <section className="quick-win" aria-labelledby="quick-win-title">
    <div className="quick-win-heading"><div><span className="quick-win-icon"><Icon name="lightbulb" size={19} /></span><h2 id="quick-win-title">Quick win</h2></div><Link to="/decisions/actions">All actions <Icon name="arrowRight" size={14} /></Link></div>
    {pending ? <p role="status" className="quick-win-muted">Looking for ways to save…</p>
      : win ? <div className="quick-win-body"><strong>{win.title}</strong><span>≈ <b>{formatRon(win.opportunity_ron_per_30_days)}</b> per 30 days · indicative, not guaranteed</span></div>
        : <p className="quick-win-muted">{error ? 'Recommendations are temporarily unavailable.' : 'No clear quick win in this data yet.'}</p>}
  </section>
}

export default function Dashboard({ api, dataset }) {
  const [unit, setUnit] = useState('gr')
  const [showKpis, setShowKpis] = useState(true)
  const maxValue = Math.max(...weeklyWaste.map(item => wasteValue(item, unit)))
  const datasetId = dataset?.dataset_id
  const breakdown = useBreakdown(api, datasetId, {})
  const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)
  const activeBreakdown = datasetId ? breakdown.data : presentationBreakdown
  const activeRecommendations = datasetId ? recommendations.data : presentationRecommendations
  const recommendationsPending = Boolean(datasetId) && !recommendations.error && !envelopeSettled(recommendations.data)

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

      <SplitPanel breakdown={activeBreakdown} error={breakdown.error} loading={breakdown.loading} />
    </section>

    <QuickWin envelope={activeRecommendations} error={recommendations.error} pending={recommendationsPending} />
  </div>
}
