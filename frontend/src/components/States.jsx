import { Inbox, RefreshCw, TriangleAlert } from 'lucide-react'

/** Shared view states. Props are unchanged from the first shell; see docs/UI.md. */
export function LoadingState({ label = 'Loading…' }) {
  return <div role="status" className="we-loading"><span className="we-spinner" aria-hidden="true" />{label}</div>
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return <div role="alert" className="we-state we-state--error">
    <span className="we-state-icon" aria-hidden="true"><TriangleAlert /></span>
    <h2>{title}</h2>
    <p>{error?.message || 'Please try again in a moment.'}</p>
    {onRetry && <div className="we-state-actions"><button type="button" className="we-btn we-btn--secondary" onClick={onRetry}><RefreshCw aria-hidden="true" />Try again</button></div>}
  </div>
}

/**
 * Empty view with an optional next step. `icon` is a lucide component and
 * `children` holds actions (links or buttons).
 */
export function EmptyState({ title = 'No results yet', description, icon: Icon = Inbox, children }) {
  return <section className="we-state">
    <span className="we-state-icon" aria-hidden="true"><Icon /></span>
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {children && <div className="we-state-actions">{children}</div>}
  </section>
}
