import { ArrowRight, Lightbulb, Percent, Tag, UtensilsCrossed, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import { CategoryTile, ProduceCrate } from '../../components/illustrations.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { SectionCard, StatCard } from '../../components/ui.jsx'
import { bestQuickWin, envelopeSettled, firstSimulatedDate, formatLongDate, formatNumber, formatPercent, formatRon, formatShortDate, fullWeeks, lossFigures, moneyByDish, recentChange, weekStart, weeklyTotals } from './logic.js'
import { useInventory } from './useInventory.js'
import './platform.css'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Business dashboard at `/business`. The demo assumes WiseEat is connected to
 * the restaurant's inventory, so the shell selects a dataset automatically;
 * until then this shows the sync state. Full figures live on `/business/data`.
 */
export default function Dashboard({ api, dataset, connectError, onConnect }) {
  if (!dataset) {
    return connectError
      ? <ErrorState error={connectError} title="Could not reach your inventory" onRetry={onConnect} />
      : <LoadingState label="Syncing with your inventory…" />
  }
  return <Overview key={dataset.dataset_id} api={api} dataset={dataset} />
}

function Overview({ api, dataset }) {
  const datasetId = dataset.dataset_id
  const summary = useDatasetResource(api, datasetId, '/summary', envelopeSettled)
  const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)
  // Simulate and reset live on the Data page; here the info only shades simulated weeks.
  const inventory = useInventory(api, dataset)

  if (summary.error) return <ErrorState error={summary.error} title="Could not load your dashboard" onRetry={summary.retry} />
  const result = summary.data?.result
  if (!result) return <LoadingState label="Syncing with your inventory…" />

  const loss = lossFigures(result)
  const change = recentChange(result.daily)

  return <div className="we-dash">
    <header className="we-dash-head">
      <h1>Dashboard</h1>
      {dataset.source === 'inventory'
        ? <span className="we-sync-pill"><span className="we-sync-dot" aria-hidden="true" />Inventory connected · data through {formatLongDate(result.period.to)}</span>
        : <span className="we-sync-pill is-file">Uploaded file · {formatLongDate(result.period.from)} – {formatLongDate(result.period.to)}</span>}
    </header>

    <div className="we-dash-stats">
      <StatCard icon={Wallet} tone="loss" label="Lost each month" value={formatNumber(loss.monthly)} unit="RON" hint={`≈ ${formatRon(loss.yearly)} a year`} />
      <StatCard icon={Percent} tone="warning" label="Unsold rate" value={formatPercent(loss.rate)} hint="of all portions prepared" />
      <StatCard icon={UtensilsCrossed} tone="info" label="Unsold portions" value={formatNumber(loss.unsoldPerDay)} unit="/ day"
        hint={change?.change != null ? <ChangeHint change={change.change} /> : `average over ${loss.days} days`} />
    </div>
    <p className="we-dash-footnote">Unsold portions are valued at production cost. They do not prove the food was thrown away.</p>

    <div className="we-dash-row we-dash-row--trend">
      <SectionCard id="we-trend-title" title="Waste trend" action={<span className="we-badge">Unsold portions per week</span>}>
        <WasteTrend daily={result.daily} simulatedFrom={firstSimulatedDate(inventory.info)} />
      </SectionCard>
      <section className="we-promo" aria-labelledby="we-promo-title">
        <ProduceCrate className="we-promo-art" />
        <h2 id="we-promo-title">Good food shouldn't go to waste</h2>
        <p>Sell today's leftovers at a discount to people nearby and win back part of the loss.</p>
        <Link to="/business/deals" className="we-btn we-btn--primary"><Tag aria-hidden="true" />Post a deal</Link>
      </section>
    </div>

    <div className="we-dash-row we-dash-row--money">
      <SectionCard id="we-money-title" title="Where the money goes" action={<Link className="we-link" to="/business/data">All data<ArrowRight aria-hidden="true" /></Link>}>
        <ul className="we-money-list">
          {moneyByDish(result).map(dish => <li key={dish.dish_id}>
            <CategoryTile category={dish.category} />
            <div className="we-money-dish">
              <strong>{dish.dish_name}</strong>
              <span className="we-money-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, dish.share * 100)}%` }} /></span>
            </div>
            <div className="we-money-value"><strong>{formatRon(dish.unsold_cost_ron)}</strong><span>{formatPercent(dish.share)} of the loss</span></div>
          </li>)}
        </ul>
      </SectionCard>
      <QuickWin envelope={recommendations.data} error={recommendations.error} />
    </div>
  </div>
}

function ChangeHint({ change }) {
  const down = change <= 0
  return <span className={down ? 'we-change is-good' : 'we-change is-bad'}>
    {down ? '▼' : '▲'} {formatPercent(Math.abs(change))} vs previous 30 days
  </span>
}

function WasteTrend({ daily, simulatedFrom }) {
  // Partial first/last weeks would look like sudden drops, so only full weeks are drawn.
  const weeks = fullWeeks(weeklyTotals(daily))
  if (weeks.length < 2) return <p className="we-muted">The trend appears once your data covers at least two full weeks.</p>
  const average = weeks.reduce((sum, week) => sum + week.unsold, 0) / weeks.length
  const peak = weeks.reduce((best, week) => (week.unsold > best.unsold ? week : best))
  const simulatedWeek = simulatedFrom && weeks.find(week => week.week >= weekStart(simulatedFrom))?.week
  return <div className="we-trend">
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="we-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#287a54" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#287a54" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e4ebe5" />
        {simulatedWeek && <ReferenceArea x1={simulatedWeek} x2={weeks.at(-1).week} fill="#91c24c" fillOpacity={0.12} stroke="none"
          label={{ value: 'Simulated', position: 'insideTopRight', fill: '#3f7d1f', fontSize: 12, fontWeight: 700 }} />}
        <XAxis dataKey="week" tickFormatter={formatShortDate} tickLine={false} axisLine={false} tick={{ fill: '#55665f', fontSize: 12 }} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: '#55665f', fontSize: 12 }} width={48} />
        <Tooltip formatter={value => [`${formatNumber(value)} portions`, 'Unsold']} labelFormatter={week => `Week of ${formatShortDate(week)}`} contentStyle={{ borderRadius: 12, border: '1px solid #e4ebe5', fontFamily: 'inherit' }} />
        <Area type="monotone" dataKey="unsold" stroke="#165037" strokeWidth={2.5} fill="url(#we-trend-fill)" isAnimationActive={!reducedMotion()} />
      </AreaChart>
    </ResponsiveContainer>
    <p className="we-trend-caption">About <strong>{formatNumber(average)}</strong> unsold portions a week over {weeks.length} full weeks. Worst week: <strong>{peak.label}</strong> with {formatNumber(peak.unsold)}.{simulatedWeek && ' The shaded weeks are simulated.'}</p>
  </div>
}

function QuickWin({ envelope, error }) {
  const win = bestQuickWin(envelope)
  const pending = !error && !envelopeSettled(envelope)
  return <SectionCard id="we-win-title" title="Your quick win" className="we-quickwin" action={<Link className="we-link" to="/business/actions">All actions<ArrowRight aria-hidden="true" /></Link>}>
    {pending ? <LoadingState label="Looking for ways to save…" />
      : win ? <>
        <span className="we-quickwin-icon" aria-hidden="true"><Lightbulb /></span>
        <h3>{win.title}</h3>
        <p className="we-quickwin-value"><strong>≈ {formatRon(win.opportunity_ron_per_30_days)}</strong> per 30 days</p>
        <p className="we-quickwin-note">Indicative opportunity from your own sales, not a guaranteed saving.</p>
        <Link to="/business/actions/simulator" className="we-btn we-btn--secondary we-quickwin-cta">Plan it in the simulator</Link>
      </> : <p className="we-quickwin-note">No clear quick win in this data yet. Insights show where surplus repeats.</p>}
  </SectionCard>
}
