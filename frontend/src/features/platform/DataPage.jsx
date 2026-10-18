import { CalendarDays, Database, FileSpreadsheet } from 'lucide-react'
import { useDatasetResource } from '../../api/useDatasetResource.js'
import { CategoryTile } from '../../components/illustrations.jsx'
import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import { Badge, PageHeader, SectionCard } from '../../components/ui.jsx'
import DataImport from './DataImport.jsx'
import { analysisProgress, componentRows, envelopeSettled, formatLongDate, formatNumber, formatPercent, formatRon } from './logic.js'
import { allSettled } from './status.js'
import './platform.css'

const statusDone = record => allSettled(record?.components)
const STATE_TONES = { ready: 'success', running: 'info', queued: 'neutral', insufficient_data: 'warning', error: 'loss' }

/** `/business/data`: the selected dataset, every figure, and import. */
export default function DataPage({ api, dataset, onSelect }) {
  return <div className="we-data">
    <PageHeader eyebrow="Business" title="Your data" description="The sales file behind your dashboard, everything calculated from it, and where to replace it." />
    {dataset ? <DatasetDetails api={api} dataset={dataset} />
      : <EmptyState icon={Database} title="No dataset yet" description="Upload your sales CSV or load the demo restaurant below." />}
    <SectionCard id="we-replace-title" title={dataset ? 'Replace data' : 'Add data'}>
      <p className="we-muted">Uploading a new file or the demo replaces the current dataset everywhere in WiseEat.</p>
      <DataImport api={api} onSelect={onSelect} demoLabel="Load demo data" />
    </SectionCard>
  </div>
}

function DatasetDetails({ api, dataset }) {
  const status = useDatasetResource(api, dataset.dataset_id, '', statusDone)
  const summary = useDatasetResource(api, dataset.dataset_id, '/summary', envelopeSettled)
  const result = summary.data?.result
  const rows = componentRows(status.data?.components)

  return <>
    <div className="we-data-grid">
      <SectionCard id="we-dataset-title" title="Current dataset" action={dataset.is_synthetic ? <Badge tone="warning">Simulated sales</Badge> : <Badge tone="success">Your CSV</Badge>}>
        <div className="we-dataset-id">
          <span className="we-category-tile" style={{ '--we-tile-size': '48px' }} aria-hidden="true"><FileSpreadsheet /></span>
          <div>
            <strong>{dataset.is_synthetic ? 'Demo restaurant, 180 days' : 'Uploaded sales CSV'}</strong>
            {result && <span><CalendarDays aria-hidden="true" />{formatLongDate(result.period.from)} – {formatLongDate(result.period.to)} · {result.period.calendar_days} days</span>}
          </div>
        </div>
        {dataset.is_synthetic && <p className="we-muted">Weather and calendar dates are real; the sales and their effects are simulated.</p>}
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
