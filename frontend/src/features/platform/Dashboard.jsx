import { useState } from 'react'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Lightbulb, Tag, UtensilsCrossed, Wallet } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import { CategoryTile } from '../../components/illustrations.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { TopbarPortal } from '../../shell/Topbar.jsx'
import { bestQuickWin, envelopeSettled, firstSimulatedDate, formatLongDate, formatNumber, formatPercent, formatRon, formatShortDate, splitItems } from './logic.js'
import { canShift, clampRange, comparisonName, PERIOD_TYPES, periodLabel, periodRange, periodStart, perDayChange, shiftPeriod } from './periods.js'
import { useBreakdown } from './useBreakdown.js'
import { useInventory } from './useInventory.js'
import './platform.css'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const SERVICE_LABELS = { lunch: 'Lunch', dinner: 'Dinner' }
const SPLIT_COLORS = ['#1c4b3e', '#91c24c', '#5c9a2e', '#2a6352', '#c9d6cd', '#f5a524', '#b93a12']
const AXIS = { tickLine: false, axisLine: false, tick: { fill: '#55665f', fontSize: 12 } }
const TOOLTIP = { contentStyle: { borderRadius: 4, border: '1px solid #e4ebe5', fontFamily: 'inherit', fontSize: 13 } }

/**
 * Business dashboard at `/business`. The shell selects the connected
 * inventory automatically; until then this shows the sync state. Title and
 * filters render in the shell's top bar; filters live in the URL.
 */
export default function Dashboard({ api, dataset, connectError, onConnect }) {
  if (!dataset) {
    return <>
      <TopbarPortal><h1>Dashboard</h1></TopbarPortal>
      {connectError ? <ErrorState error={connectError} title="Could not reach your inventory" onRetry={onConnect} /> : <LoadingState label="Syncing with your inventory…" />}
    </>
  }
  return <Overview key={dataset.dataset_id} api={api} dataset={dataset} />
}

function useFilters(available) {
  const [params, setParams] = useSearchParams()
  const type = PERIOD_TYPES[params.get('period')] ? params.get('period') : 'month'
  const fallback = available ? periodStart(type, available.to) : null
  const requested = params.get('date')
  const anchor = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? periodStart(type, requested) : fallback
  const filters = {
    type,
    anchor,
    compare: params.get('compare') === 'none' ? 'none' : 'previous',
  }
  const update = changes => setParams(current => {
    const next = new URLSearchParams(current)
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    return next
  }, { replace: true })
  return [filters, update]
}

function Overview({ api, dataset }) {
  const datasetId = dataset.dataset_id
  const base = useBreakdown(api, datasetId, {})
  const available = base.data?.available
  const [filters, update] = useFilters(available)
  const range = available && filters.anchor ? clampRange(periodRange(filters.type, filters.anchor), available) : null
  const previous = range && filters.compare === 'previous' ? clampRange(periodRange(filters.type, shiftPeriod(filters.type, filters.anchor, -1)), available) : null
  const current = useBreakdown(api, datasetId, range)
  const comparison = useBreakdown(api, datasetId, previous)
  const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)
  const inventory = useInventory(api, dataset)

  const title = <TopbarPortal>
    <h1>Dashboard</h1>
    {available && filters.anchor && <Filters filters={filters} update={update} available={available} />}
  </TopbarPortal>

  if (base.error) return <>{title}<ErrorState error={base.error} title="Could not load your dashboard" onRetry={base.retry} /></>
  if (current.error && !current.data) return <>{title}<ErrorState error={current.error} title="Could not load this period" onRetry={current.retry} /></>
  if (!base.data || !current.data) return <>{title}<LoadingState label="Syncing with your inventory…" /></>

  const data = current.data
  const totals = data.totals
  const compareTo = previous && comparison.data ? comparison.data.totals : null
  const versus = previous ? `vs ${comparisonName(filters.type, filters.anchor)}` : null
  const simulatedFrom = firstSimulatedDate(inventory.info)
  const includesSimulated = simulatedFrom && range && range.to >= simulatedFrom

  return <div className={`we-dash${current.loading ? ' is-loading' : ''}`} aria-busy={current.loading}>
    {title}
    <div className="we-dash-status">
      {dataset.source === 'inventory'
        ? <span><span className="we-sync-dot" aria-hidden="true" />Inventory connected · data through {formatLongDate(available.to)}</span>
        : <span>Uploaded file · {formatLongDate(available.from)} – {formatLongDate(available.to)}</span>}
      <span className="we-dash-status-badges">
        {includesSimulated && <span className="we-badge">Includes simulated days</span>}
        {dataset.is_synthetic && <span className="we-badge we-badge--warning">Simulated sales</span>}
      </span>
    </div>

    <LatestBatches batches={data.latest_batches} />

    <KeyFigures totals={totals} compareTo={compareTo} versus={versus} />

    <div className="we-dash-grid">
      <WeekdayPanel byWeekday={data.by_weekday} />
      <SplitPanel breakdown={data} />
    </div>

    <TrendPanel current={data.daily} comparison={compareTo ? comparison.data.daily : null} versus={versus} />

    <div className="we-dash-grid we-dash-grid--bottom">
      <TopDishes dishes={data.top_dishes} />
      <div className="we-dash-side">
        <QuickWin envelope={recommendations.data} error={recommendations.error} />
        <section className="we-panel we-deal-cta" aria-labelledby="we-deal-title">
          <div>
            <h2 id="we-deal-title">Sell today's leftovers</h2>
            <p>Offer unsold portions at a discount to people nearby.</p>
          </div>
          <Link to="/business/deals" className="we-btn we-btn--primary"><Tag aria-hidden="true" />Post a deal</Link>
        </section>
      </div>
    </div>
    <p className="we-dash-footnote">Unsold portions are valued at production cost. They do not prove the food was thrown away.</p>
  </div>
}

function Filters({ filters, update, available }) {
  const move = delta => update({ date: shiftPeriod(filters.type, filters.anchor, delta) })
  return <div className="we-filters" role="group" aria-label="Dashboard filters">
    <label className="we-filter">
      <span>Period</span>
      <select value={filters.type} onChange={event => update({ period: event.target.value, date: periodStart(event.target.value, filters.anchor) })}>
        {Object.entries(PERIOD_TYPES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
    <div className="we-filter">
      <span id="we-filter-date">Date</span>
      <div className="we-date-nav" role="group" aria-labelledby="we-filter-date">
        <button type="button" onClick={() => move(-1)} disabled={!canShift(filters.type, filters.anchor, -1, available)} aria-label="Previous period"><ChevronLeft aria-hidden="true" /></button>
        <strong aria-live="polite">{periodLabel(filters.type, filters.anchor)}</strong>
        <button type="button" onClick={() => move(1)} disabled={!canShift(filters.type, filters.anchor, 1, available)} aria-label="Next period"><ChevronRight aria-hidden="true" /></button>
      </div>
    </div>
    <label className="we-filter">
      <span>Compare to</span>
      <select value={filters.compare} onChange={event => update({ compare: event.target.value === 'none' ? 'none' : '' })}>
        <option value="previous">Previous {PERIOD_TYPES[filters.type].toLowerCase()}</option>
        <option value="none">No comparison</option>
      </select>
    </label>
  </div>
}

function LatestBatches({ batches }) {
  if (!batches.length) return null
  return <section className="we-panel we-batches" aria-labelledby="we-batches-title">
    <div className="we-panel-head">
      <h2 id="we-batches-title">Latest unsold batches</h2>
      <span className="we-muted">{formatLongDate(batches[0].date)}</span>
    </div>
    <ul>{batches.map(batch => <li key={`${batch.dish_id}-${batch.time_slot}`}>
      <CategoryTile category={batch.category} size={36} />
      <div>
        <strong>{batch.dish_name}</strong>
        <span>{SERVICE_LABELS[batch.time_slot]} · {formatNumber(batch.unsold_portions)} portions</span>
      </div>
      <b>{formatRon(batch.unsold_cost_ron)}</b>
    </li>)}</ul>
  </section>
}

function Change({ value, versus }) {
  if (value == null || !versus) return null
  const down = value <= 0
  return <span className={`we-change ${down ? 'is-good' : 'is-bad'}`}>{down ? '▼' : '▲'} {formatPercent(Math.abs(value))} per day {versus}</span>
}

function KeyFigures({ totals, compareTo, versus }) {
  const [more, setMore] = useState(false)
  const perDay = totals.days_with_data ? totals.unsold_cost_ron / totals.days_with_data : null
  return <section className="we-panel we-figures" aria-label="Key figures for the selected period">
    <div className="we-figures-row">
      <Figure icon={Wallet} tone="loss" title="Unsold cost" value={formatRon(totals.unsold_cost_ron)} change={<Change value={perDayChange(totals, compareTo, 'unsold_cost_ron')} versus={compareTo && versus} />} />
      <Figure icon={UtensilsCrossed} tone="info" title="Unsold portions" value={formatNumber(totals.unsold_portions)} change={<Change value={perDayChange(totals, compareTo, 'unsold_portions')} versus={compareTo && versus} />} />
    </div>
    {more && <dl className="we-figures-more" id="we-figures-more">
      <div><dt>Unsold rate</dt><dd>{formatPercent(totals.unsold_rate)}</dd></div>
      <div><dt>Loss per day</dt><dd>{formatRon(perDay)}</dd></div>
      <div><dt>Prepared</dt><dd>{formatNumber(totals.prepared_portions)} portions</dd></div>
      <div><dt>Sold</dt><dd>{formatNumber(totals.sold_portions)} portions</dd></div>
    </dl>}
    <button type="button" className="we-figures-toggle" aria-expanded={more} aria-controls="we-figures-more" onClick={() => setMore(value => !value)}>
      {more ? <>See less<ChevronUp aria-hidden="true" /></> : <>See more<ChevronDown aria-hidden="true" /></>}
    </button>
  </section>
}

function Figure({ icon: Icon, tone, title, value, change }) {
  return <div className="we-figure">
    <span className={`we-stat-icon we-stat-icon--${tone}`} aria-hidden="true"><Icon /></span>
    <div className="we-figure-text"><strong>{title}</strong><span>Over the selected period</span></div>
    <div className="we-figure-value"><b>{value}</b>{change}</div>
  </div>
}

function MetricToggle({ value, onChange }) {
  return <div className="we-toggle" role="group" aria-label="Show values in">
    {[['portions', 'Portions'], ['ron', 'RON']].map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function WeekdayPanel({ byWeekday }) {
  const [metric, setMetric] = useState('portions')
  const field = metric === 'ron' ? 'unsold_cost_ron_per_day' : 'unsold_portions_per_day'
  const data = byWeekday.map(item => ({ day: item.weekday.slice(0, 3), value: item[field] == null ? 0 : Math.round(item[field] * 10) / 10, days: item.days }))
  const format = value => (metric === 'ron' ? formatRon(value) : `${formatNumber(value)} portions`)
  return <section className="we-panel we-chart-panel" aria-labelledby="we-weekday-title">
    <div className="we-panel-head"><h2 id="we-weekday-title">Average unsold per day</h2><MetricToggle value={metric} onChange={setMetric} /></div>
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="#e4ebe5" />
        <XAxis dataKey="day" {...AXIS} />
        <YAxis {...AXIS} width={52} />
        <Tooltip {...TOOLTIP} cursor={{ fill: '#f2f6f1' }} formatter={(value, _name, item) => [format(value), `${item.payload.days} days`]} />
        <Bar dataKey="value" fill="#1c4b3e" radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={!reducedMotion()} />
      </BarChart>
    </ResponsiveContainer>
    <p className="we-visually-hidden">{data.map(item => `${item.day}: ${format(item.value)}`).join('; ')}.</p>
  </section>
}

/** "Lunch vs dinner" donut of unsold cost, switchable to categories (docs/handoff/DASHBOARD_SPLIT_AND_QUICKWIN.md). */
function SplitPanel({ breakdown }) {
  const [view, setView] = useState('service')
  const showCategory = view === 'category'
  const { items, total } = splitItems(breakdown, view)
  return <section className="we-panel we-chart-panel" aria-labelledby="we-split-title">
    <div className="we-panel-head">
      <h2 id="we-split-title">{showCategory ? 'Unsold cost by category' : 'Lunch vs dinner'}</h2>
      <div className="we-toggle" role="group" aria-label="Split by">
        <button type="button" aria-pressed={!showCategory} onClick={() => setView('service')}>Service</button>
        <button type="button" aria-pressed={showCategory} onClick={() => setView('category')}>Category</button>
      </div>
    </div>
    {total === 0 ? <p className="we-muted">No unsold food for this selection.</p> : <div className="we-split">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1} stroke="none" isAnimationActive={!reducedMotion()}>
            {items.map((item, index) => <Cell key={item.key} fill={SPLIT_COLORS[index % SPLIT_COLORS.length]} />)}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={value => formatRon(value)} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="we-legend">{items.map((item, index) => <li key={item.key}>
        <span className="we-legend-swatch" style={{ background: SPLIT_COLORS[index % SPLIT_COLORS.length] }} aria-hidden="true" />
        <span>{item.name}</span><b>{formatPercent(item.share)}</b><span className="we-muted">{formatRon(item.value)}</span>
      </li>)}</ul>
    </div>}
  </section>
}

function TrendPanel({ current, comparison, versus }) {
  if (current.length < 2) return null
  const data = current.map((day, index) => ({ date: day.date, current: day.unsold_cost_ron, previous: comparison?.[index]?.unsold_cost_ron ?? null }))
  return <section className="we-panel we-chart-panel" aria-labelledby="we-trend-title">
    <div className="we-panel-head">
      <h2 id="we-trend-title">Unsold cost per day</h2>
      <ul className="we-legend we-legend--inline">
        <li><span className="we-legend-line" aria-hidden="true" />This period</li>
        {comparison && <li><span className="we-legend-line is-dashed" aria-hidden="true" />{versus.replace('vs ', '')}</li>}
      </ul>
    </div>
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="#e4ebe5" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} {...AXIS} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...AXIS} width={52} />
        <Tooltip {...TOOLTIP} labelFormatter={date => formatLongDate(date)} formatter={(value, name) => [formatRon(value), name === 'current' ? 'This period' : 'Same day, previous period']} />
        {comparison && <Line type="monotone" dataKey="previous" stroke="#9fb3a9" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="current" stroke="#1c4b3e" strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion()} />
      </LineChart>
    </ResponsiveContainer>
  </section>
}

function TopDishes({ dishes }) {
  const top = dishes[0]?.unsold_cost_ron || 0
  return <section className="we-panel" aria-labelledby="we-dishes-title">
    <div className="we-panel-head"><h2 id="we-dishes-title">Dishes losing the most</h2><Link className="we-link" to="/business/data">All data<ArrowRight aria-hidden="true" /></Link></div>
    {dishes.length === 0 ? <p className="we-muted">No unsold food for this selection.</p>
      : <ol className="we-dish-list">{dishes.map(dish => <li key={dish.dish_id}>
        <CategoryTile category={dish.category} size={32} />
        <div><strong>{dish.dish_name}</strong><span className="we-money-bar" aria-hidden="true"><span style={{ width: `${top ? Math.max(4, (dish.unsold_cost_ron / top) * 100) : 0}%` }} /></span></div>
        <b>{formatRon(dish.unsold_cost_ron)}</b>
      </li>)}</ol>}
  </section>
}

/** Largest single recommendation opportunity (docs/handoff/DASHBOARD_SPLIT_AND_QUICKWIN.md). */
function QuickWin({ envelope, error }) {
  const win = bestQuickWin(envelope)
  const pending = !error && !envelopeSettled(envelope)
  return <section className="we-panel we-quickwin" aria-labelledby="we-win-title">
    <div className="we-panel-head"><h2 id="we-win-title">Quick win</h2><Link className="we-link" to="/business/actions">All actions<ArrowRight aria-hidden="true" /></Link></div>
    {pending ? <LoadingState label="Looking for ways to save…" />
      : win ? <div className="we-quickwin-body">
        <span className="we-quickwin-icon" aria-hidden="true"><Lightbulb /></span>
        <div>
          <strong>{win.title}</strong>
          <span>≈ <b>{formatRon(win.opportunity_ron_per_30_days)}</b> per 30 days · indicative, not guaranteed</span>
        </div>
      </div> : <p className="we-muted">No clear quick win in this data yet.</p>}
  </section>
}
