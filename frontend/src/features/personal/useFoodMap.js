import { useEffect, useMemo, useRef, useState } from 'react'
import { redistributionApi } from '../redistribution/api.js'
import { useLoad } from '../redistribution/hooks.js'
import { placesFromOffers, placesWithNewOffers, POLL_MS } from './places.js'

const NEW_HIGHLIGHT_MS = 12000

/**
 * Donors and available offers of the demo session, refreshed every POLL_MS
 * (and when the tab regains focus), so an offer a business publishes appears
 * on the map without a reload. `fresh` holds the places that gained an offer
 * on the latest refresh, for a short highlight.
 */
export function useFoodMap(api, sessionId) {
  const client = useMemo(() => redistributionApi(api), [api])
  const { data, error, loading, reload } = useLoad(async () => {
    const [donors, offers] = await Promise.all([client.donors(), client.offers({ status: 'available' })])
    return { donors, offers, loadedAt: new Date(), sessionId }
  }, [client, sessionId])
  const places = useMemo(() => (data ? placesFromOffers(data.donors, data.offers, { now: data.loadedAt }) : []), [data])

  const seen = useRef(null)
  const [fresh, setFresh] = useState(() => new Set())
  useEffect(() => {
    if (!data) return undefined
    // A new session (first load or a reset) has nothing "new" to highlight.
    const before = seen.current?.sessionId === data.sessionId ? seen.current.ids : null
    const added = placesWithNewOffers(places, before)
    seen.current = { sessionId: data.sessionId, ids: new Set(data.offers.map(offer => offer.id)) }
    if (!added.size) return undefined
    setFresh(added)
    const timer = setTimeout(() => setFresh(new Set()), NEW_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [data, places])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') reload() }
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [reload])

  return {
    places,
    fresh,
    donors: data?.donors || [],
    offers: data?.offers || [],
    loadedAt: data?.loadedAt || null,
    ready: !!data,
    loading: loading && !data,
    error,
    reload,
  }
}
