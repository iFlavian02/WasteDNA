import { useEffect, useState } from 'react'
import { isSettled } from './logic.js'

const POLL_MS = 1500

/**
 * Load `GET /api/datasets/{datasetId}/{name}` and poll while it is queued/running.
 * Polling stops on a terminal state, an error, or unmount. Replace with the shell's
 * shared helper if member 1 publishes one (docs/fixtures/decisions/REQUESTS.md).
 */
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

  // Results of a previous dataset/component are never shown for the current one.
  const current = state.key === key ? state : { envelope: null, error: null }
  return { envelope: current.envelope, error: current.error, retry: () => setAttempt(value => value + 1) }
}
