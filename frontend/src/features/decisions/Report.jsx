import { ErrorState, LoadingState } from '../../components/States.jsx'
import { reportSections } from './logic.js'
import { useComponent } from './useComponent.js'

const STATE_TEXT = {
  pending: 'Still being calculated.',
  insufficient_data: 'Not enough data for this part.',
  unavailable: 'Not available for this dataset.',
  error: 'This part could not be calculated.',
}

export default function Report({ api, datasetId, isSynthetic }) {
  const summary = useComponent(api, datasetId, 'summary')
  const patterns = useComponent(api, datasetId, 'patterns')
  const model = useComponent(api, datasetId, 'model')
  const recommendations = useComponent(api, datasetId, 'recommendations')

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.retry} />
  if (!summary.envelope) return <LoadingState label="Preparing the report…" />

  const report = reportSections({
    summary: summary.envelope,
    patterns: patterns.envelope,
    model: model.envelope,
    recommendations: recommendations.envelope,
  })
  const period = report.period
  return <article className="decisions-report" aria-labelledby="report-title">
    <header className="decisions-report-head">
      <div>
        <h1 id="report-title">WasteDNA report</h1>
        {period && <p>{period.from} to {period.to} · {period.calendar_days} calendar days</p>}
        {isSynthetic && <p className="decisions-badge">Simulated sales: demo data, not real records</p>}
      </div>
      <button type="button" className="decisions-noprint" onClick={() => window.print()}>Print report</button>
    </header>

    <section>
      <h2>Summary</h2>
      <dl className="decisions-kpis">{report.kpis.map(kpi => <div key={kpi.label}><dt>{kpi.label}</dt><dd>{kpi.value}</dd></div>)}</dl>
    </section>

    <ReportSection title="Main patterns" section={report.patterns} />
    <ReportSection title="Model check" section={report.model} />

    <section>
      <h2>Recommended actions</h2>
      {report.actions.state !== 'ready' && report.actions.state !== 'insufficient_data'
        ? <p className="decisions-muted">{STATE_TEXT[report.actions.state]}</p>
        : <ol>{report.actions.items.map(action => <li key={action.id}><strong>{action.title}</strong> ({action.effortLabel}). {action.description} <em>{action.opportunity}</em></li>)}</ol>}
    </section>

    <section>
      <h2>Limitations</h2>
      <ul className="decisions-limitations">{report.limitations.map(text => <li key={text}>{text}</li>)}</ul>
      <p className="decisions-muted">Opportunities are indicative and are never added together. Unsold portions do not prove that food was discarded.</p>
    </section>
  </article>
}

function ReportSection({ title, section }) {
  return <section>
    <h2>{title}</h2>
    {section.items.length === 0
      ? <p className="decisions-muted">{STATE_TEXT[section.state] || 'Nothing to report.'}</p>
      : <ul>{section.items.map(item => <li key={item.id}><strong>{item.title}</strong>: {item.detail}. <span className="decisions-muted">{item.interpretation}</span></li>)}</ul>}
  </section>
}
