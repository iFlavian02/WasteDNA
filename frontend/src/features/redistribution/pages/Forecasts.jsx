import { useState } from 'react'
import { ErrorState, LoadingState } from '../../../components/States.jsx'
import { ApiErrorBox, Field, Limitations } from '../components.jsx'
import { useLoad } from '../hooks.js'
import { bucharestDate, formatKg, nameOf, validateSurplusLog } from '../logic.js'

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatDay = value => dayFormat.format(new Date(`${value}T00:00:00Z`))

/**
 * Surplus forecasts (member 4's model) and the donor-confirmed daily log that
 * feeds them. Forecasts are planning suggestions, never offers.
 */
export function Forecasts({ client, directory }) {
  const [days, setDays] = useState(7)
  const forecasts = useLoad(() => client.forecasts(days), [client, days])

  return <section aria-labelledby="rd-forecast-title">
    <h1 id="rd-forecast-title">Surplus forecasts</h1>
    <p className="rd-notice">Forecasts help plan pickups. They are not offers: nothing can be reserved until a donor publishes a real offer.</p>
    <label className="rd-filters">Horizon <select value={days} onChange={event => setDays(Number(event.target.value))}>
      {[3, 7, 14].map(value => <option key={value} value={value}>{value} days</option>)}
    </select></label>
    {forecasts.error ? <ErrorState error={forecasts.error} onRetry={forecasts.reload} />
      : !forecasts.data ? <LoadingState label="Calculating forecasts…" />
        : <>
          <ul className="rd-cards">{forecasts.data.items.map(item => <DonorForecast key={item.donor_id} item={item} name={nameOf(directory.donorById, item.donor_id)} />)}</ul>
          <Limitations items={forecasts.data.limitations} />
          <p className="rd-hint">{forecasts.data.provenance}</p>
        </>}
    <SurplusLogForm client={client} directory={directory} onLogged={forecasts.reload} />
  </section>
}

function DonorForecast({ item, name }) {
  if (item.status !== 'ready') {
    return <li className="rd-card">
      <div className="rd-card-head"><strong>{name}</strong><span className="rd-badge">not enough history</span></div>
      <p>{item.support_days} complete days recorded{item.excluded_incomplete_days ? `, ${item.excluded_incomplete_days} incomplete days excluded` : ''}.</p>
      <Limitations items={item.limitations} />
    </li>
  }
  return <li className="rd-card">
    <div className="rd-card-head"><strong>{name}</strong><span className="rd-badge rd-badge-available">forecast</span></div>
    <p>Based on {item.support_days} complete days. On {item.test_days} later test days the method was off by {formatKg(item.model_mae)} per day on average, against {formatKg(item.baseline_mae)} for the weekday-median baseline.</p>
    <table className="rd-table">
      <thead><tr><th scope="col">Day</th><th scope="col">Expected surplus</th><th scope="col">{Math.round((item.interval_level || 0) * 100)}% range</th></tr></thead>
      <tbody>{item.predictions.map(point => <tr key={point.predicted_for}>
        <td>{formatDay(point.predicted_for)}</td>
        <td>{point.predicted_quantity.toLocaleString('en-GB', { maximumFractionDigits: 1 })} {item.unit}</td>
        <td>{point.lower === null ? '—' : `${point.lower.toFixed(1)}–${point.upper.toFixed(1)} ${item.unit}`}</td>
      </tr>)}</tbody>
    </table>
    <Limitations items={item.limitations} />
  </li>
}

function SurplusLogForm({ client, directory, onLogged }) {
  const [today] = useState(() => bucharestDate(Date.now()))
  const [form, setForm] = useState(() => ({ donorId: '', date: today, quantityKg: '' }))
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saved, setSaved] = useState(null)
  const set = field => event => setForm(current => ({ ...current, [field]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    const { errors: found, payload } = validateSurplusLog(form)
    setErrors(found)
    setApiError(null)
    setSaved(null)
    if (!payload) return
    try {
      setSaved(await client.logSurplus(payload))
      setForm(current => ({ ...current, quantityKg: '' }))
      onLogged()
    } catch (error) {
      setApiError(error)
    }
  }

  return <form className="rd-form rd-panel" onSubmit={submit} noValidate aria-labelledby="rd-log-title">
    <h2 id="rd-log-title">Confirm a day's total surplus</h2>
    <p className="rd-hint">Forecasts use only days a donor has confirmed. Enter 0 for a day without surplus; leave unknown days out. A confirmed day cannot be changed.</p>
    <div className="rd-row">
      <Field id="rd-log-donor" label="Donor" error={errors.donorId}>
        <select id="rd-log-donor" value={form.donorId} onChange={set('donorId')} aria-invalid={!!errors.donorId}>
          <option value="">Choose…</option>
          {directory.donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name}</option>)}
        </select>
      </Field>
      <Field id="rd-log-date" label="Day" error={errors.date}>
        <input id="rd-log-date" type="date" value={form.date} max={today} onChange={set('date')} aria-invalid={!!errors.date} />
      </Field>
      <Field id="rd-log-kg" label="Total surplus (kg)" error={errors.quantityKg}>
        <input id="rd-log-kg" inputMode="decimal" value={form.quantityKg} onChange={set('quantityKg')} aria-invalid={!!errors.quantityKg} />
      </Field>
    </div>
    <button type="submit" className="rd-button">Confirm day</button>
    <ApiErrorBox error={apiError} />
    {saved && <p role="status">Confirmed {formatKg(saved.quantity_kg)} for {nameOf(directory.donorById, saved.donor_id)} on {formatDay(saved.date)}.</p>}
  </form>
}
