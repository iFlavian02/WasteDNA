import { useState } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States.jsx'
import { Limitations } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { formatKg, nameOf } from '../logic.js'

/** Offered, reserved and handed-over kg, kept separate. Only handovers are impact. */
export function Impact({ client, directory }) {
  const [period, setPeriod] = useState({ from: '', to: '' })
  const impact = useLoad(() => client.impact(period), [client, period])
  const setDate = field => event => setPeriod(current => ({ ...current, [field]: event.target.value }))

  return <section aria-labelledby="rd-impact-title">
    <h1 id="rd-impact-title">Impact</h1>
    <div className="rd-filters">
      <label>From <input type="date" value={period.from} onChange={setDate('from')} /></label>
      <label>To <input type="date" value={period.to} onChange={setDate('to')} /></label>
    </div>
    {impact.error ? <ErrorState error={impact.error} onRetry={impact.reload} />
      : !impact.data ? <LoadingState label="Loading impact…" />
        : <>
          {impact.data.is_synthetic && <p className="rd-synthetic">Synthetic demo figures, not real donations.</p>}
          <div className="rd-stats">
            <div className="rd-stat rd-stat-main"><span>{formatKg(impact.data.handed_over_quantity_kg)}</span>received by organizations ({impact.data.handover_count} handovers)</div>
            <div className="rd-stat"><span>{formatKg(impact.data.reserved_quantity_kg)}</span>reserved, awaiting pickup</div>
            <div className="rd-stat"><span>{formatKg(impact.data.offered_quantity_kg)}</span>offered in total</div>
          </div>
          {impact.data.destinations.length === 0 ? <EmptyState title="No confirmed handovers yet" description="Impact only counts quantities an organization confirmed receiving." />
            : <table className="rd-table">
              <caption>Destinations</caption>
              <thead><tr><th scope="col">Organization</th><th scope="col">Received</th><th scope="col">Handovers</th></tr></thead>
              <tbody>{impact.data.destinations.map(item => <tr key={item.organization_id}>
                <td>{nameOf(directory.organizationById, item.organization_id)}</td><td>{formatKg(item.handed_over_quantity_kg)}</td><td>{item.handover_count}</td>
              </tr>)}</tbody>
            </table>}
          <Limitations items={impact.data.limitations} />
        </>}
  </section>
}
