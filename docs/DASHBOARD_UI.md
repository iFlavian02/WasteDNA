# WiseEat dashboard UI

The business dashboard (`/dashboard`) is the WiseEat food-waste prevention dashboard. The application home (`/`) is now the account menu described in [ACCOUNTS.md](ACCOUNTS.md); choosing the business account opens this dashboard. It is implemented in `frontend/src/features/dashboard/` and rendered inside the shared shell in `frontend/src/App.jsx`.

## What the page contains

- A persistent desktop sidebar and a drawer-style mobile sidebar.
- Filters at the top of the KPI card (they used to sit in the top bar on every business page, without doing anything): **Period** (Month or Whole dataset), **Month** (‹ November 2025 ›, limited to the months in the dataset, newest first selected), **Service** and **Category** (options come from the dataset). The sidebar no longer includes a property selector or language controls.
- Three collapsible KPIs: **Unsold food cost**, **Unsold portions** and **Unsold rate** for the selection. In Month mode each shows the change against the month before, comparing per-day averages so a partial month is compared fairly (green arrow down = less left over, red arrow up = more).
- **Average unsold food per day** by weekday, in portions or RON, with the weekday that has the most left over highlighted, next to the Lunch vs dinner unsold-cost donut.
- A Service/Category toggle on the donut, with each slice repeated as a percentage and RON value.
- A Quick win card showing the largest indicative 30-day recommendation and linking to Actions.
- Direct navigation to the existing diagnostics, decisions, redistribution, upload and dataset-summary features.

Without a selected dataset (first visit, or after the dataset expired), the dashboard shows no numbers: a **No data loaded yet** prompt (`NoDataPrompt` in `Dashboard.jsx`) offers **Load your data** (link to `/upload`) and **Use demo data** (imports the demo and selects it through `onSelect`, which `App.jsx` passes as `datasetController.save`). `App.jsx` reads the saved dataset synchronously on start, so a returning user doesn't see the prompt flash. There are no hard-coded figures any more: every number on the page comes from the dataset. Once a dataset is selected, the dashboard loads `GET /api/datasets/{id}/breakdown` three times: the whole dataset (for the month range and filter options), the selection (KPIs, weekday chart, donut) and the previous month (KPI comparison). Quick win polls `GET /api/datasets/{id}/recommendations` until analysis settles. The business tabs are Overview, Statistics, Actions, Orders and Data; the Statistics tab opens the diagnostics workspace. The personal account keeps Food map, Orders and Help. The account switcher, current WiseEat logo, and current colour scheme are unchanged.

The logo is rendered everywhere with `<Logo>` from `frontend/src/brand/Logo.jsx`, using transparent cut-outs of the supplied logo (see [BRAND.md](BRAND.md)). The original file stays at `frontend/public/wiseeat-logo.png` and `frontend/src/brand/source/`; do not crop it with CSS or replace it with redrawn artwork.

## Responsive and accessibility behavior

At desktop widths above 820 px and viewport heights of at least 700 px, the dashboard uses the remaining viewport height for the KPI, paired charts and Quick win. At widths up to 820 px, the sidebar becomes an overlay drawer and the top filters become a horizontally scrollable control strip. At 620 px, card contents stack. Interactive elements use semantic buttons and links, visible keyboard focus, text labels for icon-only controls, and reduced-motion preferences.

The target is WCAG 2.2 AA, Lighthouse accessibility 90 or higher, and Lighthouse performance 85 or higher. The authenticated desktop profile uses a p75 LCP target of 2.5 seconds, INP of 200 ms or less, CLS of 0.1 or less, and an initial JavaScript budget of 200 KB gzip.

## Extending the page

Month and filter queries (`monthsBetween`, `monthPeriod`, `breakdownQuery`, `previousQuery`), KPI tiles (`dashboardKpis`), weekday bars (`weekdayBars`, `niceMax`), split transformations, Quick win selection, formatting and route-to-navigation mapping live in `data.js`; keep pure transformations there so they can be covered by Node tests. `useBreakdown.js` retains the previous result while a new query loads, and `api/useDatasetResource.js` polls result envelopes until terminal status. UI composition lives in `Dashboard.jsx`, dashboard-only styling in `dashboard.css`, and shared shell styling in `App.css`.

Run the dashboard tests with:

```bash
cd frontend
node --test src/features/dashboard/*.test.js
```

Before sharing changes, also run `npm run lint` and `npm run build`.

## Data the dashboard cannot show

The CSV has portions and production cost per dish, service and day. It has no weights, guest counts, breakfast service, waste type or scale devices, so the earlier "grams per guest", "Edible" and "Device" controls were removed instead of showing invented values.
