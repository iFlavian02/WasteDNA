import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createDatasetController, isMissingDataset } from './api/dataset.js'
import { createSessionController } from './api/session.js'
import Icon from './components/Icon.jsx'
import { Brand, Sidebar } from './components/Sidebar.jsx'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import { accountForPath, readAccount } from './features/accounts/accounts.js'
import Home from './features/accounts/Home.jsx'
import Dashboard from './features/dashboard/Dashboard.jsx'
import Upload from './features/platform/Upload.jsx'
import Summary from './features/platform/Summary.jsx'
import './App.css'

const DiagnosticsPage = lazy(() => import('./features/diagnostics/index.jsx'))
const DecisionsPage = lazy(() => import('./features/decisions/index.jsx'))
const RedistributionPage = lazy(() => import('./features/redistribution/index.jsx'))
const PersonalPage = lazy(() => import('./features/personal/index.jsx'))

// One demo session for both accounts, seeded with the Iași restaurants of the
// customer map (docs/PERSONAL_MAP.md). Its own key, so sessions created
// before the map existed are not reused.
const DEMO_START_PATH = '/api/redistribution/demo?marketplace=true'
const DEMO_SESSION_KEY = 'wiseeat-demo-session-id'

function HelpPage() {
  return <section className="platform-page"><h1>Help</h1><p>Use <strong>Import data</strong> to analyze a restaurant dataset, or explore the dashboard with the February 2025 presentation data.</p><p>Diagnostics explains recurring surplus, My goals contains recommended actions, and Tracked items opens redistribution workflows.</p></section>
}

function Topbar({ onMenu, account }) {
  return <header className="app-header">
    <button type="button" className="menu-button" aria-label="Open navigation" onClick={onMenu}><Icon name="menu" /></button>
    <div className="mobile-brand"><Brand compact to={account.home} /></div>
    {account.id === 'business' ? <div className="desktop-filters" aria-label="Dashboard filters">
      <button type="button"><span>Period</span><strong>Month <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button"><span>Date</span><strong><Icon name="chevronLeft" size={11} /> February 2025 <Icon name="chevronRight" size={11} /></strong></button><i />
      <button type="button"><span>Compare to</span><strong>Base month <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button" className="edible"><span>Waste type</span><strong><b /> Edible <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button"><span>Device</span><strong>Trattoria Unirii (Main Scale) <Icon name="chevronDown" size={11} /></strong></button>
    </div> : <div className="topbar-spacer" />}
    <div className="profile-actions">
      <button type="button" className="notification-button" aria-label="Notifications"><Icon name="bell" size={20} /><i /></button>
      <span className="profile-divider" />
      <div className={`profile profile--${account.id}`}><b aria-hidden="true">{account.initials}</b><span><strong>{account.name}</strong><small>{account.role}</small></span></div>
      <Link to="/" className="switch-account" title="Switch account"><Icon name="switch" size={16} /><span>Switch account</span></Link>
    </div>
  </header>
}

/** Account guard: no account → home menu; the other account's pages → own home. */
function AccountShell() {
  const { pathname } = useLocation()
  const account = readAccount(localStorage)
  if (!account) return <Navigate to="/" replace />
  const owner = accountForPath(pathname)
  if (owner && owner !== account.id) return <Navigate to={account.home} replace />
  return <Shell account={account} />
}

function Shell({ account }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [sessionError, setSessionError] = useState(null)
  const [resetNotice, setResetNotice] = useState(false)
  // Read the saved choice synchronously so pages don't flash their "no data" state; the effect below re-verifies it.
  const [dataset, setDataset] = useState(() => createDatasetController({ storage: localStorage, onChange: () => {} }).read())
  const [datasetNotice, setDatasetNotice] = useState(false)
  const datasetController = useMemo(() => createDatasetController({ storage: localStorage, onChange: setDataset }), [])
  const session = useMemo(() => {
    let controller
    const client = createClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || '', getSessionId: () => controller?.getSessionId() })
    controller = createSessionController({ client, startPath: DEMO_START_PATH, key: DEMO_SESSION_KEY, onReset: () => {
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
  const withSession = render => sessionError
    ? <ErrorState error={sessionError} onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} />
    : !sessionId ? <LoadingState label="Starting demo session…" />
      : <Suspense fallback={<LoadingState />}>{render()}</Suspense>
  const redistribution = withSession(() => <RedistributionPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} />)
  const ordersLayout = account.id === 'business' && location.pathname.startsWith('/redistribution')

  return <div className="app-shell">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} account={account} />
    <div className={`app-column${ordersLayout ? ' app-column--orders' : ''}`}>
      <Topbar onMenu={() => setSidebarOpen(true)} account={account} />
      <main id="main-content" className={`app-content${ordersLayout ? ' app-content--orders' : ''}`}>
        {resetNotice && <div role="status" className="notice">The demo session was reset. Previous donation data is no longer available. <button type="button" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
        {datasetNotice && <div role="status" className="notice">The selected dataset is no longer available. Upload a CSV or load the demo again. <button type="button" onClick={() => setDatasetNotice(false)}>Dismiss</button></div>}
        <Routes>
          <Route path="/dashboard" element={<Dashboard api={api} dataset={dataset} onSelect={datasetController.save} />} />
          <Route path="/personal/*" element={withSession(() => <PersonalPage api={api} sessionId={sessionId} />)} />
          <Route path="/upload" element={<Upload api={api} dataset={dataset} onSelect={datasetController.save} />} />
          <Route path="/summary" element={<Summary api={api} dataset={dataset} />} />
          <Route path="/diagnostics/*" element={feature(DiagnosticsPage)} />
          <Route path="/decisions/*" element={feature(DecisionsPage)} />
          <Route path="/redistribution/*" element={redistribution} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<EmptyState title="Page not found" />} />
        </Routes>
      </main>
    </div>
  </div>
}

export default function App() {
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<AccountShell />} />
    </Routes>
  </BrowserRouter>
}
