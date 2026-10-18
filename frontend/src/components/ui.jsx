/** Small shared building blocks on top of the classes in index.css (docs/UI.md). */

export function PageHeader({ eyebrow, title, description, actions, id }) {
  return <header className="we-page-header">
    <div className="we-page-header-text">
      {eyebrow && <span className="we-eyebrow">{eyebrow}</span>}
      <h1 id={id}>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="we-page-header-actions">{actions}</div>}
  </header>
}

/** `tone`: neutral, success, warning, loss or info. Pair color with text. */
export function Badge({ tone = 'neutral', children }) {
  return <span className={`we-badge${tone === 'neutral' ? '' : ` we-badge--${tone}`}`}>{children}</span>
}

/**
 * Key figure with an icon, as on the dashboard. `tone`: green, loss, warning
 * or info; it colors the icon only, the label carries the meaning.
 */
export function StatCard({ icon: Icon, label, value, unit, hint, tone = 'green' }) {
  return <div className="we-stat">
    <span className={`we-stat-icon we-stat-icon--${tone}`} aria-hidden="true"><Icon /></span>
    <div className="we-stat-text">
      <span className="we-stat-label">{label}</span>
      <span className="we-stat-value">{value}{unit && <small> {unit}</small>}</span>
      {hint && <span className="we-stat-hint">{hint}</span>}
    </div>
  </div>
}

/** Card with a titled header row and an optional link or action on the right. */
export function SectionCard({ title, action, className = '', children, id }) {
  return <section className={`we-card we-section-card ${className}`} aria-labelledby={id}>
    <div className="we-section-card-head"><h2 id={id}>{title}</h2>{action}</div>
    {children}
  </section>
}
