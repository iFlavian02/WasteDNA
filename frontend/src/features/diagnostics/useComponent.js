import { useEffect, useState } from 'react'
import { isSettled } from './logic.js'

const POLL_MS = 1500

/** Poll one dataset component until it settles, fails, or the component unmounts. */
export function useComponent(api, datasetId, name) {
  const [attempt, setAttempt] = useState(0)
  const key = `${datasetId}/${name}/${attempt}`
  const [state, setState] = useState({ key: null, envelope: null, error: null })

  useEffect(() => {
    let cancelled = false
    let timer = null
    const load = async () => {
      try {
        const envelope = await api.request(`/api/datasets/${encodeURIComponent(datasetId)}/${name}`)
        if (cancelled) return
        setState({ key, envelope, error: null })
        if (!isSettled(envelope)) timer = setTimeout(load, POLL_MS)
      } catch (error) {
        if (!cancelled) setState({ key, envelope: null, error })
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, datasetId, name, key])

  const current = state.key === key ? state : { envelope: null, error: null }
  return {
    envelope: current.envelope,
    error: current.error,
    retry: () => setAttempt(value => value + 1),
  }
}
