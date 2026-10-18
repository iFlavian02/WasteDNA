import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { brand } from '../../brand.js'
import { Logo } from '../../brand/Logo.jsx'
import Icon from '../../components/Icon.jsx'
import { Sidebar } from '../../components/Sidebar.jsx'
import { ACCOUNTS, readAccount, saveAccount } from './accounts.js'
import './home.css'

const ACCOUNT_ICONS = { business: 'store', personal: 'user' }
/** Matches the sidebar width transition in App.css. */
const EXPAND_MS = 560

const prefersInstant = () => typeof window === 'undefined'
  || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  || window.matchMedia?.('(max-width: 820px)').matches

/**
 * Home menu at `/`: pick a preset demo account before entering a dashboard.
 * No credentials are asked for or checked (docs/ACCOUNTS.md). The sidebar
 * starts as a slim rail; "Continue as …" slides it out to the full sidebar
 * with that account's menu, then opens the account's home.
 */
export default function Home({ storage = localStorage }) {
  const navigate = useNavigate()
  const lastUsed = readAccount(storage)?.id
  const [chosen, setChosen] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  function choose(id) {
    if (chosen) return
    const account = saveAccount(storage, id)
    if (prefersInstant()) { navigate(account.home); return }
    setChosen(account)
    timer.current = setTimeout(() => navigate(account.home), EXPAND_MS)
  }

  return <div className={`home${chosen ? ' home--leaving' : ''}`}>
    <Sidebar rail={!chosen} expanding={Boolean(chosen)} account={chosen} activeId="overview" />

    <main className="home-main" id="main-content" aria-busy={Boolean(chosen)}>
      <div className="home-mobile-brand"><Logo tone="onDark" size={34} tagline /></div>

      <header className="home-header">
        <span className="home-step">{brand.tagline}</span>
        <h1>Choose an account to continue</h1>
        <p>These are demo accounts: no username or password needed. You can switch at any time from the top bar.</p>
      </header>

      <div className="account-grid">
        {Object.values(ACCOUNTS).map(account => <section key={account.id} className={`account-card account-card--${account.id}${chosen?.id === account.id ? ' is-chosen' : ''}`} aria-labelledby={`account-${account.id}`}>
          <div className="account-card-top">
            <span className={`account-kind account-kind--${account.id}`}><Icon name={ACCOUNT_ICONS[account.id]} size={14} />{account.kind}</span>
            {lastUsed === account.id && <span className="account-last">Last used</span>}
          </div>
          <div className="account-person">
            <b aria-hidden="true">{account.id === 'business' ? <Icon name="store" size={20} /> : account.initials}</b>
            <div>
              <h2 id={`account-${account.id}`}>{account.name}</h2>
              <span>{account.role} · {account.organization}</span>
            </div>
          </div>
          <p className="account-summary">{account.summary}</p>
          <ul className="account-features">
            {account.features.map(feature => <li key={feature}><Icon name="check" size={14} strokeWidth={2.4} />{feature}</li>)}
          </ul>
          <button type="button" className="account-continue" onClick={() => choose(account.id)} disabled={Boolean(chosen)}>
            Continue as {account.name}<Icon name="arrowRight" size={16} />
          </button>
        </section>)}
      </div>

      <p className="home-footnote"><span className="live-dot" aria-hidden="true" />Demo only. Nothing is signed in and no personal data is stored; your choice is remembered in this browser.</p>
    </main>
  </div>
}
