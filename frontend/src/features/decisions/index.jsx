import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Actions from './Actions.jsx'
import Report from './Report.jsx'
import Simulator from './Simulator.jsx'
import './decisions.css'

/**
 * Member 4 feature: actions, what-if simulator and printable report.
 * The shell mounts it at `/decisions/*` with `{ api, datasetId, isSynthetic }`.
 */
export default function DecisionsPage({ api, datasetId, isSynthetic }) {
  // Relative links inside a splat route resolve from the full URL in React Router v7,
  // so sub-pages link from an explicit base (`/decisions`, wherever the shell mounts us).
  const { pathname } = useLocation()
  const rest = useParams()['*'] || ''
  const base = pathname.slice(0, pathname.length - rest.length).replace(/\/$/, '')
  const props = { api, datasetId, isSynthetic, base }
  return <Routes>
    <Route element={<Layout isSynthetic={isSynthetic} base={base} />}>
      <Route index element={<Navigate to={`${base}/actions`} replace />} />
      <Route path="actions" element={<Actions {...props} />} />
      <Route path="simulator" element={<Simulator {...props} />} />
      <Route path="report" element={<Report {...props} />} />
      <Route path="*" element={<Navigate to={`${base}/actions`} replace />} />
    </Route>
  </Routes>
}

function Layout({ isSynthetic, base }) {
  return <div className="decisions">
    <div className="decisions-bar decisions-noprint">
      <nav aria-label="Decisions" className="decisions-tabs">
        <NavLink to={`${base}/actions`}>Actions</NavLink>
        <NavLink to={`${base}/simulator`}>Simulator</NavLink>
        <NavLink to={`${base}/report`}>Report</NavLink>
      </nav>
      {isSynthetic && <span className="decisions-badge">Simulated sales</span>}
    </div>
    <Outlet />
  </div>
}
