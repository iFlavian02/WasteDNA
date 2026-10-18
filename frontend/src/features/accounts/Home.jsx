import { useNavigate } from 'react-router-dom'
import { brand } from '../../brand.js'
import Icon from '../../components/Icon.jsx'
import { ACCOUNTS, readAccount, saveAccount } from './accounts.js'
import './home.css'

const ACCOUNT_ICONS = { business: 'store', personal: 'user' }

/**
 * Home menu at `/`: pick a preset demo account before entering a dashboard.
 * No credentials are asked for or checked (docs/ACCOUNTS.md).
 */
export default function Home({ storage = localStorage }) {
  const navigate = useNavigate()
  const lastUsed = readAccount(storage)?.id

  function choose(id) {
    navigate(saveAccount(storage, id).home)
  }

  return <div className="home">
    <aside className="home-brand">
      <div className="home-logo"><img src={brand.logoSrc} alt={brand.name} /></div>
      <div className="home-brand-copy">
        <span className="home-eyebrow">{brand.tagline}</span>
        <p>See where food is wasted, act on it, and give surplus a second life.</p>
      </div>
      <ul className="home-points">
        <li><Icon name="leaf" size={16} />Less waste, measured every day</li>
        <li><Icon name="coins" size={16} />Costs you can act on</li>
        <li><Icon name="goals" size={16} />Clear goals for your team</li>
      </ul>
      <p className="home-demo"><span className="live-dot" aria-hidden="true" />Demo environment · preset accounts</p>
    </aside>

    <main className="home-main" id="main-content">
      <header className="home-header">
        <span className="home-step">Welcome</span>
        <h1>Choose an account to continue</h1>
        <p>These are demo accounts: no username or password needed. You can switch at any time from the top bar.</p>
      </header>

      <div className="account-grid">
        {Object.values(ACCOUNTS).map(account => <section key={account.id} className={`account-card account-card--${account.id}`} aria-labelledby={`account-${account.id}`}>
          <div className="account-card-top">
            <span className={`account-kind account-kind--${account.id}`}><Icon name={ACCOUNT_ICONS[account.id]} size={14} />{account.kind}</span>
            {lastUsed === account.id && <span className="account-last">Last used</span>}
          </div>
          <div className="account-person">
            <b aria-hidden="true">{account.initials}</b>
            <div>
              <h2 id={`account-${account.id}`}>{account.name}</h2>
              <span>{account.role} · {account.organization}</span>
            </div>
          </div>
          <p className="account-summary">{account.summary}</p>
          <ul className="account-features">
            {account.features.map(feature => <li key={feature}><Icon name="check" size={14} strokeWidth={2.4} />{feature}</li>)}
          </ul>
          <button type="button" className="account-continue" onClick={() => choose(account.id)}>
            Continue as {account.name}<Icon name="arrowRight" size={16} />
          </button>
        </section>)}
      </div>

      <p className="home-footnote">Demo only. Nothing is signed in and no personal data is stored; your choice is remembered in this browser.</p>
    </main>
  </div>
}
