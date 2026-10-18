# Handoff: "Lunch vs dinner" card and "Quick win" card

These are two cards on the WiseEat business dashboard (`/business`). This file says what each card does, which backend data it uses, where the code is, and how to change or test it safely. Branch: `ui` (never push to `main` without the user's explicit go-ahead). Read `AGENTS.md` first: document features in `/docs`, write and run tests before committing, and check the `REQUESTS.md` files.

| Card | What the user sees | Data source |
|---|---|---|
| **Lunch vs dinner** | Animated donut of **unsold production cost** in the selected period, split by service (lunch/dinner) or, via a toggle, by food category. A legend shows share and RON per slice. | `GET /api/datasets/{id}/breakdown` (new, added on `ui`) |
| **Quick win** | The single recommendation with the largest **indicative** 30-day opportunity, e.g. "Prepare fewer portions of main dishes on Mondays · ≈ 751 RON per 30 days · indicative, not guaranteed", with a link to all actions. | `GET /api/datasets/{id}/recommendations` (existing analysis pipeline) |

## Where the code is

| File | Role |
|---|---|
| `frontend/src/features/platform/Dashboard.jsx` | `SplitPanel` and `QuickWin` components; `Overview` fetches the data and renders both |
| `frontend/src/features/platform/logic.js` | Pure helpers: `splitItems`, `bestQuickWin`, `envelopeSettled`, `formatRon`, `formatPercent` |
| `frontend/src/features/platform/logic.test.js` | Tests for those helpers |
| `frontend/src/features/platform/useBreakdown.js` | Loads the breakdown and keeps the last result while a new period loads |
| `frontend/src/api/useDatasetResource.js` | Loads `/recommendations` and polls every 1.5 s while analysis runs |
| `frontend/src/features/platform/platform.css` | Card styles (`we-panel`, `we-toggle`, `we-split`, `we-legend`, `we-quickwin*`) |
| `backend/app/services/breakdown.py` | Computes the breakdown, including `by_time_slot` and `by_category` |
| `backend/app/api/breakdown.py` | The breakdown route |
| `backend/app/main.py` | Registers the breakdown router **before** the datasets router (see pitfalls) |
| `backend/tests/inventory/test_breakdown.py` | Breakdown API tests |
| `backend/app/decisions/recommendations.py`, `backend/app/contracts/decisions.py` | Recommendations (owned by member 4 and, per the new plan, member 1). Read-only from the dashboard's point of view. |

Related docs: `docs/UI.md` (design system, dashboard section), `docs/INVENTORY.md` (simulated inventory and the breakdown API), `docs/DECISIONS_MODULE.md` (recommendations).

## How data reaches the cards

```
shell (App.jsx) ── selects dataset (connected inventory by default) ──► Dashboard ► Overview
Overview
  ├─ useBreakdown(api, id, { from, to })          → GET /api/datasets/{id}/breakdown?from&to
  │     └─ SplitPanel breakdown={data}            → splitItems(data, 'service' | 'category')
  └─ useDatasetResource(api, id, '/recommendations', envelopeSettled)
        └─ QuickWin envelope={…} error={…}         → bestQuickWin(envelope)
```

- The **donut follows the dashboard filters**: Period (week/month/quarter) and the date navigator. `from`/`to` are the selected period, limited to dates with data. "Compare to" does not affect it.
- The **quick win does not follow the filters.** Recommendations are computed once per dataset over its whole history by the analysis pipeline. That's why the card says "per 30 days" and not "this month".

## Backend

### 1. `GET /api/datasets/{dataset_id}/breakdown` (new on branch `ui`)

**Query:** `from`, `to` (`YYYY-MM-DD`, optional; both default to the dataset's first and last date), `category`, `time_slot` (`lunch|dinner`). The dashboard sends only `from`/`to`. Category and service filters were removed from the UI, but the API still supports them.

**Response fields used by this card:**

```json
{
  "period": { "from": "2026-10-01", "to": "2026-10-31", "calendar_days": 31 },
  "by_time_slot": [
    { "time_slot": "dinner", "unsold_portions": 583, "unsold_cost_ron": 4827.0, "prepared_portions": 3740 },
    { "time_slot": "lunch",  "unsold_portions": 580, "unsold_cost_ron": 4997.5, "prepared_portions": 3685 }
  ],
  "by_category": [
    { "category": "daily_menu", "unsold_portions": 100, "unsold_cost_ron": 1100.0, "prepared_portions": 550 },
    { "category": "dessert",    "unsold_portions": 270, "unsold_cost_ron": 1666.0, "prepared_portions": 1215 }
  ]
}
```

The full response also has `totals`, `daily`, `by_weekday`, `top_dishes`, `latest_batches`, `available` and `options`; see `docs/INVENTORY.md`.

**How it is computed** (`backend/app/services/breakdown.py`):

- **Source rows:** the dataset's stored rows (`record["rows"]`, the validated CSV rows).
- **Unsold:** `unsold = prepared_qty - sold_qty`, and `unsold_cost_ron = unsold × unit_cost_ron`, the same formula as the import summary. **Production cost, not sales price.**
- **Filtering:** rows are filtered by `from`/`to` (and optional category and service), then grouped. Groups come back sorted by key; the frontend re-sorts by cost.

  ```python
  def _grouped(rows, key):          # key = "time_slot" or "category"
      groups = rows.groupby(key, sort=True).agg(unsold=("unsold", "sum"), unsold_cost_ron=("unsold_cost_ron", "sum"), prepared=("prepared_qty", "sum"))
      return [{key: name, "unsold_portions": int(item.unsold), "unsold_cost_ron": round(float(item.unsold_cost_ron), 2), "prepared_portions": int(item.prepared)} for name, item in groups.iterrows()]
  ```

- **No matching rows:** `by_time_slot` and `by_category` are `[]`.

**Errors:**
- **400:** `from` after `to`, a malformed date or an unknown `time_slot`.
- **404:** the dataset is unknown or expired (common error envelope).

It works for every dataset type: the simulated inventory and uploaded CSVs.

### 2. `GET /api/datasets/{dataset_id}/recommendations` (existing, unchanged)

Served by the generic component route in `backend/app/api/datasets.py`. The envelope:

```json
{
  "status": "ready",
  "result": {
    "status": "ready",
    "items": [
      {
        "id": "action-pattern-aff13ef2329e1d51",
        "title": "Prepare fewer portions of main dishes on Mondays",
        "description": "Unsold share was 30% versus 13% in comparable services (+16.7 pp over 30 days). …",
        "effort": "medium",
        "evidence_pattern_ids": ["pattern-aff13ef2329e1d51"],
        "opportunity_ron_per_30_days": 751.15
      }
    ],
    "limitations": []
  },
  "limitations": []
}
```

- **Status:** `status` is `queued` or `running` (HTTP 202) while analysis runs, then `ready`, `insufficient_data` or `error` (HTTP 200).
- **Lifecycle:** analysis starts after a dataset is created and again after **Simulate 30 days** or **Reset history** on the Data page.
- **Contract:** `RecommendationAction` in `backend/app/contracts/decisions.py`, where `opportunity_ron_per_30_days` is a non-negative float or `null`. `build_recommendations` returns at most three actions, each linked to one pattern.
- **Rule from the contract:** "Opportunities must not be summed." They overlap and are indicative. The card shows only the largest one.

Nothing in the recommendations backend was changed for this card. The quick win is purely a frontend selection.

### What changed in the backend for these cards

1. Added `backend/app/services/breakdown.py` and `backend/app/api/breakdown.py` (commit `c78881b`).
2. In `backend/app/main.py`, registered `breakdown_router` **before** `datasets_router`.
3. Added tests in `backend/tests/inventory/test_breakdown.py`: whole history, period, category and service filters, the empty period, and the 400 and 404 cases.

The data comes from the simulated inventory (`backend/app/inventory/`, `POST /api/inventory/connect`, see `docs/INVENTORY.md`). Its generator plants kitchen habits (Mondays over-planned, dinner desserts over-prepared, a weak daily menu on Fridays). That is why the quick win typically reads "Prepare fewer portions of main dishes on Mondays".

## Frontend

### Helpers (`frontend/src/features/platform/logic.js`)

```js
const TERMINAL = new Set(['ready', 'insufficient_data', 'error'])
export const envelopeSettled = envelope => TERMINAL.has(envelope?.status)

/** Donut slices from a breakdown: { items: [{ key, name, value, share }], total }, largest first. */
export function splitItems(breakdown, view) {
  const category = view === 'category'
  const source = (category ? breakdown?.by_category : breakdown?.by_time_slot) || []
  const total = source.reduce((sum, item) => sum + item.unsold_cost_ron, 0)
  const items = source
    .map(item => {
      const key = category ? item.category : item.time_slot
      return { key, name: category ? categoryName(key) : SERVICE_NAMES[key] || key, value: item.unsold_cost_ron, share: total ? item.unsold_cost_ron / total : 0 }
    })
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
  return { items, total }
}

/** Largest single opportunity, only when recommendations are ready. Never sum them. */
export function bestQuickWin(envelope) {
  const items = envelope?.status === 'ready' ? envelope.result?.items || [] : []
  return items.reduce((best, item) => (item.opportunity_ron_per_30_days > (best?.opportunity_ron_per_30_days ?? -Infinity) ? item : best), null)
}
```

`SERVICE_NAMES` is `{ lunch: 'Lunch', dinner: 'Dinner' }`. `categoryName('daily_menu')` gives `'Daily menu'`. `formatRon(1234.5)` gives `'1,235 RON'`, and `formatPercent(0.533)` gives `'53.3%'`; both return `'—'` for null.

### Wiring (`Overview` in `Dashboard.jsx`)

```jsx
const current = useBreakdown(api, datasetId, range)   // range = { from, to } of the selected period
const recommendations = useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)
…
<SplitPanel breakdown={current.data} />
…
<QuickWin envelope={recommendations.data} error={recommendations.error} />
```

- **Breakdown hook:** `useBreakdown` returns `{ data, error, loading, retry }`. It keeps the previous `data` while a new period loads; the dashboard fades to 60% opacity via `.we-dash.is-loading`.
- **Recommendations hook:** `useDatasetResource` polls until `envelopeSettled` is true and stops on error or unmount.

### `SplitPanel` (animated donut)

```jsx
const SPLIT_COLORS = ['#1c4b3e', '#91c24c', '#5c9a2e', '#2a6352', '#c9d6cd', '#f5a524', '#b93a12']
const TOOLTIP = { contentStyle: { borderRadius: 4, border: '1px solid #e4ebe5', fontFamily: 'inherit', fontSize: 13 } }
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function SplitPanel({ breakdown }) {
  const [view, setView] = useState('service')
  const showCategory = view === 'category'
  const { items, total } = splitItems(breakdown, view)
  return <section className="we-panel we-chart-panel" aria-labelledby="we-split-title">
    <div className="we-panel-head">
      <h2 id="we-split-title">{showCategory ? 'Unsold cost by category' : 'Lunch vs dinner'}</h2>
      <div className="we-toggle" role="group" aria-label="Split by">
        <button type="button" aria-pressed={!showCategory} onClick={() => setView('service')}>Service</button>
        <button type="button" aria-pressed={showCategory} onClick={() => setView('category')}>Category</button>
      </div>
    </div>
    {total === 0 ? <p className="we-muted">No unsold food for this selection.</p> : <div className="we-split">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1} stroke="none" isAnimationActive={!reducedMotion()}>
            {items.map((item, index) => <Cell key={item.key} fill={SPLIT_COLORS[index % SPLIT_COLORS.length]} />)}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={value => formatRon(value)} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="we-legend">{items.map((item, index) => <li key={item.key}>
        <span className="we-legend-swatch" style={{ background: SPLIT_COLORS[index % SPLIT_COLORS.length] }} aria-hidden="true" />
        <span>{item.name}</span><b>{formatPercent(item.share)}</b><span className="we-muted">{formatRon(item.value)}</span>
      </li>)}</ul>
    </div>}
  </section>
}
```

How it behaves:

- **Animation:** Recharts animates the arcs on mount, when the toggle changes and when the period changes. `isAnimationActive` is off when the OS asks for reduced motion.
- **Toggle:** two `aria-pressed` buttons. The view is local state, so it is not kept in the URL and resets on reload. The heading changes with the view.
- **Colours:** slices are coloured by rank, so the largest slice is always phthalo green `#1c4b3e` and the second is lime. The legend repeats every value as text (share and RON), so colour is never the only carrier.
- **Empty:** when the period has no unsold cost, the card shows "No unsold food for this selection.".
- **Layout:** on phones (≤ 640 px) the donut stacks above the legend (`.we-split` becomes one column).

### `QuickWin`

```jsx
function QuickWin({ envelope, error }) {
  const win = bestQuickWin(envelope)
  const pending = !error && !envelopeSettled(envelope)
  return <section className="we-panel we-quickwin" aria-labelledby="we-win-title">
    <div className="we-panel-head"><h2 id="we-win-title">Quick win</h2><Link className="we-link" to="/business/actions">All actions<ArrowRight aria-hidden="true" /></Link></div>
    {pending ? <LoadingState label="Looking for ways to save…" />
      : win ? <div className="we-quickwin-body">
        <span className="we-quickwin-icon" aria-hidden="true"><Lightbulb /></span>
        <div>
          <strong>{win.title}</strong>
          <span>≈ <b>{formatRon(win.opportunity_ron_per_30_days)}</b> per 30 days · indicative, not guaranteed</span>
        </div>
      </div> : <p className="we-muted">No clear quick win in this data yet.</p>}
  </section>
}
```

| State | Shown |
|---|---|
| Analysis queued or running (no error) | Spinner "Looking for ways to save…" (`role="status"`) |
| `ready` with at least one item | Lightbulb, the action title, "≈ X RON per 30 days · indicative, not guaranteed" |
| `ready` with no items, `insufficient_data`, `error`, or a failed request | "No clear quick win in this data yet." |

"All actions" links to `/business/actions`, member 4's recommendations, simulator and report. Icons come from `lucide-react`.

### Styles (`platform.css`; tokens in `frontend/src/index.css`)

```css
.we-panel { display: grid; align-content: start; gap: var(--we-space-4); min-width: 0; padding: var(--we-space-5); background: var(--we-surface); border: 1px solid var(--we-line); border-radius: var(--we-radius-sm); }
.we-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--we-space-3); }
.we-panel-head h2 { font-size: var(--we-text-md); font-weight: 800; }
.we-chart-panel { gap: var(--we-space-3); }
.we-toggle { display: inline-flex; padding: 2px; background: var(--we-surface-muted); border: 1px solid var(--we-line); border-radius: var(--we-radius-sm); }
.we-toggle button { min-height: 28px; padding: 0 var(--we-space-3); font-size: var(--we-text-xs); font-weight: 800; color: var(--we-text-muted); background: none; border: 0; border-radius: 2px; }
.we-toggle button[aria-pressed="true"] { color: #fff; background: var(--we-phthalo); }
.we-split { display: grid; grid-template-columns: minmax(8rem, 1fr) minmax(0, 1.2fr); align-items: center; gap: var(--we-space-4); }
.we-legend { display: grid; gap: var(--we-space-2); margin: 0; padding: 0; list-style: none; font-size: var(--we-text-sm); }
.we-legend li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; column-gap: var(--we-space-2); }
.we-legend li .we-muted { grid-column: 2 / -1; font-size: var(--we-text-xs); }
.we-legend b { font-weight: 800; font-variant-numeric: tabular-nums; }
.we-legend-swatch { width: 10px; height: 10px; border-radius: 2px; }
.we-quickwin-body { display: flex; align-items: flex-start; gap: var(--we-space-3); }
.we-quickwin-body > div { display: grid; gap: 2px; }
.we-quickwin-body strong { font-weight: 800; }
.we-quickwin-body span { font-size: var(--we-text-sm); color: var(--we-text-muted); }
.we-quickwin-body b { color: var(--we-success); }
.we-quickwin-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 auto; color: var(--we-amber-700); background: var(--we-amber-100); border-radius: 50%; }
.we-quickwin-icon svg { width: 18px; height: 18px; }
.we-quickwin .we-loading { padding: var(--we-space-3) 0; justify-content: flex-start; }
@media (max-width: 640px) { .we-split { grid-template-columns: minmax(0, 1fr); } }
```

Design rules: small corners (3–6 px), flat panels with 1 px borders and no shadows, and the phthalo green `--we-phthalo` for active toggles. Use the `--we-*` tokens, not new hex values (`docs/UI.md`).

## How to use them elsewhere

- **The donut on another page:** fetch a breakdown with `useBreakdown(api, datasetId, { from, to })`, which can be `{}` for the whole history, then render `<SplitPanel breakdown={data} />`. To reuse it outside `Dashboard.jsx`, move `SplitPanel` and its constants into `components/` or a shared file first. It is local to `Dashboard.jsx` today.
- **A different split** (for example by dish): add a grouped list to the breakdown response with `_grouped(selected, "dish_id")`, extend `splitItems` with a new `view`, add a toggle button, and add tests on both sides.
- **The quick win** needs only the recommendations envelope: `useDatasetResource(api, datasetId, '/recommendations', envelopeSettled)`, then `<QuickWin envelope={data} error={error} />`.

## Rules not to break

- **Never add opportunities together** (contract rule). Show at most the single largest, labelled "indicative, not guaranteed".
- **The quick win covers the whole history**, not the selected period. Don't make it look period-specific.
- **Values are unsold production cost.** Unsold food is not proof that it was thrown away; the dashboard footnote says so. Keep "Simulated sales" visible for the synthetic dataset.
- **Route order in `main.py`:** `breakdown_router` must stay before `datasets_router`, whose catch-all `/datasets/{id}/{component}` would otherwise return 404 for `/breakdown`.
- **Reduced motion:** keep `isAnimationActive={!reducedMotion()}` on every animated chart.

## Testing and verification

```sh
# backend (repo root, Python venv in .venv)
.venv/Scripts/python.exe -m pytest backend/tests/inventory -q
# frontend (from frontend/)
node --test "src/**/*.test.js"      # includes splitItems / bestQuickWin / envelopeSettled tests
npm run lint
npm run build
# optional browser walkthrough against a running app
WASTEDNA_FRONTEND_URL=http://localhost:5173 WASTEDNA_API_URL=http://localhost:5173 node --test src/features/platform/release.e2e.test.js
```

**Running it:**
- **Backend:** `uvicorn app.main:app --app-dir backend --port 8000`, with `DATA_DIR` and `REDISTRIBUTION_DB_PATH` set to writable paths.
- **Frontend:** `npm run dev` in `frontend/` (Vite proxies `/api` to port 8000). Open `/business`; the app connects to the simulated inventory by itself.

**Manual check:**
1. The donut shows Lunch and Dinner with shares adding to 100%.
2. **Category** switches the slices and the heading.
3. Changing month with ‹ › animates the arcs.
4. The quick win shows the spinner, then an action, after **Simulate 30 days** on the Data page.

Known gaps:
- **No component-level tests.** The React components have no tests because the project has no DOM test setup; logic is tested through the pure helpers and the opt-in Playwright test.
- **The toggle isn't kept in the URL.** The view isn't in the URL like the other filters.

## Commit history (branch `ui`)

| Commit | Change |
|---|---|
| `37b8c2c` | First quick win card (`bestQuickWin`) on the dashboard |
| `c78881b` | Breakdown endpoint and the reference-style dashboard with the donut |
| `e3afe48` | Category and service filters removed; the donut keeps its own toggle |
| next commit | `splitItems` extracted and tested; this handoff |
