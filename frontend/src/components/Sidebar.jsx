import { Link, useLocation } from 'react-router-dom'
import { brand } from '../brand.js'
import { Logo } from '../brand/Logo.jsx'
import { activeNavigation } from '../features/dashboard/data.js'
import Icon from './Icon.jsx'
import { NAVIGATION } from './navigation.js'

export function Brand({ compact = false, to }) {
  return <Link className={`brand${compact ? ' brand--compact' : ''}`} to={to} aria-label={`${brand.name} home`}>
    {compact ? <Logo tone="onLight" size={30} /> : <Logo tone="onDark" size={40} tagline />}
  </Link>
}

/**
 * Primary navigation. On dashboards it is the full sidebar (an off-canvas
 * drawer on phones). The home menu uses `rail` (slim, logo only, no account
 * yet) and then `expanding` with the chosen account, which widens it to the
 * full sidebar and fades its menu in before the dashboard opens.
 */
export function Sidebar({ open = false, onClose = () => {}, account, rail = false, expanding = false, activeId }) {
  const { pathname } = useLocation()
  const active = activeId ?? activeNavigation(pathname)
  const business = account?.id === 'business'
  const classes = ['sidebar', open && 'sidebar--open', rail && 'sidebar--rail', expanding && 'sidebar--expanding'].filter(Boolean).join(' ')

  // One <aside> in every mode, so going from rail to full animates its width.
  return <>
    {open && !rail && <button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={classes} aria-label={rail ? brand.name : 'Primary navigation'}>
      {rail ? <>
        <div className="sidebar-main"><span className="brand-rail"><Logo tone="onDark" size={38} showName={false} /></span></div>
        <footer><span className="sidebar-rail-dot" aria-hidden="true" /></footer>
      </> : <>
      <div className="sidebar-main">
        <div className="sidebar-brand-row"><Brand to={account.home} /><button type="button" className="sidebar-close" aria-label="Close navigation" onClick={onClose}><Icon name="close" /></button></div>
        {business
          ? <div className="property-select"><span>Property</span><button type="button">{account.name} <Icon name="chevronDown" size={13} /></button></div>
          : <div className="property-select"><span>Account</span><div className="account-badge"><Icon name="user" size={14} />{account.name}</div></div>}
        <nav>
          {NAVIGATION[account.id].map(item => <Link key={item.id} to={item.to} className={active === item.id ? 'active' : ''} onClick={onClose}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
          <Link to="/help" onClick={onClose}><Icon name="help" /><span>Help</span></Link>
        </nav>
        {business && <div className="workspace-shortcuts">
          <span>Data workspace</span>
          <Link to="/summary" onClick={onClose}>Dataset summary</Link>
          <Link to="/upload" onClick={onClose}><Icon name="upload" size={15} /> Import data</Link>
        </div>}
      </div>
      <footer><div><button className="selected" type="button">EN</button><i /> <button type="button">DE</button><i /> <button type="button">FR</button></div><span>v2.4.1</span></footer>
      </>}
    </aside>
  </>
}
