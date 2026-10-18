import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Compass, Upload as UploadIcon } from 'lucide-react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createDatasetController, isMissingDataset } from './api/dataset.js'
import { createSessionController } from './api/session.js'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import Upload from './features/platform/Upload.jsx'
import Summary from './features/platform/Summary.jsx'
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
  const api = useMemo(() => ({ request: async (path, options) => {
    try { return await session.request(path, options) }
    catch (error) {
      if (path.startsWith('/api/datasets/') && isMissingDataset(error) && datasetController.read()?.dataset_id === dataset?.dataset_id) {
        datasetController.clear()
        setDatasetNotice(true)
        navigate('/business')
      }
      throw error
    }
  } }), [session, datasetController, dataset, navigate])

  useEffect(() => {
    session.ensure().then(setSessionId).catch(setSessionError)
  }, [session])
  useEffect(() => {
    const saved = datasetController.read()
    if (!saved) return
    session.request(`/api/datasets/${encodeURIComponent(saved.dataset_id)}`)
      .then(record => datasetController.save(record))
      .catch(error => {
        if (isMissingDataset(error)) { datasetController.clear(); setDatasetNotice(true); navigate('/business') }
        else setDataset(saved)
      })
  }, [datasetController, session, navigate])

  const lazyPage = element => <Suspense fallback={<LoadingState />}>{element}</Suspense>
  const feature = Page => dataset
    ? lazyPage(<Page api={api} datasetId={dataset.dataset_id} isSynthetic={dataset.is_synthetic} />)
    : <EmptyState icon={UploadIcon} title="Choose a dataset first" description="Upload your sales CSV or try the demo data to see insights and actions."><Link className="we-btn we-btn--primary" to="/business">Go to the dashboard</Link></EmptyState>

  const notices = <>
    {resetNotice && <div role="status" className="we-notice">The demo session was reset, so earlier deals and pickups are gone. <button type="button" className="we-btn we-btn--ghost" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
    {datasetNotice && <div role="status" className="we-notice">The selected dataset is no longer available. Upload a CSV or load the demo again. <button type="button" className="we-btn we-btn--ghost" onClick={() => setDatasetNotice(false)}>Dismiss</button></div>}
  </>

  return <Layout dataset={dataset} notices={notices}>
    {sessionError ? <ErrorState error={sessionError} title="Could not start the demo" onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} />
      : !sessionId ? <LoadingState label="Starting the demo…" />
        : <Routes>
          <Route path="/" element={<Navigate to="/business" replace />} />
          <Route path="/business" element={dataset ? <Summary api={api} dataset={dataset} /> : <Upload api={api} onSelect={datasetController.save} />} />
          <Route path="/business/upload" element={<Upload api={api} onSelect={datasetController.save} />} />
          <Route path="/business/deals/*" element={lazyPage(<DealsPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} />)} />
          <Route path="/business/insights/*" element={feature(DiagnosticsPage)} />
          <Route path="/business/actions/*" element={feature(DecisionsPage)} />
          <Route path="/map/*" element={lazyPage(<MapPage api={api} sessionId={sessionId} />)} />
          <Route path="/my-pickups" element={lazyPage(<MyPickupsPage api={api} sessionId={sessionId} />)} />
          {['/upload', '/summary', '/diagnostics/*', '/decisions/*', '/redistribution/*'].map(path => <Route key={path} path={path} element={<LegacyRedirect />} />)}
          <Route path="*" element={<EmptyState icon={Compass} title="Page not found" description="This page does not exist or has moved."><Link className="we-btn we-btn--primary" to="/business">Back to the dashboard</Link></EmptyState>} />
        </Routes>}
  </Layout>
}

export default function App() { return <BrowserRouter><Shell /></BrowserRouter> }
