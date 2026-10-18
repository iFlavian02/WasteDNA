# WiseEat dashboard UI

The application home page (`/`) is the WiseEat food-waste prevention dashboard. It is implemented in `frontend/src/features/dashboard/` and rendered inside the shared shell in `frontend/src/App.jsx`.

## What the page contains

- A persistent desktop sidebar and a drawer-style mobile sidebar.
- Property, period, date, comparison, waste-type and device controls matching the approved Stitch design.
- A collapsible edible-waste cost KPI.
- A seven-day chart with local `gr`/`EUR` switching and a Lunch vs dinner unsold-cost donut on the same row.
- A Service/Category toggle on the donut; the large donut is centered above a proportional stats grid where every slice is repeated as a percentage and RON value.
- A Quick win card that shows only the largest indicative 30-day recommendation and links to all actions.
- Direct navigation to the existing diagnostics, decisions, redistribution, upload and dataset-summary features.

Without a selected dataset, the dashboard uses the approved February 2025 presentation values. Once a dataset is selected, the split card loads `GET /api/datasets/{id}/breakdown` and Quick win polls `GET /api/datasets/{id}/recommendations` until analysis settles. Quick win covers the dataset's whole history and opportunities are never summed. Breakdown values are unsold production cost, not sales price.

The official logo supplied by the product owner is bundled unchanged at `frontend/public/wiseeat-logo.png`. The shell crops its original padded canvas with CSS for desktop and mobile placements; do not replace it with generated or redrawn artwork.

## Responsive and accessibility behavior

At desktop widths above 820 px and viewport heights of at least 700 px, the dashboard uses the remaining viewport height: compact KPIs, both charts on one row, and Quick win underneath are visible without page scrolling. At widths up to 820 px, the sidebar becomes an overlay drawer, the top filters become a horizontally scrollable control strip, and cards return to natural document flow. At 620 px, KPI contents stack while the donut remains centered above its responsive stats grid. Interactive elements use semantic buttons and links, visible keyboard focus, text labels for icon-only controls, textual chart legends, and reduced-motion preferences.

The target is WCAG 2.2 AA, Lighthouse accessibility 90 or higher, and Lighthouse performance 85 or higher. The authenticated desktop profile uses a p75 LCP target of 2.5 seconds, INP of 200 ms or less, CLS of 0.1 or less, and an initial JavaScript budget of 200 KB gzip.

## Extending the page

Presentation fallbacks, `splitItems`, `bestQuickWin`, formatting, and route-to-navigation mapping live in `data.js`; keep pure transformations there so they can be covered by Node tests. `useBreakdown.js` retains the previous result while a new query loads. The shared `api/useDatasetResource.js` polls component envelopes and stops on terminal status, error, or unmount. UI composition lives in `Dashboard.jsx`, dashboard-only styling in `dashboard.css`, and shared shell styling in `App.css`. Inline interface icons are centralized in `frontend/src/components/Icon.jsx`, avoiding external font or icon runtime dependencies.

Run the dashboard tests with:

```bash
cd frontend
node --test src/features/dashboard/*.test.js
```

Before sharing changes, also run `npm run lint` and `npm run build`.
