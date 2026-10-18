import { useCallback, useEffect, useState } from 'react'
import { SALE_CATEGORIES } from './logic.js'

/**
 * Load data and expose `{ data, error, loading, reload }`. `deps` works like
 * useEffect's dependency list for `load`. Responses that arrive after the
 * deps changed or the component unmounted are ignored, so StrictMode double
 * effects and fast navigation cannot show stale data. Previous data stays
 * visible while a refresh is in flight.
 */
export function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    load().then(
      data => { if (active) setState({ data, error: null, loading: false }) },
      error => { if (active) setState(previous => ({ ...previous, error, loading: false })) },
    )
    return () => { active = false }
    // The caller lists what `load` depends on, exactly like useEffect deps.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => {
    setState(previous => ({ ...previous, loading: true }))
    setNonce(value => value + 1)
  }, [])

  return { ...state, reload }
}

/** Selling locations for business Orders. No charity directory is loaded. */
export function useDirectory(client, sessionId) {
  return useLoad(async () => {
    const donors = (await client.donors()).filter(donor => donor.type !== 'household')
    return {
      donors,
      donorById: new Map(donors.map(donor => [donor.id, donor])),
      categories: SALE_CATEGORIES,
    }
  }, [client, sessionId])
}
