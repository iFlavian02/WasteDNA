# WiseEat UI: design system and shell

How to build frontend pages that look and behave like the rest of WiseEat. The plan and step progress are in [UI_PLAN.md](UI_PLAN.md). The API client, demo session and dataset persistence are unchanged and described in [FRONTEND_SHELL.md](FRONTEND_SHELL.md).

## Shell and routes

`frontend/src/App.jsx` keeps the session and dataset logic and renders `Layout` from `src/shell/Layout.jsx`:

- **Wide screens (≥ 900 px):** a dark green sidebar with the logo, the Business / Customer switch, the menu and a footer card. The business footer shows the selected dataset and "Change data"; the customer footer says the demo deals are synthetic.
- **Phones:** a compact top bar (logo and switch) and a fixed bottom tab bar. The main area leaves room for the tab bar and the safe-area inset.
- A "Skip to content" link focuses `#we-main`. Print hides the sidebar, tab bar and notices.

The role comes from the URL (`roleFor(pathname)` in `src/shell/navigation.js`), so switching roles is a link and needs no state. Menu items are listed in `NAV_ITEMS`; add a page by adding an item there and a `<Route>` in `App.jsx`.

| Route | Page | Props |
|---|---|---|
| `/business` | Dashboard. Shows upload until a dataset is selected (step 2 redesigns it) | `api`, `dataset` |
| `/business/upload` | Choose another dataset | `api`, `onSelect` |
| `/business/deals/*` | `features/deals` (placeholder until step 4) | `api`, `sessionId`, `prefill` |
| `/business/insights/*` | `features/diagnostics` | `api`, `datasetId`, `isSynthetic` |
| `/business/actions/*` | `features/decisions` (actions, simulator, report) | `api`, `datasetId`, `isSynthetic` |
| `/map/*` | `features/marketplace` `MapPage` (placeholder until step 5) | `api`, `sessionId` |
| `/my-pickups` | `features/marketplace` `MyPickupsPage` | `api`, `sessionId` |

Insights and actions show "Choose a dataset first" without a dataset. The old routes `/upload`, `/summary`, `/diagnostics/*`, `/decisions/*` and `/redistribution/*` redirect through `legacyPath()`, keeping sub-paths and navigation state. The actions page's prefill (`{ category, description }`) now goes to `/business/deals`. `features/redistribution/` (the charity flow) is no longer routed; its API helpers and tests are kept for reuse.

## Brand

The logo will change. Brand code lives only in `frontend/src/brand/`:

- `brand.js`: `BRAND.name`, `nameParts` (the two-colour wordmark) and `tagline`.
- `Logo.jsx`: `<Logo tone="onDark|onLight" size={36} showName />` and `<LogoMark />`. The current mark is a placeholder: a rounded "W" with a leaf.
- `frontend/public/favicon.svg`: the same mark.

To swap the logo, replace `LogoMark` (or render an `<img>` inside `Logo`) and the favicon. Callers don't change.

## Design tokens

All tokens are CSS variables on `:root` in `frontend/src/index.css`. Use them instead of hex values.

- **Palette:** `--we-forest-900…600` (brand greens), `--we-leaf-700/600`, `--we-lime-400/200/100`, `--we-mint-50`, `--we-cream`, `--we-ink`, `--we-ink-muted`, `--we-line`, `--we-line-strong`, plus coral, amber, red and blue in 700 (text) and 100/50 (background).
- **Semantic:** `--we-bg`, `--we-surface`, `--we-surface-muted`, `--we-text`, `--we-text-muted`, `--we-primary`, `--we-primary-hover`, `--we-success`, `--we-loss` (money lost and discounts), `--we-focus`.
- **Shape and depth:** `--we-radius-sm|md|lg|pill`, `--we-shadow-sm|md`.
- **Spacing:** `--we-space-1…7` (4, 8, 12, 16, 24, 32, 48 px).
- **Type:** Nunito Variable (self-hosted via `@fontsource-variable/nunito`) through `--we-font`. Sizes are `--we-text-xs|sm|md|lg|xl|2xl|3xl|hero`.
- **Touch:** `--we-tap` (44 px minimum target).

Rules: text colours are the 700 shades or `--we-ink*`, which meet 4.5:1 on white. Lime and leaf 600 are for fills, icons and large text only. Status is never shown by colour alone; badges always carry a word.

## Shared classes and components

| Use | Class or component |
|---|---|
| Buttons | `we-btn` plus `we-btn--primary` (one per screen), `--secondary`, `--ghost` or `--danger`. Works on `<button>` and `<Link>`. |
| Card | `we-card` |
| Badge | `<Badge tone="neutral|success|warning|loss|info">` from `components/ui.jsx`, or `we-badge we-badge--{tone}` |
| Page title | `<PageHeader eyebrow title description actions id />` from `components/ui.jsx` |
| Loading | `<LoadingState label />` (spinner, `role="status"`) |
| Error | `<ErrorState error onRetry title? />` (`role="alert"`, retry button) |
| Empty | `<EmptyState title description icon={LucideIcon}>{actions}</EmptyState>` |
| Notice banner | `we-notice` |
| Screen-reader text | `we-visually-hidden` |

Icons come from `lucide-react`. Mark decorative icons `aria-hidden="true"`. `prefers-reduced-motion` turns off animations globally.

Feature styles stay scoped under the feature's root class, as before, but use the tokens above.

## Verification

From `frontend`: `node --test "src/**/*.test.js"` (includes `src/shell/navigation.test.js`), `npm run lint`, `npm run build`. The opt-in browser check `src/features/platform/release.e2e.test.js` (needs `WASTEDNA_FRONTEND_URL`) now walks the new routes and the `/summary` redirect.
