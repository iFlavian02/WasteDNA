import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import { allSettled } from './status.js'

export default function Summary({ api, dataset }) {
  const [state, setState] = useState({ id: null, summary: null, status: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const id = dataset?.dataset_id
  useEffect(() => {
    if (!id) return
    let cancelled = false
    let timer
    async function load() {
      try {
        const [summary, status] = await Promise.all([
          api.request(`/api/datasets/${encodeURIComponent(id)}/summary`),
          api.request(`/api/datasets/${encodeURIComponent(id)}`),
        ])
        if (cancelled) return
        setState({ id, summary, status, error: null })
        if (!allSettled(status.components)) timer = setTimeout(load, 1500)
      } catch (error) {
        if (!cancelled) setState({ id, summary: null, status: null, error })
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [api, id, attempt])
  if (!id) return <EmptyState title="No dataset selected" description="Upload a CSV or load demo data to see a summary." />
  if (state.id !== id) return <LoadingState label="Loading summary…" />
  if (state.error) return <ErrorState error={state.error} onRetry={() => setAttempt(value => value + 1)} />
  const result = state.summary?.result
  if (!result) return <LoadingState label="Loading summary…" />
  const components = Object.entries(state.status?.components || {})
  return <section className="platform-page">
    <h1>Dataset summary</h1>
    {dataset.is_synthetic && <p className="notice">Synthetic demo data</p>}
    <p>Period: {result.period?.from} to {result.period?.to} ({result.period?.calendar_days} calendar days)</p>
    <div className="platform-metrics">
      <div><strong>{result.prepared_portions}</strong><span>Prepared portions</span></div>
      <div><strong>{result.sold_portions}</strong><span>Sold portions</span></div>
      <div><strong>{result.unsold_portions}</strong><span>Unsold portions</span></div>
      <div><strong>{result.unsold_cost_ron?.toFixed(2)} RON</strong><span>Unsold cost</span></div>
      <div><strong>{result.unsold_rate == null ? '—' : `${(result.unsold_rate * 100).toFixed(1)}%`}</strong><span>Unsold rate</span></div>
    </div>
    <p>Unsold portions do not prove food was discarded.</p>
    <h2>Analysis status</h2>
    <ul>{components.map(([name, value]) => <li key={name}>{name}: {value}</li>)}</ul>
    {!allSettled(state.status?.components) && <p role="status">Analysis is running. This page updates automatically.</p>}
    <nav className="platform-links"><Link to="/business/insights">View diagnostics</Link><Link to="/business/actions">View actions</Link><Link to="/business/upload">Choose another dataset</Link></nav>
  </section>
}
