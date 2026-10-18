import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api/client.js'
import { createDatasetController, isMissingDataset } from './api/dataset.js'
import { createSessionController } from './api/session.js'
import { brand } from './brand.js'
import Icon from './components/Icon.jsx'
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx'
import Dashboard from './features/dashboard/Dashboard.jsx'
import { activeNavigation } from './features/dashboard/data.js'
import Upload from './features/platform/Upload.jsx'
import Summary from './features/platform/Summary.jsx'
import './App.css'

const DiagnosticsPage = lazy(() => import('./features/diagnostics/index.jsx'))
const DecisionsPage = lazy(() => import('./features/decisions/index.jsx'))
const RedistributionPage = lazy(() => import('./features/redistribution/index.jsx'))

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'overview', to: '/' },
  { id: 'categories', label: 'Categories', icon: 'categories', to: '/diagnostics' },
  { id: 'goals', label: 'My goals', icon: 'goals', to: '/decisions/actions' },
  { id: 'tracked', label: 'Tracked items', icon: 'tracked', to: '/redistribution' },
  { id: 'settings', label: 'Settings', icon: 'settings', to: '/upload' },
]

function Brand({ compact = false }) {
  return <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label={`${brand.name} home`}>
    {compact
      ? <><span className="brand-mini"><img src={brand.logoSrc} alt="" /></span><span><strong>{brand.name}</strong><small>{brand.tagline}</small></span></>
      : <span className="brand-logo-card"><img src={brand.logoSrc} alt="WiseEat" /></span>}
  </Link>
}

function Sidebar({ open, onClose }) {
  const { pathname } = useLocation()
  const active = activeNavigation(pathname)
  return <>
    {open && <button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-main">
        <div className="sidebar-brand-row"><Brand /><button type="button" className="sidebar-close" aria-label="Close navigation" onClick={onClose}><Icon name="close" /></button></div>
        <div className="property-select"><span>Property</span><button type="button">Hotel Luc Berlin <Icon name="chevronDown" size={13} /></button></div>
        <nav>
          {navigation.map(item => <Link key={item.id} to={item.to} className={active === item.id ? 'active' : ''} onClick={onClose}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
          <Link to="/help" onClick={onClose}><Icon name="help" /><span>Help</span></Link>
        </nav>
        <div className="workspace-shortcuts">
          <span>Data workspace</span>
          <Link to="/summary" onClick={onClose}>Dataset summary</Link>
          <Link to="/upload" onClick={onClose}><Icon name="upload" size={15} /> Import data</Link>
        </div>
      </div>
      <footer><div><button className="selected" type="button">EN</button><i /> <button type="button">DE</button><i /> <button type="button">FR</button></div><span>v2.4.1</span></footer>
    </aside>
  </>
}

function HelpPage() {
  return <section className="platform-page"><h1>Help</h1><p>Use <strong>Import data</strong> to analyze a restaurant dataset, or explore the dashboard with the February 2025 presentation data.</p><p>Diagnostics explains recurring surplus, My goals contains recommended actions, and Tracked items opens redistribution workflows.</p></section>
}

function Topbar({ onMenu }) {
  return <header className="app-header">
    <button type="button" className="menu-button" aria-label="Open navigation" onClick={onMenu}><Icon name="menu" /></button>
    <div className="mobile-brand"><Brand compact /></div>
    <div className="desktop-filters" aria-label="Dashboard filters">
      <button type="button"><span>Period</span><strong>Month <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button"><span>Date</span><strong><Icon name="chevronLeft" size={11} /> February 2025 <Icon name="chevronRight" size={11} /></strong></button><i />
      <button type="button"><span>Compare to</span><strong>Base month <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button" className="edible"><span>Waste type</span><strong><b /> Edible <Icon name="chevronDown" size={11} /></strong></button><i />
      <button type="button"><span>Device</span><strong>Hotel Luc (Main Scale) <Icon name="chevronDown" size={11} /></strong></button>
    </div>
    <div className="profile-actions">
      <button type="button" className="notification-button" aria-label="Notifications"><Icon name="bell" size={20} /><i /></button>
      <span className="profile-divider" />
      <button type="button" className="profile"><b>MA</b><span><strong>M. Albrecht</strong><small>Executive Chef</small></span></button>
    </div>
  </header>
}

function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
  const redistribution = sessionError
    ? <ErrorState error={sessionError} onRetry={() => session.ensure().then(id => { setSessionId(id); setSessionError(null) }).catch(setSessionError)} />
    : !sessionId ? <LoadingState label="Starting demo session…" />
      : <Suspense fallback={<LoadingState />}><RedistributionPage api={api} sessionId={sessionId} prefill={location.state?.prefill || null} /></Suspense>

  return <div className="app-shell">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="app-column">
      <Topbar onMenu={() => setSidebarOpen(true)} />
      <main id="main-content" className="app-content">
        {resetNotice && <div role="status" className="notice">The demo session was reset. Previous donation data is no longer available. <button type="button" onClick={() => setResetNotice(false)}>Dismiss</button></div>}
        {datasetNotice && <div role="status" className="notice">The selected dataset is no longer available. Upload a CSV or load the demo again. <button type="button" onClick={() => setDatasetNotice(false)}>Dismiss</button></div>}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload api={api} onSelect={datasetController.save} />} />
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

export default function App() { return <BrowserRouter><Shell /></BrowserRouter> }
