import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiErrorBox, Field } from '../components.jsx'
import { EMPTY_OFFER_FORM, mapPrefill, STORAGE_OPTIONS, validateOffer } from '../logic.js'

/**
 * Manual offer creation. A prefill from the actions screen only suggests the
 * category and description: quantity and pickup window are always entered
 * and confirmed by the donor. Input is kept on recoverable errors.
 */
export function OfferForm({ client, directory, prefill }) {
  const navigate = useNavigate()
  const [suggestion] = useState(() => mapPrefill(prefill, directory.categories))
  const [form, setForm] = useState(() => ({
    ...EMPTY_OFFER_FORM,
    category: suggestion?.category || '',
    description: suggestion?.description || '',
  }))
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = field => event => setForm(current => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const toggleStorage = option => setForm(current => ({
    ...current,
    storage: current.storage.includes(option) ? current.storage.filter(item => item !== option) : [...current.storage, option],
  }))
  const describedBy = field => (errors[field] ? `rd-${field}-error` : undefined)

  async function submit(event) {
    event.preventDefault()
    const { errors: found, payload } = validateOffer(form)
    setErrors(found)
    setApiError(null)
    if (!payload) return
    setSaving(true)
    try {
      const offer = await client.createOffer(payload)
      navigate(`../offers/${encodeURIComponent(offer.id)}`)
    } catch (error) {
      setApiError(error)
    } finally {
      setSaving(false)
    }
  }

  return <section aria-labelledby="rd-form-title">
    <h1 id="rd-form-title">New surplus offer</h1>
    {suggestion && <div className="rd-notice" role="status">
      Suggested from a WiseEat action. Check the category and description, then enter the <strong>real quantity</strong> and <strong>pickup window</strong>; nothing is published until you confirm.
      {suggestion.note && <> {suggestion.note}</>}
    </div>}
    <ApiErrorBox error={apiError} />
    <form className="rd-form" onSubmit={submit} noValidate>
      <Field id="rd-donorId" label="Donor" error={errors.donorId}>
        <select id="rd-donorId" value={form.donorId} onChange={set('donorId')} aria-invalid={!!errors.donorId} aria-describedby={describedBy('donorId')}>
          <option value="">Choose…</option>
          {directory.donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name} ({donor.type})</option>)}
        </select>
      </Field>
      <Field id="rd-category" label="Food category" error={errors.category}>
        <select id="rd-category" value={form.category} onChange={set('category')} aria-invalid={!!errors.category} aria-describedby={describedBy('category')}>
          <option value="">Choose…</option>
          {directory.categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </Field>
      <Field id="rd-description" label="Description (optional)">
        <input id="rd-description" value={form.description} maxLength={500} onChange={set('description')} />
      </Field>
      <fieldset className="rd-field">
        <legend>Allergens</legend>
        {[['declared', 'Contains these allergens'], ['none', 'No allergens'], ['unknown', 'Unknown (no automatic matching)']].map(([value, label]) =>
          <label key={value} className="rd-inline"><input type="radio" name="rd-allergen-mode" value={value} checked={form.allergenMode === value} onChange={set('allergenMode')} /> {label}</label>)}
        {form.allergenMode === 'declared' && <input aria-label="Allergens, comma separated" placeholder="gluten, milk" value={form.allergens} onChange={set('allergens')} />}
        {errors.allergens && <small id="rd-allergens-error" className="rd-error-text">{errors.allergens}</small>}
      </fieldset>
      <fieldset className="rd-field">
        <legend>Storage and transport needs</legend>
        {STORAGE_OPTIONS.map(option => <label key={option} className="rd-inline"><input type="checkbox" checked={form.storage.includes(option)} onChange={() => toggleStorage(option)} /> {option}</label>)}
      </fieldset>
      <div className="rd-row">
        <Field id="rd-quantityKg" label="Quantity available (kg)" error={errors.quantityKg}>
          <input id="rd-quantityKg" inputMode="decimal" value={form.quantityKg} onChange={set('quantityKg')} aria-invalid={!!errors.quantityKg} aria-describedby={describedBy('quantityKg')} />
        </Field>
        <Field id="rd-portionCount" label="Portions (optional)" error={errors.portionCount}>
          <input id="rd-portionCount" inputMode="numeric" value={form.portionCount} onChange={set('portionCount')} aria-invalid={!!errors.portionCount} />
        </Field>
      </div>
      <div className="rd-row">
        <Field id="rd-availableFrom" label="Available from (Bucharest time)" error={errors.availableFrom}>
          <input id="rd-availableFrom" type="datetime-local" value={form.availableFrom} onChange={set('availableFrom')} aria-invalid={!!errors.availableFrom} aria-describedby={describedBy('availableFrom')} />
        </Field>
        <Field id="rd-pickupDeadline" label="Pickup deadline (Bucharest time)" error={errors.pickupDeadline}>
          <input id="rd-pickupDeadline" type="datetime-local" value={form.pickupDeadline} onChange={set('pickupDeadline')} aria-invalid={!!errors.pickupDeadline} aria-describedby={describedBy('pickupDeadline')} />
        </Field>
      </div>
      <label className={`rd-inline rd-confirm${errors.confirmed ? ' rd-field-error' : ''}`}>
        <input type="checkbox" checked={form.confirmed} onChange={set('confirmed')} aria-describedby={describedBy('confirmed')} />
        The donor confirms this quantity is really available and can be picked up before the deadline.
      </label>
      {errors.confirmed && <small id="rd-confirmed-error" className="rd-error-text">{errors.confirmed}</small>}
      <button type="submit" className="rd-button" disabled={saving}>{saving ? 'Publishing…' : 'Publish offer'}</button>
    </form>
  </section>
}
