import { useCallback, useEffect, useState } from 'react'

/**
 * Connection info for a connected inventory dataset (`GET /api/inventory/{id}`)
 * plus its two demo actions. Returns `{ info, busy, error, simulate, reset }`.
 * `onChanged()` runs after an action succeeds so pages can reload the summary
 * and restart analysis polling. Uploaded datasets have no info (`info` null).
 */
export function useInventory(api, dataset, onChanged) {
  const connected = dataset?.source === 'inventory'
  const id = dataset?.dataset_id
  const [state, setState] = useState({ id: null, info: null })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!connected) return undefined
    let cancelled = false
    api.request(`/api/inventory/${encodeURIComponent(id)}`)
      .then(info => { if (!cancelled) setState({ id, info }) })
      .catch(() => { if (!cancelled) setState({ id, info: null }) })
    return () => { cancelled = true }
  }, [api, connected, id])

  const run = useCallback(async (kind, path, body) => {
    setBusy(kind)
    setError(null)
    try {
      const info = await api.request(`/api/inventory/${encodeURIComponent(id)}/${path}`, { method: 'POST', body })
      setState({ id, info })
      onChanged?.()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }, [api, id, onChanged])

  return {
    info: connected && state.id === id ? state.info : null,
    busy,
    error,
    simulate: (days = 30) => run('simulate', 'simulate', { days }),
    reset: () => run('reset', 'reset'),
  }
}
