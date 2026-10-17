import { useCallback, useEffect, useState } from 'react'

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

/** Donors and organizations of the session, as Maps by ID plus arrays. */
export function useDirectory(client, sessionId) {
  return useLoad(async () => {
    const [donors, organizations] = await Promise.all([client.donors(), client.organizations()])
    return {
      donors,
      organizations,
      donorById: new Map(donors.map(donor => [donor.id, donor])),
      organizationById: new Map(organizations.map(org => [org.id, org])),
      categories: [...new Set(organizations.flatMap(org => org.accepted_categories))].sort(),
    }
  }, [client, sessionId])
}
