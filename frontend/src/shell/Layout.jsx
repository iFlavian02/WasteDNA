import { ChartLine, Database, FlaskConical, LayoutDashboard, Lightbulb, Map, ShoppingBag, Store, Tag, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from '../brand/Logo.jsx'
import { NAV_ITEMS, ROLES, roleFor } from './navigation.js'

const ICONS = { ChartLine, Database, LayoutDashboard, Lightbulb, Map, ShoppingBag, Tag }

/**
 * App frame: sidebar and top bar on wide screens; compact top bar plus bottom
 * tab bar on phones. The role follows the URL, so the switch is two links.
 */
export function Layout({ dataset, notices, children }) {
  const { pathname } = useLocation()
  const role = roleFor(pathname)
  const items = NAV_ITEMS[role]
  const { user } = ROLES[role]

  return <div className="we-app">
    <a className="we-skip" href="#we-main">Skip to content</a>
    <aside className="we-sidebar">
      <Link to={ROLES[role].home} className="we-sidebar-brand" aria-label="WiseEat home">
        <span className="we-brand-wide"><Logo tone="onDark" size={42} tagline /></span>
        <span className="we-brand-compact"><Logo tone="onDark" size={30} /></span>
      </Link>
      <nav className="we-sidebar-nav" aria-label="Main">
        {items.map(item => <NavItem key={item.to} item={item} />)}
      </nav>
      <div className="we-sidebar-bottom">
        <span className="we-sidebar-label" aria-hidden="true">Viewing as</span>
        <RoleSwitch role={role} />
        <p className="we-sidebar-note"><FlaskConical aria-hidden="true" />Demo mode with synthetic data</p>
      </div>
    </aside>
    <div className="we-body">
      <header className="we-topbar">
        <div className="we-topbar-context">
          {role === 'business' && dataset?.is_synthetic && <span className="we-badge we-badge--warning">Simulated sales</span>}
        </div>
        <div className="we-user">
          <span className="we-avatar" aria-hidden="true">{user.initials}</span>
          <span className="we-user-text"><strong>{user.name}</strong><span>{user.subtitle}</span></span>
        </div>
      </header>
      <main id="we-main" className="we-main" tabIndex={-1}>
        <div className="we-content">
          {notices}
          {children}
        </div>
      </main>
    </div>
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
