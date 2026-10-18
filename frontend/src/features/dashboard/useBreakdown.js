import { useEffect, useState } from 'react'

/** Load the dashboard breakdown while retaining the previous successful result. */
export function useBreakdown(api, datasetId, query) {
  const search = query ? new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString() : null
  const key = datasetId && search !== null ? `${datasetId}?${search}` : null
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    api.request(`/api/datasets/${encodeURIComponent(datasetId)}/breakdown${search ? `?${search}` : ''}`)
      .then(data => { if (!cancelled) setState({ key, data, error: null }) })
      .catch(error => { if (!cancelled) setState(previous => ({ key, data: previous.data, error })) })
    return () => { cancelled = true }
  }, [api, datasetId, key, search, attempt])

  if (!key) return { data: null, error: null, loading: false, retry: () => {} }
  return { data: state.data, error: state.key === key ? state.error : null, loading: state.key !== key, retry: () => setAttempt(value => value + 1) }
}
