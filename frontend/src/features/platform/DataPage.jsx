import { useCallback } from 'react'
import { CalendarDays, FastForward, FileSpreadsheet, PlugZap, RotateCcw } from 'lucide-react'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import { CategoryTile } from '../../components/illustrations.jsx'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { Badge, PageHeader, SectionCard } from '../../components/ui.jsx'
import DataImport from './DataImport.jsx'
import { analysisProgress, componentRows, envelopeSettled, formatLongDate, formatNumber, formatPercent, formatRon } from './logic.js'
import { useInventory } from './useInventory.js'
import { allSettled } from './status.js'
import './platform.css'

const statusDone = record => allSettled(record?.components)
const STATE_TONES = { ready: 'success', running: 'info', queued: 'neutral', insufficient_data: 'warning', error: 'loss' }

/** `/business/data`: the connected inventory or uploaded file, every figure, and import. */
export default function DataPage({ api, dataset, onSelect, onConnect }) {
  return <div className="we-data">
    <PageHeader eyebrow="Business" title="Your data" description="Where your sales data comes from and everything WiseEat calculated from it." />
    {dataset ? <DatasetDetails key={dataset.dataset_id} api={api} dataset={dataset} onConnect={onConnect} /> : <LoadingState label="Syncing with your inventory…" />}
    <SectionCard id="we-replace-title" title="Upload a file instead">
      <p className="we-muted">Have sales from another system? A CSV upload replaces the connected inventory everywhere in WiseEat until you reconnect.</p>
      <DataImport api={api} onSelect={onSelect} />
    </SectionCard>
  </div>
}

function DatasetDetails({ api, dataset, onConnect }) {
  const status = useDatasetResource(api, dataset.dataset_id, '', statusDone)
  const summary = useDatasetResource(api, dataset.dataset_id, '/summary', envelopeSettled)
  const { retry: retryStatus } = status
  const { retry: retrySummary } = summary
  const reload = useCallback(() => { retryStatus(); retrySummary() }, [retryStatus, retrySummary])
  const inventory = useInventory(api, dataset, reload)
  const result = summary.data?.result
  const rows = componentRows(status.data?.components)
  const settled = allSettled(status.data?.components)
  const connected = dataset.source === 'inventory'
  const info = inventory.info
  const atLimit = info && info.history_days + 30 > info.max_days

  return <>
    <div className="we-data-grid">
      <SectionCard id="we-dataset-title" title={connected ? 'Connected inventory' : 'Uploaded file'} action={dataset.is_synthetic ? <Badge tone="warning">Simulated sales</Badge> : <Badge tone="success">Your CSV</Badge>}>
        <div className="we-dataset-id">
          <span className="we-category-tile" style={{ '--we-tile-size': '48px' }} aria-hidden="true">{connected ? <PlugZap /> : <FileSpreadsheet />}</span>
          <div>
            <strong>{connected ? `${info?.restaurant || 'Your restaurant'} · inventory system` : 'Sales CSV'}</strong>
            {result && <span><CalendarDays aria-hidden="true" />{formatLongDate(result.period.from)} – {formatLongDate(result.period.to)} · {result.period.calendar_days} days</span>}
          </div>
        </div>
        {connected ? <>
          <p className="we-muted">In this demo the inventory connection is simulated: a generated history up to yesterday{info?.simulated_days ? `, followed by ${info.simulated_days} simulated days` : ''}. Weekday habits, the season and busy or quiet days are built in.</p>
          <div className="we-data-actions">
            <button type="button" className="we-btn we-btn--primary" disabled={!settled || inventory.busy !== null || !info || atLimit} onClick={() => inventory.simulate(30)}>
              <FastForward aria-hidden="true" />{inventory.busy === 'simulate' ? 'Simulating…' : 'Simulate 30 days'}
            </button>
            <button type="button" className="we-btn we-btn--secondary" disabled={!settled || inventory.busy !== null || !info}
              onClick={() => window.confirm('Start over with a fresh 90-day history? Simulated days are discarded.') && inventory.reset()}>
              <RotateCcw aria-hidden="true" />{inventory.busy === 'reset' ? 'Resetting…' : 'Reset history'}
            </button>
          </div>
          {!settled && <p className="we-muted">Simulation is available once the analysis has finished.</p>}
          {atLimit && <p className="we-muted">A dataset holds one year at most. Reset the history to simulate again.</p>}
          {inventory.error && <ErrorState error={inventory.error} title="That did not work" />}
        </> : <>
          <p className="we-muted">This file stays as uploaded. Reconnect to go back to the inventory.</p>
          <div className="we-data-actions"><button type="button" className="we-btn we-btn--secondary" onClick={onConnect}><PlugZap aria-hidden="true" />Reconnect inventory</button></div>
        </>}
      </SectionCard>
      <SectionCard id="we-analysis-title" title="Analysis" action={rows.length > 0 && <span className="we-muted">{Math.round(analysisProgress(status.data?.components) * 100)}% done</span>}>
        {status.error ? <ErrorState error={status.error} onRetry={status.retry} />
          : rows.length === 0 ? <LoadingState label="Checking analysis…" />
            : <>
              <span className="we-progress" aria-hidden="true"><span style={{ width: `${analysisProgress(status.data.components) * 100}%` }} /></span>
              <ul className="we-analysis-list">{rows.map(row => <li key={row.name}><span>{row.label}</span><Badge tone={STATE_TONES[row.state] || 'neutral'}>{row.stateLabel}</Badge></li>)}</ul>
              {!allSettled(status.data.components) && <p role="status" className="we-muted">Analysis is running. This page updates by itself.</p>}
            </>}
      </SectionCard>
    </div>

    {summary.error ? <ErrorState error={summary.error} onRetry={summary.retry} />
      : !result ? <LoadingState label="Loading figures…" />
        : <>
          <SectionCard id="we-totals-title" title="Totals for the period">
            <dl className="we-totals">
              <div><dt>Prepared</dt><dd>{formatNumber(result.prepared_portions)}<small> portions</small></dd></div>
              <div><dt>Sold</dt><dd>{formatNumber(result.sold_portions)}<small> portions</small></dd></div>
              <div><dt>Unsold</dt><dd>{formatNumber(result.unsold_portions)}<small> portions</small></dd></div>
              <div><dt>Unsold rate</dt><dd>{formatPercent(result.unsold_rate)}</dd></div>
              <div><dt>Unsold cost, whole period</dt><dd>{formatRon(result.unsold_cost_ron)}</dd></div>
              <div><dt>Unsold cost, monthly equivalent</dt><dd>{formatRon(result.monthly_equivalent_unsold_cost_ron)}</dd></div>
            </dl>
            {summary.data.limitations?.length > 0 && <ul className="we-limitations">{summary.data.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
          </SectionCard>

          <div className="we-data-grid">
            <SectionCard id="we-top-title" title="Top dishes by unsold cost">
              <div className="we-table-wrap">
                <table className="we-table">
                  <thead><tr><th scope="col">Dish</th><th scope="col" className="is-num">Unsold</th><th scope="col" className="is-num">Cost</th></tr></thead>
                  <tbody>{result.top_dishes.map(dish => <tr key={dish.dish_id}>
                    <th scope="row"><span className="we-table-dish"><CategoryTile category={dish.category} size={32} />{dish.dish_name}</span></th>
                    <td className="is-num">{formatNumber(dish.unsold_portions)}</td>
                    <td className="is-num">{formatRon(dish.unsold_cost_ron)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard id="we-dishes-title" title={`All dishes (${result.dishes.length})`}>
              <ul className="we-dish-chips">{result.dishes.map(dish => <li key={dish.dish_id}>
                <CategoryTile category={dish.category} size={28} />
                <span><strong>{dish.dish_name}</strong><small>{dish.category.replace('_', ' ')} · {dish.time_slots.join(', ')}</small></span>
              </li>)}</ul>
            </SectionCard>
          </div>
        </>}
  </>
}
