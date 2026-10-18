# Simulated inventory connection

**Demo assumption:** WiseEat is connected to the restaurant's inventory system, so sales data is "already loaded" and kept up to date. There is no real inventory integration. The backend generates a realistic history for one small restaurant ("Bistro Copou") and can extend it 30 days at a time, so the dashboard can be shown evolving. Everything it produces is flagged `is_synthetic: true` and labelled "Simulated sales" in the UI.

Code: `backend/app/inventory/` (generator and service) and `backend/app/api/inventory.py` (routes), registered in `backend/app/main.py`. Tests: `backend/tests/inventory/test_inventory.py`. Written on branch `ui` by member 3.

## The simulated restaurant

`generator.generate_days(seed, start, days)` returns rows in the CSV template schema (`data/template.csv`):

- **Menu:** 11 dishes (soups, mains, a weekday-only daily menu, sides, desserts) with Romanian names, real-looking costs and prices in RON, and lunch and dinner services. Closed on 25 December and 1 January.
- **Size:** about 210–240 portions prepared a day, 15–20% unsold, roughly 9–11k RON of unsold production cost a month.
- **Demand:** Poisson per dish and service, scaled by:
  - weekday (Friday and Saturday busy, Monday quiet)
  - a monthly season (summer terrace, December holidays, quiet January)
  - a daily shock (lognormal, plus about 3% quiet and 3% busy days)
- **Kitchen plan:** usual demand × the known weekday pattern × the season, adopted halfway and a month late, plus noise. Sold = min(prepared, demand). Stock-outs are flagged 70% of the time.
- **Planted habits** that insights can find:
  - Mondays are planned like a normal day while demand is about 20% lower.
  - Dinner desserts are prepared about 30% above plan.
  - The daily menu loses about 30% of demand on Fridays.
- **Determinism:** each date has its own random stream (`seed`, date ordinal). Extending a history never changes earlier days, and the full history can be rebuilt from `(seed, start, days)`.

Dates after the end of `data/context/context_daily.csv` have no weather or calendar context, so analysis simply treats it as missing.

## API

All routes are under `/api`. Errors use the common envelope.

| Route | Result |
|---|---|
| `POST /inventory/connect` | Returns the newest active connected dataset (**200**), or creates one with 90 days ending yesterday in Europe/Bucharest (**202**, analysis starts in the background). Because it reuses the dataset, repeated connects do not hit `MAX_DATASETS`. |
| `GET /inventory/{dataset_id}` | Connection info (below). 404 for unknown datasets and for uploads. |
| `POST /inventory/{dataset_id}/simulate` | Body `{ "days": 30 }` (1–90, default 30). Appends simulated days after the last one, keeps the dataset ID, recomputes the summary and reruns analysis (**202**). |
| `POST /inventory/{dataset_id}/reset` | Replaces the history with a fresh 90 days up to yesterday, using a new seed (**202**). |

Connection info, returned by every route:

```json
{ "dataset_id": "ds-…", "source": "inventory", "is_synthetic": true, "status": "processing",
  "created_at": "…", "restaurant": "Bistro Copou", "history_from": "2026-07-20",
  "history_to": "2026-10-17", "history_days": 90, "simulated_days": 0, "max_days": 366 }
```

Refusals:
- **409:** the dataset is an upload or demo import ("only a connected inventory can be simulated"), analysis is still running, or `MAX_DATASETS` is reached on the first connect.
- **422:** the history would exceed 366 days, the CSV parser's limit; reset to start again.
- **404:** the dataset is unknown or expired.
- **400:** an invalid `days`.

After `simulate` or `reset`, the existing dataset routes (`GET /api/datasets/{id}`, `/summary`, `/patterns`, …) serve the new history. The summary is ready immediately; other components go through `queued` → `running` → terminal again. Connected datasets get a fresh 24-hour TTL on every change, and the shell reconnects when one expires.

## Dashboard breakdown

`GET /api/datasets/{dataset_id}/breakdown?from=YYYY-MM-DD&to=YYYY-MM-DD&category=…&time_slot=lunch|dinner` works for any dataset, uploaded or connected. All parameters are optional, and without `from`/`to` it covers the whole history. Code: `backend/app/services/breakdown.py` and `backend/app/api/breakdown.py`, registered before the datasets router because `/datasets/{id}/{component}` would otherwise catch it. Tests: `backend/tests/inventory/test_breakdown.py`.

The response holds:

- `period` (`from`, `to`, `calendar_days`) and `filters`
- `available`: the whole dataset's date range
- `options`: the dataset's categories and services, unaffected by filters
- `totals`: prepared, sold and unsold portions, `unsold_cost_ron`, `unsold_rate` (null without production) and `days_with_data`
- `daily`: one entry per date with portions and `unsold_cost_ron`
- `by_weekday`: Monday to Sunday, with days, unsold portions per day and unsold cost per day (null without days)
- `by_time_slot` and `by_category`
- `top_dishes`: the top 5 by unsold cost
- `latest_batches`: up to 6 unsold items of the last date in the selection

Unsold cost is (prepared − sold) × `unit_cost_ron`, the same formula as the summary. Errors:
- **400:** `from` after `to`, a malformed date or an unknown `time_slot`.
- **404:** the dataset is unknown or expired.

## Frontend use

- **Shell (`App.jsx`):** without a selected dataset it calls `POST /api/inventory/connect` (one request at a time) and stores `{ dataset_id, is_synthetic, source }`. A missing connected dataset reconnects silently. A missing upload shows a notice, then reconnects.
- **Dashboard and Data page:** `features/platform/useInventory.js` loads the connection info and offers `simulate(days)` and `reset()`. On the dashboard, "Simulate 30 days" sits next to the greeting. Simulated weeks are shaded in the waste trend, and the unsold-portions card compares the last 30 days with the 30 before. The Data page also has "Reset history" and, for uploads, "Reconnect inventory".
- **Removed from the UI:** the 180-day `POST /api/datasets/demo` import. The route still exists, and member 4's demo script and the feature preview apps use it.
