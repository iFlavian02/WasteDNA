import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import { isSettled, patternCards } from './logic.js'
import { useComponent } from './useComponent.js'
import './diagnostics.css'

/** Statistics page mounted by the shell at `/diagnostics/*`. */
export default function DiagnosticsPage({ api, datasetId }) {
  const patterns = useComponent(api, datasetId, 'patterns')

  return <div className="diagnostics">
    <PatternsSection state={patterns} />
  </div>
}

function PatternsSection({ state }) {
  const cards = patternCards(state.envelope)
  return <section className="diagnostics-section" aria-labelledby="patterns-title">
    <SectionHeading eyebrow="Descriptive analysis" title="Supported patterns" id="patterns-title" />
    <ComponentState state={state} loading="Comparing supported groups…" emptyTitle="No supported patterns" emptyDescription="The dataset does not yet meet the support thresholds for comparable groups.">
      {cards.length === 0 ? <EmptyState title="No supported patterns" description="The analysis completed without a pattern that met the reporting thresholds." /> : <div className="diagnostics-pattern-grid">
        {cards.map(card => <article className="diagnostics-pattern-card" key={card.id}>
          <h3>{card.title}</h3>
          <dl className="diagnostics-metrics">
            {card.statistics.map(statistic => <div key={statistic.label}><dt>{statistic.label}</dt><dd>{statistic.value}</dd></div>)}
          </dl>
          {card.opportunity && <p className="diagnostics-opportunity">{card.opportunity}</p>}
        </article>)}
      </div>}
    </ComponentState>
  </section>
}

function SectionHeading({ eyebrow, title, id }) {
  return <header className="diagnostics-section-heading"><p>{eyebrow}</p><h2 id={id}>{title}</h2></header>
}

function ComponentState({ state, loading, emptyTitle, emptyDescription, children }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.retry} />
  if (!state.envelope || !isSettled(state.envelope)) return <LoadingState label={loading} />
  if (state.envelope.status === 'error') {
    return <ErrorState error={{ message: state.envelope.limitations?.[0] || 'This analysis could not be completed.' }} onRetry={state.retry} />
  }
  if (state.envelope.status === 'insufficient_data' || !state.envelope.result) {
    const description = state.envelope.limitations?.join(' ') || state.envelope.result?.limitations?.join(' ') || emptyDescription
    return <EmptyState title={emptyTitle} description={description} />
  }
  return children
}
