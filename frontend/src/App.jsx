import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createSessionController } from './api/session.js'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import './App.css'

const featureModules = import.meta.glob('./features/*/index.jsx')
const RedistributionPage = featureModules['./features/redistribution/index.jsx']
  ? lazy(featureModules['./features/redistribution/index.jsx'])
  : null

function Redistribution({ api, sessionId }) {
  const location = useLocation()
  if (!RedistributionPage) return <EmptyState title="Redistribution page is being built" description="The shared API and session are ready for the feature page." />
  return <Suspense fallback={<LoadingState />}><RedistributionPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} /></Suspense>
}

function Shell() {
  const [sessionId, setSessionId] = useState(null)
  const [sessionError, setSessionError] = useState(null)
  const [resetNotice, setResetNotice] = useState(false)
  const session = useMemo(() => {
    let controller
    const client = createClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || '', getSessionId: () => controller?.getSessionId() })
    controller = createSessionController({ client, onReset: () => {
      setSessionId(controller.getSessionId())
      setResetNotice(true)
    } })
    return controller
  }, [])

  useEffect(() => {
    session.ensure().then(setSessionId).catch(setSessionError)
  }, [session])

  const api = useMemo(() => ({ request: session.request }), [session])
  return <div className="app-shell">
    <header className="app-header"><Link to="/" className="brand">WasteDNA</Link><nav aria-label="Main navigation"><Link to="/">Home</Link><Link to="/redistribution">Redistribution</Link></nav></header>
    <main>
      {resetNotice && <div role="status" className="notice">The demo session was reset. Previous donation data is no longer available. <button type="button" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
      {sessionError ? <ErrorState error={sessionError} onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} /> : !sessionId ? <LoadingState label="Starting demo session…" /> : <Routes>
        <Route path="/" element={<section><h1>WasteDNA</h1><p>Explore food surplus and redistribution.</p><Link to="/redistribution">Open redistribution</Link></section>} />
        <Route path="/redistribution/*" element={<Redistribution api={api} sessionId={sessionId} />} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Routes>}
    </main>
  </div>
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>
}
