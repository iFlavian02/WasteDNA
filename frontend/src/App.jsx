import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createDatasetController, isMissingDataset } from './api/dataset.js'
import { createSessionController } from './api/session.js'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import Upload from './features/platform/Upload.jsx'
import Summary from './features/platform/Summary.jsx'
import './App.css'

const DiagnosticsPage = lazy(() => import('./features/diagnostics/index.jsx'))
const DecisionsPage = lazy(() => import('./features/decisions/index.jsx'))
const RedistributionPage = lazy(() => import('./features/redistribution/index.jsx'))

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
        navigate('/upload')
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
        if (isMissingDataset(error)) { datasetController.clear(); setDatasetNotice(true); navigate('/upload') }
        else setDataset(saved)
      })
  }, [datasetController, session, navigate])

  const feature = Page => dataset
    ? <Suspense fallback={<LoadingState />}><Page api={api} datasetId={dataset.dataset_id} isSynthetic={dataset.is_synthetic} /></Suspense>
    : <section className="platform-page"><EmptyState title="Choose a dataset" description="Upload a CSV or load demo data to continue." /><Link to="/upload">Go to upload</Link></section>

  return <div className="app-shell">
    <header className="app-header"><Link to="/" className="brand">WasteDNA</Link><nav aria-label="Main navigation"><Link to="/upload">Upload</Link><Link to="/summary">Summary</Link><Link to="/diagnostics">Diagnostics</Link><Link to="/decisions/actions">Actions</Link><Link to="/redistribution">Redistribution</Link></nav></header>
    <main>
      {resetNotice && <div role="status" className="notice">The demo session was reset. Previous donation data is no longer available. <button type="button" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
      {datasetNotice && <div role="status" className="notice">The selected dataset is no longer available. Upload a CSV or load the demo again. <button type="button" onClick={() => setDatasetNotice(false)}>Dismiss</button></div>}
      {sessionError ? <ErrorState error={sessionError} onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} /> : !sessionId ? <LoadingState label="Starting demo session…" /> : <Routes>
        <Route path="/" element={<Navigate to={dataset ? '/summary' : '/upload'} replace />} />
        <Route path="/upload" element={<Upload api={api} onSelect={datasetController.save} />} />
        <Route path="/summary" element={<Summary api={api} dataset={dataset} />} />
        <Route path="/diagnostics/*" element={feature(DiagnosticsPage)} />
        <Route path="/decisions/*" element={feature(DecisionsPage)} />
        <Route path="/redistribution/*" element={<Suspense fallback={<LoadingState />}><RedistributionPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} /></Suspense>} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Routes>}
    </main>
  </div>
}

export default function App() { return <BrowserRouter><Shell /></BrowserRouter> }
