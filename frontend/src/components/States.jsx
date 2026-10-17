export function LoadingState({ label = 'Loading…' }) {
  return <p role="status">{label}</p>
}

export function ErrorState({ error, onRetry }) {
  return <div role="alert"><p>{error?.message || 'Something went wrong.'}</p>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>
}

export function EmptyState({ title = 'No results yet', description }) {
  return <section><h2>{title}</h2>{description && <p>{description}</p>}</section>
}
