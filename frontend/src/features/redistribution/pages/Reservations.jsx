import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States.jsx'
import { ApiErrorBox, Field, Limitations, Reasons } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { formatDateTime, formatKg, localInputToIso, nameOf, toLocalInput } from '../logic.js'

/** Active reservations per organization and a simulated pickup route. */
export function Reservations({ client, directory }) {
  const view = useLoad(async () => {
    const [reservations, offers] = await Promise.all([client.reservations('reserved'), client.offers()])
    const offerById = new Map(offers.map(offer => [offer.id, offer]))
    return reservations.map(item => ({ ...item, offer: offerById.get(item.offer_id) }))
  }, [client])

  if (view.error) return <ErrorState error={view.error} onRetry={view.reload} />
  if (!view.data) return <LoadingState label="Loading reservations…" />
  const byOrg = groupBy(view.data)

  return <section aria-labelledby="rd-reservations-title">
    <div className="rd-heading">
      <h1 id="rd-reservations-title">Reservations and pickup</h1>
      <button type="button" className="rd-link" onClick={view.reload}>Refresh</button>
    </div>
    {view.data.length === 0 ? <EmptyState title="No active reservations" description="Reserve an offer from its matches; it then appears here for pickup planning." />
      : Object.entries(byOrg).map(([organizationId, items]) => <OrganizationPickups key={organizationId} client={client}
        org={directory.organizationById.get(organizationId)} organizationId={organizationId} items={items} directory={directory} />)}
  </section>
}

function groupBy(items) {
  return items.reduce((groups, item) => ({ ...groups, [item.organization_id]: [...(groups[item.organization_id] || []), item] }), {})
}

function OrganizationPickups({ client, org, organizationId, items, directory }) {
  const [selected, setSelected] = useState(() => items.map(item => item.reservation_id))
  const [form, setForm] = useState(() => ({ capacity: '40', departure: toLocalInput(Date.now()) }))
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const toggle = id => setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]))

  async function planRoute(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setPlan(await client.planRoute({
        organization_id: organizationId,
        reservation_ids: selected,
        vehicle_capacity_kg: Number(form.capacity),
        departure_at: localInputToIso(form.departure),
        start_location: org.location,
        destination: org.location,
      }))
    } catch (failure) {
      setPlan(null)
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  return <section className="rd-panel" aria-label={`Pickups for ${org?.name || organizationId}`}>
    <h2>{org?.name || organizationId}</h2>
    <ul className="rd-checklist">{items.map(item => <li key={item.reservation_id}>
      <label className="rd-inline">
        <input type="checkbox" checked={selected.includes(item.reservation_id)} onChange={() => toggle(item.reservation_id)} />
        {item.offer ? <>{item.offer.category} · {formatKg(item.offer.quantity_kg)} from {nameOf(directory.donorById, item.offer.donor_id)}, deadline {formatDateTime(item.offer.pickup_deadline)}</> : item.offer_id}
      </label> <Link to={`../offers/${encodeURIComponent(item.offer_id)}`}>Handover or release</Link>
    </li>)}</ul>
    <form className="rd-form rd-compact" onSubmit={planRoute} noValidate>
      <div className="rd-row">
        <Field id={`rd-cap-${organizationId}`} label="Vehicle capacity (kg)">
          <input id={`rd-cap-${organizationId}`} inputMode="decimal" value={form.capacity} onChange={event => setForm(current => ({ ...current, capacity: event.target.value }))} />
        </Field>
        <Field id={`rd-dep-${organizationId}`} label="Departure from the organization">
          <input id={`rd-dep-${organizationId}`} type="datetime-local" value={form.departure} onChange={event => setForm(current => ({ ...current, departure: event.target.value }))} />
        </Field>
      </div>
      <button type="submit" className="rd-button" disabled={busy || selected.length === 0}>Plan pickup route</button>
    </form>
    <ApiErrorBox error={error} />
    {plan && <RoutePlan plan={plan} />}
  </section>
}

function RoutePlan({ plan }) {
  return <div className="rd-route">
    <h3>Pickup route <span className="rd-badge">simulated travel times</span></h3>
    {plan.stops.length === 0 ? <p>No reservation fits in a feasible route.</p>
      : <ol>{plan.stops.map(stop => <li key={stop.reservation_id}>
        Arrive {formatDateTime(stop.estimated_arrival)}, leave {formatDateTime(stop.estimated_departure)}: collect {formatKg(stop.quantity_kg)} (load {formatKg(stop.load_after_kg)})
      </li>)}
        <li>Back at the organization {formatDateTime(plan.arrival_at_destination)} with {formatKg(plan.total_quantity_kg)}</li>
      </ol>}
    {plan.excluded.length > 0 && <>
      <h4>Not included</h4>
      <ul>{plan.excluded.map(item => <li key={item.reservation_id}>{item.reservation_id}<Reasons reasons={item.reasons} /></li>)}</ul>
    </>}
    <Limitations items={plan.limitations} />
  </div>
}
