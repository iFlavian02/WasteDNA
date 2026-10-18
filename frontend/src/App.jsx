import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Compass } from 'lucide-react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createDatasetController, isMissingDataset } from './api/dataset.js'
import { createSessionController } from './api/session.js'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import Dashboard from './features/platform/Dashboard.jsx'
import DataPage from './features/platform/DataPage.jsx'
import { Layout } from './shell/Layout.jsx'
import { legacyPath } from './shell/navigation.js'
import './App.css'

const DiagnosticsPage = lazy(() => import('./features/diagnostics/index.jsx'))
const DecisionsPage = lazy(() => import('./features/decisions/index.jsx'))
const DealsPage = lazy(() => import('./features/deals/index.jsx'))
const MapPage = lazy(() => import('./features/marketplace/index.jsx').then(module => ({ default: module.MapPage })))
const MyPickupsPage = lazy(() => import('./features/marketplace/index.jsx').then(module => ({ default: module.MyPickupsPage })))

/** Sends routes from before the redesign to their new paths, keeping state. */
function LegacyRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: legacyPath(location.pathname) || '/business', search: location.search }} state={location.state} replace />
}

function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sessionId, setSessionId] = useState(null)
  const [sessionError, setSessionError] = useState(null)
  const [resetNotice, setResetNotice] = useState(false)
  const [dataset, setDataset] = useState(null)
  const [datasetNotice, setDatasetNotice] = useState(false)
  const [connectError, setConnectError] = useState(null)
  const datasetController = useMemo(() => createDatasetController({ storage: localStorage, onChange: setDataset }), [])
  const session = useMemo(() => {
    let controller
    const client = createClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || '', getSessionId: () => controller?.getSessionId() })
    controller = createSessionController({ client, onReset: () => {
      setSessionId(controller.getSessionId())
      setResetNotice(true)
    } })
    return controller
  }, [])
  // The demo assumes WiseEat is connected to the restaurant's inventory: without
  // a selected dataset the shell connects (docs/INVENTORY.md). The backend reuses
  // the active connected dataset, so this never piles up datasets.
  const connecting = useRef(null)
  const connectInventory = useCallback(() => {
    // One request at a time, so StrictMode's double effects cannot connect twice.
    connecting.current ||= (async () => {
      setConnectError(null)
      try { return datasetController.save(await session.request('/api/inventory/connect', { method: 'POST' })) }
      catch (error) { setConnectError(error); return null }
      finally { connecting.current = null }
    })()
    return connecting.current
  }, [datasetController, session])
  // A missing uploaded file gets a notice; an expired connection just reconnects.
  const replaceMissing = useCallback(saved => {
    datasetController.clear()
    if (saved?.source !== 'inventory') setDatasetNotice(true)
    connectInventory()
  }, [datasetController, connectInventory])

  const api = useMemo(() => ({ request: async (path, options) => {
    try { return await session.request(path, options) }
    catch (error) {
      const saved = datasetController.read()
      if (path.startsWith('/api/datasets/') && isMissingDataset(error) && saved?.dataset_id === dataset?.dataset_id) {
        replaceMissing(saved)
        navigate('/business')
      }
      throw error
    }
  } }), [session, datasetController, dataset, navigate, replaceMissing])

  useEffect(() => {
    session.ensure().then(setSessionId).catch(setSessionError)
  }, [session])
  useEffect(() => {
    const saved = datasetController.read()
    if (!saved) { connectInventory(); return }
    session.request(`/api/datasets/${encodeURIComponent(saved.dataset_id)}`)
      .then(record => datasetController.save(record))
      .catch(error => {
        if (isMissingDataset(error)) replaceMissing(saved)
        else setDataset(saved)
      })
  }, [datasetController, session, connectInventory, replaceMissing])

  const lazyPage = element => <Suspense fallback={<LoadingState />}>{element}</Suspense>
  const feature = Page => dataset
    ? lazyPage(<Page api={api} datasetId={dataset.dataset_id} isSynthetic={dataset.is_synthetic} />)
    : connectError ? <ErrorState error={connectError} title="Could not reach your inventory" onRetry={connectInventory} />
      : <LoadingState label="Syncing with your inventory…" />

  const notices = <>
    {resetNotice && <div role="status" className="we-notice">The demo session was reset, so earlier deals and pickups are gone. <button type="button" className="we-btn we-btn--ghost" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
    {datasetNotice && <div role="status" className="we-notice">Your uploaded file is no longer available, so WiseEat switched back to your connected inventory. <button type="button" className="we-btn we-btn--ghost" onClick={() => setDatasetNotice(false)}>Dismiss</button></div>}
  </>

  return <Layout dataset={dataset} notices={notices}>
    {sessionError ? <ErrorState error={sessionError} title="Could not start the demo" onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} />
      : !sessionId ? <LoadingState label="Starting the demo…" />
        : <Routes>
          <Route path="/" element={<Navigate to="/business" replace />} />
          <Route path="/business" element={<Dashboard api={api} dataset={dataset} connectError={connectError} onConnect={connectInventory} />} />
          <Route path="/business/data" element={<DataPage api={api} dataset={dataset} onSelect={datasetController.save} onConnect={connectInventory} />} />
          <Route path="/business/deals/*" element={lazyPage(<DealsPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} />)} />
          <Route path="/business/insights/*" element={feature(DiagnosticsPage)} />
          <Route path="/business/actions/*" element={feature(DecisionsPage)} />
          <Route path="/map/*" element={lazyPage(<MapPage api={api} sessionId={sessionId} />)} />
          <Route path="/my-pickups" element={lazyPage(<MyPickupsPage api={api} sessionId={sessionId} />)} />
          {['/upload', '/business/upload', '/summary', '/diagnostics/*', '/decisions/*', '/redistribution/*'].map(path => <Route key={path} path={path} element={<LegacyRedirect />} />)}
          <Route path="*" element={<EmptyState icon={Compass} title="Page not found" description="This page does not exist or has moved."><Link className="we-btn we-btn--primary" to="/business">Back to the dashboard</Link></EmptyState>} />
        </Routes>}
  </Layout>
}

export default function App() { return <BrowserRouter><Shell /></BrowserRouter> }
