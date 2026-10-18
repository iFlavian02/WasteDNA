# WiseEat dashboard UI

The business dashboard (`/dashboard`) is the WiseEat food-waste prevention dashboard. The application home (`/`) is now the account menu described in [ACCOUNTS.md](ACCOUNTS.md); choosing the business account opens this dashboard. It is implemented in `frontend/src/features/dashboard/` and rendered inside the shared shell in `frontend/src/App.jsx`.

## What the page contains

- A persistent desktop sidebar and a drawer-style mobile sidebar.
- Property, period, date, comparison, waste-type and device controls matching the approved Stitch design.
- Collapsible edible-waste weight and cost KPIs.
- A live-sync status indicator.
- A seven-day chart with local `gr`/`EUR` switching and an edible/inedible ratio chart.
- Direct navigation to the existing diagnostics, decisions, redistribution, upload and dataset-summary features.

The dashboard values are presentation data from the approved February 2025 design. They do not currently make API requests. Existing dataset-backed screens continue to use the shared API client documented in `FRONTEND_SHELL.md`.

The logo is rendered everywhere with `<Logo>` from `frontend/src/brand/Logo.jsx`, using transparent cut-outs of the supplied logo (see [BRAND.md](BRAND.md)). The original file stays at `frontend/public/wiseeat-logo.png` and `frontend/src/brand/source/`; do not crop it with CSS or replace it with redrawn artwork.

## Responsive and accessibility behavior

At widths up to 820 px, the sidebar becomes an overlay drawer and the top filters become a horizontally scrollable control strip. At 620 px, KPI cards and analytics cards stack. Interactive elements use semantic buttons and links, visible keyboard focus, text labels for icon-only controls, and reduced-motion preferences.

The target is WCAG 2.2 AA, Lighthouse accessibility 90 or higher, and Lighthouse performance 85 or higher. The authenticated desktop profile uses a p75 LCP target of 2.5 seconds, INP of 200 ms or less, CLS of 0.1 or less, and an initial JavaScript budget of 200 KB gzip.

## Extending the page

Static presentation data and route-to-navigation mapping live in `data.js`; keep pure transformations there so they can be covered by Node tests. UI composition lives in `Dashboard.jsx`, dashboard-only styling in `dashboard.css`, and shared shell styling in `App.css`. Inline interface icons are centralized in `frontend/src/components/Icon.jsx`, avoiding external font or icon runtime dependencies.

Run the dashboard tests with:

```bash
cd frontend
node --test src/features/dashboard/*.test.js
```

Before sharing changes, also run `npm run lint` and `npm run build`.
