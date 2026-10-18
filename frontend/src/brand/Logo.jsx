import mark from './assets/wiseeat-mark.png'
import markOnDark from './assets/wiseeat-mark-on-dark.png'
import wordmark from './assets/wiseeat-wordmark.png'
import wordmarkOnDark from './assets/wiseeat-wordmark-on-dark.png'
import { BRAND } from './brand.js'
import './brand.css'

const ASSETS = {
  onLight: { mark, wordmark },
  onDark: { mark: markOnDark, wordmark: wordmarkOnDark },
}

/**
 * WiseEat logo: the "WE" mark with leaves, plus the wordmark. The images are
 * cut from `source/wiseeat-logo-source.jpg` (see docs/UI.md, "Brand"); to
 * change the logo, replace the files in `assets/` and keep this API.
 *
 * - `tone`: 'onDark' (white and lime) or 'onLight' (dark green and lime).
 * - `size`: mark height in px; the wordmark scales with it.
 * - `showName`: show the wordmark next to the mark.
 * - `tagline`: show the tagline under the wordmark.
 */
export function Logo({ tone = 'onLight', size = 36, showName = true, tagline = false }) {
  const files = ASSETS[tone]
  return <span className={`we-logo we-logo--${tone}`} style={{ '--we-logo-size': `${size}px` }} role="img" aria-label={BRAND.name}>
    <img className="we-logo-mark" src={files.mark} alt="" />
    {showName && <span className="we-logo-text">
      <img className="we-logo-wordmark" src={files.wordmark} alt="" />
      {tagline && <span className="we-logo-tagline">{BRAND.tagline}</span>}
    </span>}
  </span>
}
