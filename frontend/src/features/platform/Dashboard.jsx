import { ArrowRight, ChartLine, HandCoins, Lightbulb, Percent, Tag, UtensilsCrossed, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import { LeafSprig, ProduceCrate, CategoryTile } from '../../components/illustrations.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { SectionCard, StatCard } from '../../components/ui.jsx'
import { ROLES } from '../../shell/navigation.js'
import DataImport from './DataImport.jsx'
import { analysisProgress, bestQuickWin, envelopeSettled, formatNumber, formatPercent, formatRon, fullWeeks, lossFigures, moneyByDish, weeklyTotals } from './logic.js'
import { allSettled } from './status.js'
import './platform.css'

const statusDone = record => allSettled(record?.components)
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Business dashboard at `/business`: onboarding until a dataset is selected,
 * then a short, loss-focused overview. Full figures live on `/business/data`.
 */
export default function Dashboard({ api, dataset, onSelect }) {
  if (!dataset) return <Onboarding api={api} onSelect={onSelect} />
  return <Overview api={api} datasetId={dataset.dataset_id} />
}

function Onboarding({ api, onSelect }) {
  return <div className="we-dash">
    <section className="we-hero" aria-labelledby="we-onboarding-title">
      <div className="we-hero-text">
        <span className="we-hero-eyebrow">Welcome to WiseEat</span>
        <h1 id="we-onboarding-title">See what unsold food is costing you</h1>
        <p>Add your sales data and get your losses in seconds. Then sell today's leftovers at a discount instead of losing them.</p>
        <ol className="we-hero-steps">
          <li><span>1</span>Add sales data</li>
          <li><span>2</span>See your losses</li>
          <li><span>3</span>Sell leftovers</li>
        </ol>
      </div>
      <ProduceCrate className="we-hero-art" />
    </section>
    <section className="we-card we-onboarding-import" aria-labelledby="we-import-title">
      <div>
        <h2 id="we-import-title">Add your sales data</h2>
        <p>A CSV with dates, dishes, prepared and sold portions, and cost per portion. No data at hand? Try the demo restaurant.</p>
      </div>
      <DataImport api={api} onSelect={onSelect} />
    </section>
  </div>
}

function Overview({ api, datasetId }) {
  const status = useDatasetResource(api, datasetId, '', statusDone)
  const summary = useDatasetResource(api, datasetId, '/summary', envelopeSettled)
  const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)

  if (summary.error) return <ErrorState error={summary.error} title="Could not load your dashboard" onRetry={summary.retry} />
  const result = summary.data?.result
  if (!result) return <LoadingState label="Preparing your dashboard…" />

  const loss = lossFigures(result)
  const components = status.data?.components
  const settled = allSettled(components)

  return <div className="we-dash">
    <header className="we-dash-head">
      <div>
        <h1>Welcome back, {ROLES.business.user.name}!</h1>
        <p>Here's what unsold food is costing your kitchen.</p>
      </div>
      {components && (settled
        ? <span className="we-badge we-badge--success">Analysis ready</span>
        : <span className="we-analysing" role="status"><span className="we-spinner" aria-hidden="true" />Analysing your data · {Math.round(analysisProgress(components) * 100)}%</span>)}
    </header>

    <div className="we-dash-stats">
      <StatCard icon={Wallet} tone="loss" label="Lost each month" value={formatNumber(loss.monthly)} unit="RON" hint={`≈ ${formatRon(loss.yearly)} a year`} />
      <StatCard icon={Percent} tone="warning" label="Unsold rate" value={formatPercent(loss.rate)} hint="of all portions prepared" />
      <StatCard icon={UtensilsCrossed} tone="info" label="Unsold portions" value={formatNumber(loss.unsoldPerDay)} unit="/ day" hint={`average over ${loss.days} days`} />
      <StatCard icon={HandCoins} label="Recovered with deals" value="0" unit="RON" hint="Post a deal to win some back" />
    </div>
    <p className="we-dash-footnote">Unsold portions are valued at production cost. They do not prove the food was thrown away.</p>

    <div className="we-dash-row we-dash-row--trend">
      <SectionCard id="we-trend-title" title="Waste trend" action={<span className="we-badge">Unsold portions per week</span>}>
        <WasteTrend daily={result.daily} />
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

    <section className="we-banner" aria-labelledby="we-banner-title">
      <LeafSprig className="we-banner-art" />
      <div>
        <h2 id="we-banner-title">Every portion you sell is money back</h2>
        <p>Cutting unsold food by a quarter would keep about <strong>{formatRon(loss.monthly / 4)}</strong> a month in your pocket.</p>
      </div>
      <Link to="/business/insights" className="we-btn we-btn--secondary"><ChartLine aria-hidden="true" />See why it happens</Link>
    </section>
  </div>
}

function WasteTrend({ daily }) {
  // Partial first/last weeks would look like sudden drops, so only full weeks are drawn.
  const weeks = fullWeeks(weeklyTotals(daily))
  if (weeks.length < 2) return <p className="we-muted">The trend appears once your data covers at least two full weeks.</p>
  const average = weeks.reduce((sum, week) => sum + week.unsold, 0) / weeks.length
  const peak = weeks.reduce((best, week) => (week.unsold > best.unsold ? week : best))
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
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#55665f', fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: '#55665f', fontSize: 12 }} width={48} />
        <Tooltip formatter={value => [`${formatNumber(value)} portions`, 'Unsold']} labelFormatter={label => `Week of ${label}`} contentStyle={{ borderRadius: 12, border: '1px solid #e4ebe5', fontFamily: 'inherit' }} />
        <Area type="monotone" dataKey="unsold" stroke="#165037" strokeWidth={2.5} fill="url(#we-trend-fill)" isAnimationActive={!reducedMotion()} />
      </AreaChart>
    </ResponsiveContainer>
    <p className="we-trend-caption">About <strong>{formatNumber(average)}</strong> unsold portions a week over {weeks.length} full weeks. Worst week: <strong>{peak.label}</strong> with {formatNumber(peak.unsold)}.</p>
  </div>
}

function QuickWin({ envelope, error }) {
  const win = bestQuickWin(envelope)
  const pending = !error && !envelopeSettled(envelope)
  return <SectionCard id="we-win-title" title="Your quick win" className="we-quickwin" action={<Link className="we-link" to="/business/actions">All actions<ArrowRight aria-hidden="true" /></Link>}>
    {win ? <>
      <span className="we-quickwin-icon" aria-hidden="true"><Lightbulb /></span>
      <h3>{win.title}</h3>
      <p className="we-quickwin-value"><strong>≈ {formatRon(win.opportunity_ron_per_30_days)}</strong> per 30 days</p>
      <p className="we-quickwin-note">Indicative opportunity from your own sales, not a guaranteed saving.</p>
      <Link to="/business/actions/simulator" className="we-btn we-btn--secondary we-quickwin-cta">Plan it in the simulator</Link>
    </> : pending ? <LoadingState label="Looking for ways to save…" />
      : <p className="we-quickwin-note">No clear quick win in this data yet. Insights show where surplus repeats.</p>}
  </SectionCard>
}
