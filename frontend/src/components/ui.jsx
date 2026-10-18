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
