import { describeError, STATUS_LABELS } from './logic.js'

/** API error box with the common envelope's message and field details. */
export function ApiErrorBox({ error, onDismiss }) {
  if (!error) return null
  const { title, message, details } = describeError(error)
  return <div role="alert" className="rd-alert">
    <strong>{title}.</strong> {message}
    {details.length > 0 && <ul>{details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
    {onDismiss && <button type="button" className="rd-link" onClick={onDismiss}>Dismiss</button>}
  </div>
}

export function StatusBadge({ status }) {
  return <span className={`rd-badge rd-badge-${status}`}>{STATUS_LABELS[status] || status}</span>
}

/** Labelled form field with an inline error, wired for screen readers. */
export function Field({ id, label, error, hint, children }) {
  return <div className={`rd-field${error ? ' rd-field-error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    {error && <small id={`${id}-error`} className="rd-error-text">{error}</small>}
  </div>
}

export function Reasons({ reasons }) {
  return <ul className="rd-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
}

export function Limitations({ items }) {
  if (!items?.length) return null
  return <ul className="rd-limitations">{items.map(item => <li key={item}>{item}</li>)}</ul>
}
