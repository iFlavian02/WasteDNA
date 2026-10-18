import { useMemo } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/States.jsx'
import { redistributionApi } from './api.js'
import { useDirectory } from './hooks.js'
import { Forecasts } from './pages/Forecasts.jsx'
import { Impact } from './pages/Impact.jsx'
import { OfferDetail } from './pages/OfferDetail.jsx'
import { OfferForm } from './pages/OfferForm.jsx'
import { OffersList } from './pages/OffersList.jsx'
import { Reservations } from './pages/Reservations.jsx'
import './redistribution.css'

const TABS = [
  ['', 'Offers'],
  ['new', 'New offer'],
  ['reservations', 'Reservations & pickup'],
  ['impact', 'Impact'],
  ['forecasts', 'Forecasts'],
]

/**
 * Redistribution feature, mounted by the shell at `/redistribution/*`.
 * Props from member 1's shell: `api` (shared client), `sessionId` (demo
 * session, persisted by the shell) and optional `prefill`
 * `{ category, description }` from member 4's actions screen.
 */
export default function RedistributionPage({ api, sessionId, prefill }) {
  const client = useMemo(() => redistributionApi(api), [api])
  const directory = useDirectory(client, sessionId)
  const location = useLocation()
  // React Router v7 resolves relative links in a splat route against the full
  // URL, so links outside the nested <Routes> use the feature's mount path.
  const splat = useParams()['*'] || ''
  const base = location.pathname.slice(0, location.pathname.length - splat.length).replace(/\/$/, '')
  const offersIndex = splat === ''

  if (prefill && offersIndex) return <Navigate to={`${base}/new`} replace state={{ prefill }} />

  return <div className={`rd${offersIndex ? ' rd--orders' : ''}`}>
    {!offersIndex && <>
      <p className="rd-synthetic">Demo with synthetic donors and organizations. You can act as any donor or organization; in a real pilot each role signs in separately.</p>
      <nav className="rd-tabs" aria-label="Redistribution sections">
        {TABS.map(([to, label]) => <NavLink key={label} to={to ? `${base}/${to}` : base} end={to === ''}>{label}</NavLink>)}
      </nav>
    </>}
    {directory.error ? <ErrorState error={directory.error} onRetry={directory.reload} />
      : !directory.data ? <LoadingState label="Loading donors and organizations…" />
        : <Routes>
          <Route index element={<OffersList client={client} directory={directory.data} />} />
          <Route path="new" element={<OfferForm client={client} directory={directory.data} prefill={prefill} />} />
          <Route path="offers/:offerId" element={<OfferDetail client={client} directory={directory.data} />} />
          <Route path="reservations" element={<Reservations client={client} directory={directory.data} />} />
          <Route path="impact" element={<Impact client={client} directory={directory.data} />} />
          <Route path="forecasts" element={<Forecasts client={client} directory={directory.data} />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>}
  </div>
}
