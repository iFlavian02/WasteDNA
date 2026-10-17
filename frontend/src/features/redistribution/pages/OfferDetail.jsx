import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../../components/States.jsx'
import { ApiErrorBox, Field, Reasons, StatusBadge } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { activeReservationFor, formatDateTime, formatKg, nameOf, newKey, reserveKey, toLocalInput, validateHandover } from '../logic.js'

/** One offer: explained matches, reservation, release, cancel and handover. */
export function OfferDetail({ client, directory }) {
  const { offerId } = useParams()
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [handover, setHandover] = useState(null)
  const view = useLoad(async () => {
    const [offer, reservations] = await Promise.all([client.offer(offerId), client.reservations()])
    const matches = offer.status === 'available' ? await client.matches(offerId) : null
    return { offer, reservation: activeReservationFor(offerId, reservations), matches }
  }, [client, offerId])

  async function act(action) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(error)
    } finally {
      setBusy(false)
      view.reload()
    }
  }

  if (view.error && !view.data) return <><BackLink /><ErrorState error={view.error} onRetry={view.reload} /></>
  if (!view.data) return <LoadingState label="Loading offer…" />
  const { offer, reservation, matches } = view.data
  const org = id => directory.organizationById.get(id)

  return <section aria-labelledby="rd-offer-title">
    <BackLink />
    <div className="rd-heading">
      <h1 id="rd-offer-title">{offer.category} · {formatKg(offer.quantity_kg)}</h1>
      <StatusBadge status={offer.status} />
    </div>
    <dl className="rd-meta">
      <dt>Donor</dt><dd>{nameOf(directory.donorById, offer.donor_id)}</dd>
      <dt>Description</dt><dd>{offer.description || '—'}</dd>
      <dt>Pickup window</dt><dd>{formatDateTime(offer.available_from)} → {formatDateTime(offer.pickup_deadline)}</dd>
      <dt>Allergens</dt><dd>{offer.allergens === null ? 'Unknown' : offer.allergens.length ? offer.allergens.join(', ') : 'None declared'}</dd>
      <dt>Storage</dt><dd>{offer.storage_requirements.join(', ') || 'No special needs'}</dd>
      <dt>Version</dt><dd>{offer.version}</dd>
    </dl>
    <ApiErrorBox error={actionError} onDismiss={() => setActionError(null)} />
    {view.error && <ApiErrorBox error={view.error} />}

    {offer.status === 'available' && matches && <Matches offer={offer} matches={matches} org={org} busy={busy}
      onReserve={organizationId => act(() => client.reserve(offer.id, { organization_id: organizationId, offer_version: offer.version, idempotency_key: reserveKey(offer, organizationId) }))} />}

    {offer.status === 'reserved' && reservation && <section className="rd-panel" aria-labelledby="rd-res-title">
      <h2 id="rd-res-title">Reserved by {nameOf(directory.organizationById, reservation.organization_id)}</h2>
      <p>Reserved {formatDateTime(reservation.reserved_at)}. The organization confirms the quantity actually received at pickup.</p>
      <HandoverForm offer={offer} busy={busy} onSubmit={payload => act(async () => setHandover(await client.handover(reservation.reservation_id, payload)))} />
      <button type="button" className="rd-secondary" disabled={busy} onClick={() => act(() => client.release(reservation.reservation_id))}>Release reservation</button>
    </section>}

    {offer.status === 'collected' && <section className="rd-panel">
      <h2>Collected</h2>
      {handover ? <p>{nameOf(directory.organizationById, handover.organization_id)} confirmed receiving {formatKg(handover.received_quantity_kg)} of {formatKg(handover.offered_quantity_kg)} at {formatDateTime(handover.received_at)}. Only the received quantity counts as impact.</p>
        : <p>The handover was confirmed{reservation ? ` by ${nameOf(directory.organizationById, reservation.organization_id)}` : ''}. See <Link to="../impact">Impact</Link> for received quantities.</p>}
    </section>}

    {offer.status === 'expired' && <p className="rd-notice">The pickup deadline has passed. This offer can no longer be matched or reserved; any reserved capacity was released.</p>}
    {offer.status === 'cancelled' && <p className="rd-notice">This offer was cancelled.</p>}

    {(offer.status === 'available' || offer.status === 'reserved') &&
      <button type="button" className="rd-danger" disabled={busy} onClick={() => window.confirm('Cancel this offer? Any reservation is released.') && act(() => client.cancelOffer(offer.id))}>Cancel offer</button>}
  </section>
}

function BackLink() {
  return <Link to=".." className="rd-back">← All offers</Link>
}

function Matches({ offer, matches, org, busy, onReserve }) {
  return <section className="rd-panel" aria-labelledby="rd-matches-title">
    <h2 id="rd-matches-title">Eligible organizations</h2>
    <p className="rd-hint">Rule-based filters: category, allergens, storage, distance, daily capacity and opening hours. Nearest first.</p>
    {matches.eligible.length === 0
      ? <p className="rd-notice">No organization can accept this offer{offer.allergens === null ? '. Allergens are unknown, so automatic matching is blocked until the donor declares them' : ''}. The reasons for each organization are listed below.</p>
      : <ul className="rd-cards">{matches.eligible.map(match => <li key={match.organization_id} className="rd-card">
        <div className="rd-card-head"><strong>{org(match.organization_id)?.name || match.organization_id}</strong><span className="rd-badge">{match.distance_km} km away</span></div>
        <p>Pickup {formatDateTime(match.pickup_window.from)} → {formatDateTime(match.pickup_window.to)} · capacity left today {formatKg(match.capacity_available_kg)}</p>
        <Reasons reasons={match.reasons} />
        <button type="button" className="rd-button" disabled={busy} onClick={() => onReserve(match.organization_id)}>Reserve all {formatKg(offer.quantity_kg)}</button>
      </li>)}</ul>}
    {matches.rejected.length > 0 && <details className="rd-rejected">
      <summary>Not eligible ({matches.rejected.length})</summary>
      <ul>{matches.rejected.map(match => <li key={match.organization_id}>
        <strong>{org(match.organization_id)?.name || match.organization_id}</strong>
        <Reasons reasons={match.reasons} />
      </li>)}</ul>
    </details>}
  </section>
}

function HandoverForm({ offer, busy, onSubmit }) {
  const [form, setForm] = useState(() => ({ receivedKg: '', receivedAt: toLocalInput(Date.now()), idempotencyKey: newKey(`handover-${offer.id}`) }))
  const [errors, setErrors] = useState({})
  const set = field => event => setForm(current => ({ ...current, [field]: event.target.value }))

  function submit(event) {
    event.preventDefault()
    const { errors: found, payload } = validateHandover(form, offer)
    setErrors(found)
    if (payload) onSubmit(payload)
  }

  return <form className="rd-form rd-compact" onSubmit={submit} noValidate>
    <h3>Confirm handover</h3>
    <div className="rd-row">
      <Field id="rd-receivedKg" label={`Received (kg, max ${offer.quantity_kg})`} error={errors.receivedKg}>
        <input id="rd-receivedKg" inputMode="decimal" value={form.receivedKg} onChange={set('receivedKg')} aria-invalid={!!errors.receivedKg} />
      </Field>
      <Field id="rd-receivedAt" label="Received at (Bucharest time)" error={errors.receivedAt}>
        <input id="rd-receivedAt" type="datetime-local" value={form.receivedAt} onChange={set('receivedAt')} aria-invalid={!!errors.receivedAt} />
      </Field>
    </div>
    <button type="submit" className="rd-button" disabled={busy}>Confirm received quantity</button>
  </form>
}
