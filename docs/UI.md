# WiseEat UI: design system and shell

How to build frontend pages that look and behave like the rest of WiseEat. The plan and step progress are in [UI_PLAN.md](UI_PLAN.md). The API client, demo session and dataset persistence are unchanged and described in [FRONTEND_SHELL.md](FRONTEND_SHELL.md).

## Shell and routes

`frontend/src/App.jsx` keeps the session and dataset logic and renders `Layout` from `src/shell/Layout.jsx`:

- **Wide screens (≥ 900 px):** content on the left and a phthalo-green sidebar (`--we-phthalo`) on the right.
  - **Sidebar:** the logo and tagline, the venue ("Bistro Copou · Restaurant · demo"), a text-only menu with a lime bar on the active item, and at the bottom the "Viewing as" Business / Customer switch and the demo-mode note.
  - **Top bar:** sits above the content. It shows the section name and the avatar.
  - **Pages with their own title or filters:** they render them into the top bar with `<TopbarPortal>` from `src/shell/Topbar.jsx`. The section name is then hidden, and the dashboard puts its `<h1>` and filters there. Other pages keep their own heading in the content.
- **Phones:** a brand bar (logo mark and switch), the top bar with the title on its own row and horizontally scrolling filters, and a fixed bottom tab bar with icons.
- A "Skip to content" link focuses `#we-main`. Print hides the sidebar, top bar, tab bar and notices. The bell and language switch from the reference are left out until they do something.

The role comes from the URL (`roleFor(pathname)` in `src/shell/navigation.js`), so switching roles is a link and needs no state. Menu items are listed in `NAV_ITEMS`; add a page by adding an item there and a `<Route>` in `App.jsx`.

| Route | Page | Props |
|---|---|---|
| `/business` | `features/platform/Dashboard.jsx`: the loss overview of the connected inventory | `api`, `dataset`, `connectError`, `onConnect` |
| `/business/data` | `features/platform/DataPage.jsx`: connected inventory or upload, analysis status, all figures, CSV import | `api`, `dataset`, `onSelect`, `onConnect` |
| `/business/deals/*` | `features/deals` (placeholder until step 4) | `api`, `sessionId`, `prefill` |
| `/business/insights/*` | `features/diagnostics` | `api`, `datasetId`, `isSynthetic` |
| `/business/actions/*` | `features/decisions` (actions, simulator, report) | `api`, `datasetId`, `isSynthetic` |
| `/map/*` | `features/marketplace` `MapPage` (placeholder until step 5) | `api`, `sessionId` |
| `/my-pickups` | `features/marketplace` `MyPickupsPage` | `api`, `sessionId` |

The shell connects to the simulated inventory when no dataset is selected ([INVENTORY.md](INVENTORY.md)), so pages show "Syncing with your inventory…" briefly instead of an empty state. The old routes `/upload`, `/business/upload`, `/summary`, `/diagnostics/*`, `/decisions/*` and `/redistribution/*` redirect through `legacyPath()`, keeping sub-paths and navigation state. The actions page's prefill (`{ category, description }`) now goes to `/business/deals`. `features/redistribution/` (the charity flow) is no longer routed; its API helpers and tests are kept for reuse.

## Brand

All brand code lives in `frontend/src/brand/`:

- `source/wiseeat-logo-source.jpg`: the logo as supplied (2048 px, cream background).
- `assets/`: transparent PNGs cut from it. `wiseeat-mark` (the "WE" with leaves) and `wiseeat-wordmark`, each in an `-on-dark` variant (dark green turned white, lime kept), plus the stacked `wiseeat-logo.png`.
- `Logo.jsx`: `<Logo tone="onDark|onLight" size={36} showName tagline />`. `size` is the mark height; the wordmark scales with it. The wrapper has `role="img"` and the label "WiseEat".
- `brand.js`: name, tagline and the logo colours (`#165037`, `#91c24c`, cream `#fefaee`).
- `frontend/public/favicon.png` (64 px) and `apple-touch-icon.png` (180 px, cream tile).

**Changing the logo:** export the new mark and wordmark as transparent PNGs (or SVGs) with the same file names and regenerate the favicons. The assets were produced by unmixing each pixel against the cream background and the two ink colours, so edges stay smooth and the on-dark variant is an exact recolour. `Logo` callers do not change.

## Design tokens

All tokens are CSS variables on `:root` in `frontend/src/index.css`. Use them instead of hex values.

- **Palette:** `--we-phthalo` / `--we-phthalo-light` (sidebar), `--we-forest-900…600` (brand greens), `--we-leaf-700/600`, `--we-lime-400/200/100`, `--we-mint-50`, `--we-cream`, `--we-ink`, `--we-ink-muted`, `--we-line`, `--we-line-strong`, plus coral, amber, red and blue in 700 (text) and 100/50 (background).
- **Semantic:** `--we-bg`, `--we-surface`, `--we-surface-muted`, `--we-text`, `--we-text-muted`, `--we-primary`, `--we-primary-hover`, `--we-success`, `--we-loss` (money lost and discounts), `--we-focus`.
- **Shape and depth:** `--we-radius-sm|md|lg` (3, 4, 6 px; keep corners small) and `--we-radius-pill` for badges only. `--we-shadow-sm` is `none`: panels use a 1 px border instead.
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
| Key figure | `<StatCard icon={LucideIcon} tone="green|loss|warning|info" label value unit hint />` |
| Titled card | `<SectionCard id title action>{content}</SectionCard>` (`action` is usually a `we-link`) |
| Text link with arrow | `we-link` |
| Food artwork | `<ProduceCrate />`, `<LeafSprig />` and `<CategoryTile category size />` from `components/illustrations.jsx`; flat SVG stand-ins for photos, always `aria-hidden` |
| Loading | `<LoadingState label />` (spinner, `role="status"`) |
| Error | `<ErrorState error onRetry title? />` (`role="alert"`, retry button) |
| Empty | `<EmptyState title description icon={LucideIcon}>{actions}</EmptyState>` |
| Notice banner | `we-notice` |
| Screen-reader text | `we-visually-hidden` |

Icons come from `lucide-react`. Mark decorative icons `aria-hidden="true"`. `prefers-reduced-motion` turns off animations globally.

Feature styles stay scoped under the feature's root class, as before, but use the tokens above.

## Business dashboard and data page

The dashboard is deliberately short; every detailed figure is on `/business/data`.

- **Data source:** there is no onboarding screen. The demo assumes the restaurant's inventory is connected, so the dashboard opens with data already loaded. See [INVENTORY.md](INVENTORY.md).
- **Dashboard** (redesigned 2026-10-18 after a reference dashboard: filters in the top bar, flat panels, small corners):
  - **Top bar:** "Dashboard" with five filters, all stored in the URL so a refresh keeps them:
    - Period: week, month or quarter (`period`)
    - a date navigator, limited to dates with data (`date` = first day of the period)
    - Compare to: the previous period or none (`compare=none`)
    - Category (`category`)
    - Service: lunch or dinner (`service`)
  - **Status line:** "Inventory connected · data through …", plus "Includes simulated days" and "Simulated sales" badges.
  - **Latest unsold batches:** the last day in the period, up to 6 items by cost.
  - **Key figures:** unsold cost and unsold portions for the period, each with "▲/▼ x% per day vs <previous period>". The change is compared per day with data, so a partial month is fair. **See more** shows unsold rate, loss per day, and prepared and sold portions.
  - **Average unsold per day by weekday:** bars with a Portions/RON toggle.
  - **Lunch vs dinner:** a donut with a Service/Category toggle. It shows categories automatically when a service is filtered.
  - **Unsold cost per day:** this period as a solid line, the comparison period dashed and aligned by day.
  - **Bottom row:** dishes losing the most, the quick win (computed over the whole history), and a "Post a deal" panel.
  - **Footnote:** the production-cost note.
  - **Simulate 30 days:** on the Data page only.
- **Data page:**
  - the connected inventory (period, simulated days, **Simulate 30 days**, **Reset history**) or the uploaded file (**Reconnect inventory**)
  - analysis progress per component
  - totals for the period and the backend limitations
  - top dishes by unsold cost and all dishes
  - "Upload a file instead"

`features/platform/DataImport.jsx` is the CSV drop zone. Props are `api` and `onSelect`. `features/platform/useInventory.js` holds the inventory actions. On success it stores the dataset and opens `/business`; on failure it shows API row errors and keeps the current dataset.

`features/platform/useBreakdown.js` (`useBreakdown(api, datasetId, query)`) loads `GET /api/datasets/{id}/breakdown` and keeps the previous result while a new filter loads. `features/platform/periods.js` holds period ranges, navigation limits, labels and the per-day comparison; its tests are in `periods.test.js`. `src/api/useDatasetResource.js` (`useDatasetResource(api, datasetId, path, isDone)`) polls `GET /api/datasets/{id}{path}` every 1.5 s until `isDone(payload)`. Use `''` for the status record and `/summary`, `/recommendations`, … for component envelopes. Calculations and formatting are in `features/platform/logic.js`.

The backend allows `MAX_DATASETS` (default 3) active datasets. The inventory connection reuses its dataset. Uploads still count, and the import card shows a 409 "Maximum active datasets reached".

## Verification

From `frontend`: `node --test "src/**/*.test.js"` (includes `src/shell/navigation.test.js` and `src/features/platform/logic.test.js`), `npm run lint`, `npm run build`. The opt-in browser check `src/features/platform/release.e2e.test.js` (needs `WASTEDNA_FRONTEND_URL`) now starts from the onboarding hero, walks the new routes and checks the `/summary` redirect.
