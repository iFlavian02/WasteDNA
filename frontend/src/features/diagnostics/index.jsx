import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import {
  anomalyRows,
  combinedLimitations,
  evaluationView,
  explanationRows,
  isSettled,
  patternCards,
} from './logic.js'
import { useComponent } from './useComponent.js'
import './diagnostics.css'

/** Member 2 feature mounted by the shell at `/diagnostics/*`. */
export default function DiagnosticsPage({ api, datasetId, isSynthetic }) {
  const patterns = useComponent(api, datasetId, 'patterns')
  const model = useComponent(api, datasetId, 'model')
  const limitations = combinedLimitations(patterns.envelope, model.envelope)

  return <div className="diagnostics">
    <header className="diagnostics-hero">
      <div>
        <p className="diagnostics-eyebrow">Waste diagnostics</p>
        <h1>Where surplus repeats, and what the model can explain</h1>
        <p>Patterns use comparable baselines. Model results use later held-out dates and calibrated residual alerts.</p>
      </div>
      {isSynthetic && <span className="diagnostics-badge">Simulated sales</span>}
    </header>

    {isSynthetic && <p className="diagnostics-callout">This dataset is synthetic. Weather and calendar dates may be real inputs, but the sales effects and anomalies are simulated.</p>}

    <PatternsSection state={patterns} />
    <ModelSection state={model} />

    <section className="diagnostics-limitations" aria-labelledby="diagnostics-limitations-title">
      <h2 id="diagnostics-limitations-title">Read with care</h2>
      <p>These are associations and residual alerts, not proof that a factor caused waste. Unsold portions do not prove food was discarded.</p>
      {limitations.length > 0 && <ul>{limitations.map(text => <li key={text}>{text}</li>)}</ul>}
    </section>
  </div>
}

function PatternsSection({ state }) {
  const cards = patternCards(state.envelope)
  return <section className="diagnostics-section" aria-labelledby="patterns-title">
    <SectionHeading eyebrow="Descriptive analysis" title="Supported patterns" id="patterns-title" />
    <ComponentState state={state} loading="Comparing supported groups…" emptyTitle="No supported patterns" emptyDescription="The dataset does not yet meet the support thresholds for comparable groups.">
      {cards.length === 0 ? <EmptyState title="No supported patterns" description="The analysis completed without a pattern that met the reporting thresholds." /> : <div className="diagnostics-pattern-grid">
        {cards.map(card => <article className="diagnostics-pattern-card" key={card.id}>
          <div className="diagnostics-card-heading"><h3>{card.title}</h3><strong>{card.effect}</strong></div>
          <dl className="diagnostics-metrics">
            <div><dt>Group unsold</dt><dd>{card.groupRate}</dd></div>
            <div><dt>Comparable baseline</dt><dd>{card.baselineRate}</dd></div>
            <div><dt>Support</dt><dd>{card.support}</dd></div>
            <div><dt>Volume</dt><dd>{card.prepared}</dd></div>
          </dl>
          {card.interval && <p className="diagnostics-meta">Descriptive 95% interval: {card.interval}</p>}
          {card.opportunity && <p className="diagnostics-opportunity">{card.opportunity}</p>}
          <p className="diagnostics-meta">{card.interpretation}</p>
        </article>)}
      </div>}
    </ComponentState>
  </section>
}

function ModelSection({ state }) {
  const evaluation = evaluationView(state.envelope)
  const explanations = explanationRows(state.envelope)
  const anomalies = anomalyRows(state.envelope)
  const explanationStatus = state.envelope?.result?.explanations?.status

  return <section className="diagnostics-section" aria-labelledby="model-title">
    <SectionHeading eyebrow="Held-out evaluation" title="Model, explanations and alerts" id="model-title" />
    <ComponentState state={state} loading="Training and evaluating the diagnostic model…" emptyTitle="Not enough dates for model evaluation" emptyDescription="At least 60 distinct dates with positive preparation are required.">
      {evaluation && <>
        <div className="diagnostics-evaluation">
          <div><span>Model MAE</span><strong>{evaluation.modelError}</strong></div>
          <div><span>Baseline MAE</span><strong>{evaluation.baselineError}</strong></div>
          <div><span>Temporal split</span><strong>{evaluation.periods}</strong></div>
        </div>
        <p className={`diagnostics-verdict ${evaluation.wins ? 'is-positive' : ''}`}>{evaluation.verdict}</p>
      </>}

      <div className="diagnostics-two-column">
        <article className="diagnostics-panel">
          <h3>Explanation factors</h3>
          <p className="diagnostics-meta">Mean contribution to the predicted unsold rate. Direction is association, not causation.</p>
          {explanationStatus === 'unavailable'
            ? <EmptyState title="Explanations unavailable" description="Evaluation remains valid even when the explanation calculation is unavailable." />
            : explanations.length === 0
              ? <EmptyState title="No reportable explanation factors" />
              : <ol className="diagnostics-factor-list">{explanations.map(factor => <li key={factor.name}>
                <div><strong>{factor.name}</strong><span>{factor.method} · {factor.support}</span></div>
                <b className={factor.contributionPp >= 0 ? 'is-positive' : 'is-negative'}>{factor.contribution}</b>
              </li>)}</ol>}
        </article>

        <article className="diagnostics-panel">
          <h3>Anomaly timeline</h3>
          <p className="diagnostics-meta">Positive residuals above a calibration-derived threshold. Alerts are not confirmed causes or discarded food.</p>
          {anomalies.length === 0
            ? <EmptyState title="No residual alerts" description="No test-period observations crossed the current alert threshold." />
            : <>
              <div className="diagnostics-chart" aria-hidden="true">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={anomalies} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} width={34} />
                    <Tooltip formatter={value => [`${value} portions`, 'Excess unsold']} labelFormatter={date => `Date: ${date}`} />
                    <Bar dataKey="excessPortions" fill="#d96b38" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="diagnostics-table-wrap"><table className="diagnostics-table">
                <caption>Residual alert details</caption>
                <thead><tr><th>Date</th><th>Dish / service</th><th>Observed vs expected</th><th>Excess</th><th>Cost</th></tr></thead>
                <tbody>{anomalies.map(item => <tr key={item.id}>
                  <td>{item.date}</td><td>{item.dish} / {item.service}</td><td>{item.observedExpected}</td><td>{item.excessPortionsLabel}</td><td>{item.excessCostLabel}</td>
                </tr>)}</tbody>
              </table></div>
            </>}
        </article>
      </div>
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
