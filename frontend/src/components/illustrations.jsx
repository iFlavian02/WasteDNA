import { Apple, CakeSlice, ChefHat, CookingPot, Croissant, Salad, Soup, UtensilsCrossed } from 'lucide-react'

/**
 * Decorative, flat illustrations drawn with the brand palette. They stand in
 * for food photos and are always aria-hidden. See docs/UI.md.
 */
export function ProduceCrate({ className = '' }) {
  return <svg className={`we-illustration ${className}`} viewBox="0 0 240 180" aria-hidden="true" focusable="false">
    <ellipse cx="120" cy="168" rx="98" ry="8" fill="rgb(14 58 39 / .12)" />
    <path d="M58 98C44 70 58 44 84 42c10 18 6 40-6 58Z" fill="#287a54" />
    <path d="M84 100C76 70 92 48 116 50c4 22-8 40-22 52Z" fill="#165037" />
    <path d="M70 96c4-18 14-30 28-36" stroke="#91c24c" strokeWidth="3" fill="none" strokeLinecap="round" />
    <g transform="rotate(-24 178 62)">
      <rect x="128" y="48" width="104" height="28" rx="14" fill="#d9a066" />
      <path d="M148 54l8 16M168 54l8 16M188 54l8 16M208 54l8 16" stroke="#b97c43" strokeWidth="3.5" strokeLinecap="round" />
    </g>
    <circle cx="86" cy="94" r="22" fill="#e4572e" />
    <path d="M86 74l4 6 7-1-4 6 3 6-7-2-5 5-1-7-7-2 6-4Z" fill="#287a54" />
    <circle cx="124" cy="98" r="20" fill="#f5a524" />
    <path d="M124 78c6-8 14-9 20-7-4 7-11 10-20 7Z" fill="#5c9a2e" />
    <circle cx="164" cy="98" r="19" fill="#91c24c" />
    <path d="M164 80c0-6 2-10 6-12" stroke="#5c3d1e" strokeWidth="3" fill="none" strokeLinecap="round" />
    <circle cx="157" cy="92" r="4" fill="#fff" opacity=".45" />
    <circle cx="80" cy="88" r="4.5" fill="#fff" opacity=".4" />
    <rect x="34" y="104" width="172" height="62" rx="10" fill="#d9a066" />
    <rect x="34" y="122" width="172" height="6" fill="#b97c43" opacity=".55" />
    <rect x="34" y="144" width="172" height="6" fill="#b97c43" opacity=".55" />
    <rect x="98" y="110" width="44" height="9" rx="4.5" fill="#b97c43" />
    <path d="M34 114a10 10 0 0 1 10-10h152a10 10 0 0 1 10 10" stroke="#e8bb88" strokeWidth="3" fill="none" />
  </svg>
}

export function LeafSprig({ className = '' }) {
  return <svg className={`we-illustration ${className}`} viewBox="0 0 140 140" aria-hidden="true" focusable="false">
    <path d="M30 128C52 98 70 64 104 18" stroke="#287a54" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M52 98C26 96 12 78 14 56c24 2 38 20 38 42Z" fill="#91c24c" />
    <path d="M60 86c22-4 40 4 48 24-22 6-40-4-48-24Z" fill="#287a54" />
    <path d="M78 56C58 48 52 28 60 8c20 8 26 28 18 48Z" fill="#165037" />
    <path d="M86 46c18-12 36-10 48 4-16 14-34 12-48-4Z" fill="#91c24c" />
  </svg>
}

const CATEGORY_ICONS = {
  soup: Soup,
  main: UtensilsCrossed,
  side: Salad,
  dessert: CakeSlice,
  daily_menu: ChefHat,
  bread: Croissant,
  bakery: Croissant,
  produce: Apple,
  prepared_meals: CookingPot,
}

const CATEGORY_TONES = { dessert: 'warm', bakery: 'warm', bread: 'warm', soup: 'warm', produce: 'fresh', side: 'fresh' }

/** Rounded icon tile for a food category, used where photos would go. */
export function CategoryTile({ category, size = 44 }) {
  const Icon = CATEGORY_ICONS[category] || UtensilsCrossed
  return <span className={`we-category-tile we-category-tile--${CATEGORY_TONES[category] || 'green'}`} style={{ '--we-tile-size': `${size}px` }} aria-hidden="true"><Icon /></span>
}
