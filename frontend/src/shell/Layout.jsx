import { ChartLine, Database, LayoutDashboard, Lightbulb, Map, ShoppingBag, Store, Tag, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from '../brand/Logo.jsx'
import { NAV_ITEMS, ROLES, roleFor } from './navigation.js'

const ICONS = { ChartLine, LayoutDashboard, Lightbulb, Map, ShoppingBag, Tag }

/**
 * App frame: sidebar on wide screens, top bar plus bottom tab bar on phones.
 * The role follows the URL, so the switch is two links and needs no state.
 */
export function Layout({ dataset, notices, children }) {
  const { pathname } = useLocation()
  const role = roleFor(pathname)
  const items = NAV_ITEMS[role]

  return <div className="we-app">
    <a className="we-skip" href="#we-main">Skip to content</a>
    <aside className="we-sidebar">
      <Link to={ROLES[role].home} className="we-sidebar-brand" aria-label="WiseEat home"><Logo tone="onDark" size={38} /></Link>
      <RoleSwitch role={role} />
      <nav className="we-sidebar-nav" aria-label="Main">
        {items.map(item => <NavItem key={item.to} item={item} />)}
      </nav>
      <SidebarFooter role={role} dataset={dataset} />
    </aside>
    <main id="we-main" className="we-main" tabIndex={-1}>
      <div className="we-content">
        {notices}
        {children}
      </div>
    </main>
    <nav className="we-tabbar" aria-label="Main">
      {items.map(item => <NavItem key={item.to} item={item} />)}
    </nav>
  </div>
}

function NavItem({ item }) {
  const Icon = ICONS[item.icon]
  return <NavLink to={item.to} end={item.end} className="we-nav-link">
    <Icon aria-hidden="true" /><span>{item.label}</span>
  </NavLink>
}

function RoleSwitch({ role }) {
  return <nav className="we-role-switch" aria-label="Switch view">
    {Object.entries(ROLES).map(([key, value]) => <Link key={key} to={value.home} aria-current={key === role ? 'true' : undefined} className={key === role ? 'is-active' : undefined}>
      {key === 'business' ? <Store aria-hidden="true" /> : <UserRound aria-hidden="true" />}{value.label}
    </Link>)}
  </nav>
}

function SidebarFooter({ role, dataset }) {
  if (role === 'customer') {
    return <div className="we-sidebar-footer">
      <span className="we-avatar" aria-hidden="true">G</span>
      <div><strong>Guest</strong><span>Demo deals in Iași are synthetic</span></div>
    </div>
  }
  return <div className="we-sidebar-footer">
    <span className="we-avatar" aria-hidden="true"><Database /></span>
    <div>
      <strong>{dataset ? (dataset.is_synthetic ? 'Demo dataset' : 'Your dataset') : 'No dataset yet'}</strong>
      <span>{dataset ? (dataset.is_synthetic ? 'Simulated sales' : 'Uploaded CSV') : 'Upload a CSV to start'}</span>
      {dataset && <Link to="/business/upload">Change data</Link>}
    </div>
  </div>
}
