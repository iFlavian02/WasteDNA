import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import { actionRows, isSettled, prefillFor, simulatorSelectionFor } from './logic.js'
import { useComponent } from './useComponent.js'

export default function Actions({ api, datasetId, base }) {
  const navigate = useNavigate()
  const recommendations = useComponent(api, datasetId, 'recommendations')
  const patterns = useComponent(api, datasetId, 'patterns')

  if (recommendations.error) return <ErrorState error={recommendations.error} onRetry={recommendations.retry} />
  if (!isSettled(recommendations.envelope)) return <LoadingState label="Calculating recommended actions…" />
  if (recommendations.envelope.status === 'error') {
    return <ErrorState error={{ message: recommendations.envelope.limitations[0] || 'Recommendations could not be calculated.' }} onRetry={recommendations.retry} />
  }

  const rows = actionRows(recommendations.envelope)
  return <section aria-labelledby="actions-title">
    <h1 id="actions-title">Recommended actions</h1>
    <p className="decisions-muted">At most three actions, each linked to a supported pattern. Opportunities are indicative; never add them together.</p>
    {rows.length === 0 ? <EmptyState title="No actions yet" /> : <ol className="decisions-actions">
      {rows.map(row => {
        const selection = simulatorSelectionFor(row, patterns.envelope)
        return <li key={row.id} className="decisions-card">
          <div className="decisions-card-head">
            <h2>{row.title}</h2>
            <span className={`decisions-effort decisions-effort-${row.effort}`}>{row.effortLabel}</span>
          </div>
          <p>{row.description}</p>
          <p className="decisions-opportunity">{row.opportunity}</p>
          {row.evidence.length > 0 && <p className="decisions-muted">Evidence: {row.evidence.join(', ')}</p>}
          {!row.isDataCollection && <div className="decisions-buttons decisions-noprint">
            <button type="button" onClick={() => navigate(`${base}/simulator`, { state: { selection } })}>Try it in the simulator</button>
            <button type="button" className="decisions-secondary" onClick={() => navigate('/redistribution', { state: { prefill: prefillFor(row, patterns.envelope) } })}>Offer the surplus to a charity</button>
          </div>}
        </li>
      })}
    </ol>}
    {recommendations.envelope.limitations.length > 0 && <ul className="decisions-limitations">
      {recommendations.envelope.limitations.map(text => <li key={text}>{text}</li>)}
    </ul>}
  </section>
}
