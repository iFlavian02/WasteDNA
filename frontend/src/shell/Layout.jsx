import { useState } from 'react'
import { Database, FlaskConical, LayoutDashboard, Lightbulb, Map, ShoppingBag, Store, Tag, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from '../brand/Logo.jsx'
import { NAV_ITEMS, ROLES, roleFor, sectionFor } from './navigation.js'
import { TopbarContext } from './topbarContext.js'

const ICONS = { Database, LayoutDashboard, Lightbulb, Map, ShoppingBag, Tag }

/**
 * App frame. Wide screens: the phthalo-green sidebar with every page on the
 * left, and the top bar above the content to its right. Phones: compact brand
 * bar on top, top bar below it and a bottom tab bar. The role follows the URL.
 */
export function Layout({ notices, children }) {
  const { pathname } = useLocation()
  const role = roleFor(pathname)
  const items = NAV_ITEMS[role]
  const { user } = ROLES[role]
  const [slot, setSlot] = useState(null)

  return <TopbarContext.Provider value={slot}>
    <div className="we-app">
      <a className="we-skip" href="#we-main">Skip to content</a>
      <aside className="we-sidebar">
        <Link to={ROLES[role].home} className="we-sidebar-brand" aria-label="WiseEat home">
          <span className="we-brand-wide"><Logo tone="onDark" size={40} tagline /></span>
          <span className="we-brand-compact"><Logo tone="onDark" size={30} /></span>
        </Link>
        <div className="we-venue">
          <strong>{user.name}</strong>
          <span>{user.subtitle}</span>
        </div>
        <nav className="we-sidebar-nav" aria-label="Main">
          {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} className="we-nav-link">{item.label}</NavLink>)}
        </nav>
        <div className="we-sidebar-bottom">
          <span className="we-sidebar-label" aria-hidden="true">Viewing as</span>
          <RoleSwitch role={role} />
          <p className="we-sidebar-note"><FlaskConical aria-hidden="true" />Demo mode with synthetic data</p>
        </div>
      </aside>
      <div className="we-body">
        <header className="we-topbar">
          <div className="we-topbar-main">
            <span className="we-topbar-title">{sectionFor(pathname)}</span>
            <div className="we-topbar-slot" ref={setSlot} />
          </div>
          <span className="we-avatar" title={`${user.name} · ${user.subtitle}`}>
            <span aria-hidden="true">{user.initials}</span><span className="we-visually-hidden">Signed in as {user.name}</span>
          </span>
        </header>
        <main id="we-main" className="we-main" tabIndex={-1}>
          <div className="we-content">
            {notices}
            {children}
          </div>
        </main>
      </div>
      <nav className="we-tabbar" aria-label="Main">
        {items.map(item => {
          const Icon = ICONS[item.icon]
          return <NavLink key={item.to} to={item.to} end={item.end} className="we-nav-link"><Icon aria-hidden="true" /><span>{item.label}</span></NavLink>
        })}
      </nav>
    </div>
  </TopbarContext.Provider>
}

function RoleSwitch({ role }) {
  return <nav className="we-role-switch" aria-label="Switch view">
    {Object.entries(ROLES).map(([key, value]) => <Link key={key} to={value.home} aria-current={key === role ? 'true' : undefined} className={key === role ? 'is-active' : undefined}>
      {key === 'business' ? <Store aria-hidden="true" /> : <UserRound aria-hidden="true" />}{value.label}
    </Link>)}
  </nav>
}
