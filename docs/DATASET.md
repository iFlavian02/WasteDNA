# Restaurant dataset

Owner: member 4. The CSV contract itself is defined in [API.md](API.md#upload-a-csv); member 1's validator is the production authority. This file documents the shipped data files, units and missing-data rules.

## Files

| File | Purpose |
|---|---|
| `data/template.csv` | Downloadable template: header plus two example rows. Served by member 1 at `GET /api/template.csv`. |
| `data/demo/restaurant_minimal_synthetic.csv` | Small **synthetic** dataset (simulated sales, not real records) for early development and tests. 4 dishes, 2 services, 56 days (2025-06-01 to 2025-07-26), 376 rows. |
| `scripts/generate_synthetic.py` | Deterministic generator (`--profile minimal`, seed 42). |

The full demo (seed 42, 180 days, 16 dishes, weather/calendar context, planted effects with generator truth stored separately) is not built yet. It is a later item in the [member 4 plan](team/MEMBER_4_DATA_DECISIONS.md).

Regenerate the minimal CSV from the repository root:

```bash
python scripts/generate_synthetic.py --profile minimal --out data/demo/restaurant_minimal_synthetic.csv
```

The SHA-256 of the output is stable across runs. `backend/tests/decisions/test_contracts_and_data.py` checks that the committed CSV matches the generator.

## Columns and units

One row per unique `(date, dish_id, time_slot)`. The file is UTF-8, comma-separated, with `\n` line endings.

| Column | Required | Unit / format |
|---|---|---|
| `date` | yes | `YYYY-MM-DD` |
| `dish_id` | yes | opaque string; name, category and cost are constant per dish |
| `dish_name` | yes | text (may contain Romanian diacritics) |
| `category` | yes | text, e.g. `soup`, `main`, `dessert`, `salad` |
| `time_slot` | yes | `lunch` or `dinner` |
| `prepared_qty` | yes | integer portions, `>= 0` |
| `sold_qty` | yes | integer portions, `0 <= sold_qty <= prepared_qty` |
| `unit_cost_ron` | yes | RON per portion, finite, `> 0` |
| `unit_price_ron` | no | RON per portion |
| `stockout_confirmed` | no | `true` / `false` (lowercase). **Member 1:** please confirm that the validator accepts this spelling. |

## Missing-data rules

- A missing day or service is **not** zero demand and is never filled with zeros.
- `unsold = prepared - sold` is unsold surplus. It does not prove that food was discarded.
- `sold_qty == prepared_qty`, or `stockout_confirmed = true`, means demand is censored: real demand may have been higher.
- Missing context (weather or calendar) stays missing and is never filled in.

## What the minimal synthetic data contains

These behaviours are planted on purpose so features have something to find. All of them are simulated:

- Sales are `min(prepared, latent demand)`, where demand is Poisson around a per-dish/service mean with a +20% weekend effect.
- On Friday dinner the kitchen prepares about 25% extra with no extra demand, so the unsold share is higher.
- `dish-04` appears only in the last 20 days. The simulator therefore falls back from weekday history to service history for this dish.
- About 70% of real stockouts carry `stockout_confirmed = true`.
