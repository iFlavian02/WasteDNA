import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import Icon from '../../components/Icon.jsx'
import {
  bestQuickWin, breakdownQuery, categoryName, dashboardKpis, donutSegments, envelopeSettled, formatAxis, formatBarValue, formatPercent,
  formatRon, monthLabel, monthsBetween, previousQuery, shiftMonth, splitItems, weekdayBars,
} from './data.js'
import { useBreakdown } from './useBreakdown.js'
import './dashboard.css'

const splitColors = ['#1c4b3e', '#91c24c', '#5c9a2e', '#2a6352', '#c9d6cd', '#f5a524', '#b93a12']

/** Period, month, service and category filters; every option comes from the dataset. */
function DashboardFilters({ filters, setFilters, months, options }) {
  const set = patch => setFilters(current => ({ ...current, ...patch }))
  const index = months.indexOf(filters.month)
  return <div className="dashboard-filters" aria-label="Dashboard filters">
    <label className="filter-control">
      <span>Period</span>
      <select value={filters.period} onChange={event => set({ period: event.target.value })}>
        <option value="month">Month</option>
        <option value="all">Whole dataset</option>
      </select>
    </label>
    {filters.period === 'month' && <div className="filter-control filter-month" role="group" aria-label="Month">
      <span>Month</span>
      <strong>
        <button type="button" aria-label="Previous month" disabled={index <= 0} onClick={() => set({ month: months[index - 1] })}><Icon name="chevronLeft" size={13} /></button>
        <output aria-live="polite">{filters.month ? monthLabel(filters.month) : '…'}</output>
        <button type="button" aria-label="Next month" disabled={index < 0 || index >= months.length - 1} onClick={() => set({ month: months[index + 1] })}><Icon name="chevronRight" size={13} /></button>
      </strong>
    </div>}
    <label className="filter-control">
      <span>Service</span>
      <select value={filters.timeSlot} onChange={event => set({ timeSlot: event.target.value })}>
        <option value="">All services</option>
        {(options?.time_slots || []).map(slot => <option key={slot} value={slot}>{slot === 'lunch' ? 'Lunch' : slot === 'dinner' ? 'Dinner' : slot}</option>)}
      </select>
    </label>
    <label className="filter-control">
      <span>Category</span>
      <select value={filters.category} onChange={event => set({ category: event.target.value })}>
        <option value="">All categories</option>
        {(options?.categories || []).map(category => <option key={category} value={category}>{categoryName(category)}</option>)}
      </select>
    </label>
  </div>
}

function KpiCard({ kpi }) {
  const trend = kpi.change
  return <article className="kpi-card">
    <div className={`kpi-icon kpi-icon--${kpi.tone}`}><Icon name={kpi.icon} size={22} /></div>
    <div className="kpi-copy"><h2>{kpi.label}</h2><p>{kpi.detail}</p></div>
    <div className="kpi-value">
      <strong>{kpi.value}</strong>
      {trend && <span className={`kpi-trend kpi-trend--${trend.direction}`}>{trend.direction !== 'flat' && <Icon name="arrowDown" size={12} />}{trend.text}</span>}
    </div>
  </article>
}

function WeekdayChart({ breakdown, error, periodLabel }) {
  const [unit, setUnit] = useState('portions')
  const { bars, max, ticks, peak } = weekdayBars(breakdown?.by_weekday, unit)
  const days = breakdown?.totals?.days_with_data ?? 0
  const summary = bars.map(bar => `${bar.weekday}: ${formatBarValue(bar.value, unit)}`).join(', ')
  return <article className="chart-card bar-card" aria-labelledby="weekday-title">
    <header className="card-header">
      <div><h2 id="weekday-title">Average unsold food per day</h2><p>By weekday · {periodLabel} ({unit === 'RON' ? 'RON' : 'portions'} per day)</p></div>
      <div className="unit-toggle" role="group" aria-label="Chart unit">
        {[['portions', 'Portions'], ['RON', 'RON']].map(([value, label]) => <button type="button" key={value} className={unit === value ? 'active' : ''} aria-pressed={unit === value} onClick={() => setUnit(value)}>{label}</button>)}
      </div>
    </header>
    {error && !breakdown ? <p className="chart-empty">Could not load this chart.</p>
      : !breakdown ? <p className="chart-empty" role="status">Loading…</p>
        : !days ? <p className="chart-empty">No data for this selection.</p>
          : <div className="bar-chart" role="img" aria-label={`Average unsold ${unit === 'RON' ? 'cost' : 'portions'} per day. ${summary}.`}>
            <div className="y-axis" aria-hidden="true">{ticks.map(tick => <span key={tick}>{formatAxis(tick)}</span>)}</div>
            <div className="grid-lines" aria-hidden="true">{ticks.map(tick => <i key={tick} />)}</div>
            <div className="bars" aria-hidden="true">{bars.map(bar => <div className="bar-column" key={bar.day}>
              {bar.value != null && <div className={`bar-value${peak?.day === bar.day ? ' is-peak' : ''}`} style={{ height: `${(bar.value / max) * 100}%` }} title={`${bar.weekday}: ${formatBarValue(bar.value, unit)} on average (${bar.days} days)`} />}
              <span>{bar.day}</span>
            </div>)}</div>
          </div>}
    <footer className="chart-footer">
      <span>Based on {days} {days === 1 ? 'day' : 'days'} with data</span>
      {peak && <strong>Most left over: {peak.weekday}</strong>}
    </footer>
  </article>
}

function SplitPanel({ breakdown, error, loading }) {
  const [view, setView] = useState('service')
  const category = view === 'category'
  const { items, total } = splitItems(breakdown, view)
  const segments = donutSegments(items)

  return <article className={`chart-card split-card${category ? ' split-card--category' : ''}${loading ? ' is-loading' : ''}`} aria-labelledby="split-title" aria-busy={loading}>
    <header className="card-header compact-header">
      <div><h2 id="split-title">{category ? 'Unsold cost by category' : 'Lunch vs dinner'}</h2><p>Share of unsold production cost</p></div>
      <div className="split-toggle" role="group" aria-label="Split by">
        <button type="button" aria-pressed={!category} onClick={() => setView('service')}>Service</button>
        <button type="button" aria-pressed={category} onClick={() => setView('category')}>Category</button>
      </div>
    </header>
    {error && !breakdown ? <p className="chart-empty">Could not load this breakdown.</p>
      : !breakdown ? <p className="chart-empty" role="status">Loading…</p>
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

/** Shown instead of any numbers until a dataset is imported. */
function NoDataPrompt({ api, onSelect }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  async function loadDemo() {
    setLoading(true)
    setError(null)
    try {
      onSelect(await api.request('/api/datasets/demo', { method: 'POST' }))
    } catch (caught) {
      setError(caught)
      setLoading(false)
    }
  }
  return <div className="dashboard-page dashboard-page--empty">
    <section className="dashboard-empty" aria-labelledby="dashboard-empty-title">
      <span className="dashboard-empty-icon" aria-hidden="true"><Icon name="cloudUpload" size={28} /></span>
      <h1 id="dashboard-empty-title">No data loaded yet</h1>
      <p>Your dashboard calculates waste, costs and quick wins from your own kitchen records. Upload a CSV or start with the synthetic demo dataset to see it.</p>
      <div className="dashboard-empty-actions">
        <Link to="/upload" className="dashboard-empty-primary"><Icon name="upload" size={16} /> Load your data</Link>
        <button type="button" className="dashboard-empty-secondary" onClick={loadDemo} disabled={loading}><Icon name="flask" size={16} /> {loading ? 'Loading demo data…' : 'Use demo data'}</button>
      </div>
      {error && <p className="dashboard-empty-error" role="alert">{error.status === 503 ? 'Many people are importing right now. Try again in a minute.' : `Couldn't load the demo data: ${error.message}`}</p>}
    </section>
  </div>
}

export default function Dashboard({ api, dataset, onSelect }) {
  if (!dataset?.dataset_id) return <NoDataPrompt api={api} onSelect={onSelect} />
  // A new dataset starts again from its latest month with no filters.
  return <DatasetDashboard key={dataset.dataset_id} api={api} datasetId={dataset.dataset_id} />
}

function DatasetDashboard({ api, datasetId }) {
  const [showKpis, setShowKpis] = useState(true)
  const [chosen, setFilters] = useState({ period: 'month', month: null, timeSlot: '', category: '' })
  // The whole-dataset breakdown gives the date range and filter options.
  const overview = useBreakdown(api, datasetId, {})
  const available = overview.data?.available || null
  const months = monthsBetween(available)
  const filters = { ...chosen, month: months.includes(chosen.month) ? chosen.month : months.at(-1) || null }
  const selected = useBreakdown(api, datasetId, breakdownQuery(filters, available))
  const previous = useBreakdown(api, datasetId, previousQuery(filters, available))
  const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)
  const recommendationsPending = !recommendations.error && !envelopeSettled(recommendations.data)

  const monthly = filters.period === 'month'
  const periodLabel = monthly ? (filters.month ? monthLabel(filters.month) : '…') : 'whole dataset'
  const againstLabel = monthly && filters.month ? monthLabel(shiftMonth(filters.month, -1)) : null
  const kpis = dashboardKpis(selected.data?.totals, previous.data?.totals, againstLabel)
  const error = overview.error || selected.error

  return <div className="dashboard-page">
    <section className="kpi-panel" aria-label="Key performance indicators">
      <DashboardFilters filters={filters} setFilters={setFilters} months={months} options={overview.data?.options} />
      {error && !selected.data && <p className="dashboard-error" role="alert">Couldn't load the dashboard: {error.message} <button type="button" onClick={() => { overview.retry(); selected.retry() }}>Try again</button></p>}
      {showKpis && <div className="kpi-grid">{kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}</div>}
      <button type="button" className="collapse-button" onClick={() => setShowKpis(value => !value)} aria-expanded={showKpis}>
        {showKpis ? 'See less' : 'See metrics'} <Icon name={showKpis ? 'chevronUp' : 'chevronDown'} size={12} />
      </button>
    </section>

    <section className="analytics-grid" aria-label="Waste analytics">
      <WeekdayChart breakdown={selected.data} error={selected.error} periodLabel={periodLabel} />
      <SplitPanel breakdown={selected.data} error={selected.error} loading={selected.loading} />
    </section>

    <QuickWin envelope={recommendations.data} error={recommendations.error} pending={recommendationsPending} />
  </div>
}
