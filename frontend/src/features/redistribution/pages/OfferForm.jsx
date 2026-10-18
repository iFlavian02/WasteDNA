import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiErrorBox, Field } from '../components.jsx'
import { EMPTY_OFFER_FORM, mapPrefill, salePriceFromDiscount, STORAGE_OPTIONS, validateSaleListing } from '../logic.js'

/**
 * A business publishes leftover food for customer purchase at a required
 * discount. Input is kept on recoverable errors.
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
    const { errors: found, payload } = validateSaleListing(form)
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
    <Link to=".." className="rd-back">← All orders</Link>
    <h1 id="rd-form-title">New discounted order</h1>
    {suggestion && <div className="rd-notice" role="status">
      Suggested from a WiseEat action. Check the product and category, then set the customer price and pickup window.
      {suggestion.note && <> {suggestion.note}</>}
    </div>}
    <ApiErrorBox error={apiError} />
    <form className="rd-form" onSubmit={submit} noValidate>
      <Field id="rd-donorId" label="Selling location" error={errors.donorId}>
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
      <Field id="rd-description" label="Product" error={errors.description}>
        <input id="rd-description" value={form.description} maxLength={500} onChange={set('description')} aria-invalid={!!errors.description} aria-describedby={describedBy('description')} placeholder="e.g. Lasagna al forno" />
      </Field>
      <fieldset className="rd-field">
        <legend>Allergens</legend>
        {[['declared', 'Contains these allergens'], ['none', 'No allergens'], ['unknown', 'Unknown']].map(([value, label]) =>
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
        <Field id="rd-portionCount" label="Portions available" error={errors.portionCount}>
          <input id="rd-portionCount" inputMode="numeric" value={form.portionCount} onChange={set('portionCount')} aria-invalid={!!errors.portionCount} />
        </Field>
      </div>
      <div className="rd-row rd-price-fields">
        <Field id="rd-originalPriceRon" label="Regular price per portion (lei)" error={errors.originalPriceRon}>
          <input id="rd-originalPriceRon" inputMode="decimal" value={form.originalPriceRon} onChange={set('originalPriceRon')} aria-invalid={!!errors.originalPriceRon} aria-describedby={describedBy('originalPriceRon')} />
        </Field>
        <Field id="rd-discountPercent" label="Discount (%)" error={errors.discountPercent}>
          <input id="rd-discountPercent" inputMode="decimal" value={form.discountPercent} onChange={set('discountPercent')} aria-invalid={!!errors.discountPercent} aria-describedby={describedBy('discountPercent')} />
        </Field>
        <div className="rd-price-preview" aria-live="polite">
          <span>Customer price</span>
          <strong>{salePriceFromDiscount(form.originalPriceRon, form.discountPercent)?.toLocaleString('en-GB', { maximumFractionDigits: 2 }) ?? '—'} lei</strong>
          <small>per portion</small>
        </div>
      </div>
      <p className="rd-hint">The discounted customer price is calculated automatically and the product appears on the WiseEat food map.</p>
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
        I confirm the product, regular price, discount, quantity and pickup window are correct.
      </label>
      {errors.confirmed && <small id="rd-confirmed-error" className="rd-error-text">{errors.confirmed}</small>}
      <button type="submit" className="rd-button" disabled={saving}>{saving ? 'Publishing…' : 'Publish order'}</button>
    </form>
  </section>
}
