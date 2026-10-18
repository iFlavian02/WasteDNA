import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 1500

/** Load a dataset resource and poll until its envelope reaches a terminal state. */
export function useDatasetResource(api, datasetId, path, isDone) {
  const [attempt, setAttempt] = useState(0)
  const resource = datasetId ? `${datasetId}${path}` : null
  const key = resource ? `${resource}#${attempt}` : null
  const [state, setState] = useState({ key: null, resource: null, data: null, error: null })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    let timer = null
    const load = async () => {
      try {
        const data = await api.request(`/api/datasets/${encodeURIComponent(datasetId)}${path}`)
        if (cancelled) return
        setState({ key, resource, data, error: null })
        if (!isDone(data)) timer = setTimeout(load, POLL_MS)
      } catch (error) {
        if (!cancelled) setState({ key, resource, data: null, error })
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
    // isDone is a stable module-level predicate supplied by callers.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [api, datasetId, path, key, resource])

  const current = state.key === key ? state : state.resource === resource ? { data: state.data, error: null } : { data: null, error: null }
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return { data: current.data, error: current.error, retry }
}
