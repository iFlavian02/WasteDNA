import { useEffect, useState } from 'react'

const POLL_MS = 1500

/**
 * Load `GET /api/datasets/{datasetId}{path}` and poll every 1.5 s until
 * `isDone(payload)` is true. Polling stops on errors and unmount, and a
 * previous dataset's payload is never shown for the current one.
 *
 * Returns `{ data, error, retry }`. `path` is '' for the status record or
 * '/summary', '/recommendations', … for a component envelope.
 */
export function useDatasetResource(api, datasetId, path, isDone) {
  const [attempt, setAttempt] = useState(0)
  const key = datasetId ? `${datasetId}${path}#${attempt}` : null
  const [state, setState] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    let timer = null
    const load = async () => {
      try {
        const data = await api.request(`/api/datasets/${encodeURIComponent(datasetId)}${path}`)
        if (cancelled) return
        setState({ key, data, error: null })
        if (!isDone(data)) timer = setTimeout(load, POLL_MS)
      } catch (error) {
        if (!cancelled) setState({ key, data: null, error })
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
    // `isDone` is a module-level predicate supplied by callers.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [api, datasetId, path, key])

  const current = state.key === key ? state : { data: null, error: null }
  return { data: current.data, error: current.error, retry: () => setAttempt(value => value + 1) }
}
