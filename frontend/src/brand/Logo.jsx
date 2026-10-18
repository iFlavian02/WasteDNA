import { BRAND } from './brand.js'
import './brand.css'

/**
 * Placeholder WiseEat mark: a rounded "W" with a leaf. Replace this component
 * (and public/favicon.svg) when the final logo arrives; callers only use
 * `<Logo tone size showName />`.
 *
 * - `tone`: 'onDark' for the sidebar, 'onLight' for white surfaces.
 * - `size`: mark height in px. The wordmark scales with it.
 * - `showName`: render the "WiseEat" wordmark next to the mark.
 */
export function Logo({ tone = 'onLight', size = 36, showName = true }) {
  return <span className={`we-logo we-logo--${tone}`} style={{ '--we-logo-size': `${size}px` }}>
    <LogoMark />
    {showName && <span className="we-logo-name">
      <span>{BRAND.nameParts[0]}</span><span className="we-logo-name-accent">{BRAND.nameParts[1]}</span>
    </span>}
  </span>
}

export function LogoMark() {
  return <svg className="we-logo-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect className="we-logo-mark-bg" width="40" height="40" rx="11" />
    <path className="we-logo-mark-w" d="M9 15.5 14.5 30 20 19.5 25.5 30 31 15.5" fill="none" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    <path className="we-logo-mark-leaf" d="M20.5 15.5C20.3 10.2 23.4 6.9 29 6.2 29.4 11.6 26.2 15.2 20.5 15.5Z" />
  </svg>
}
