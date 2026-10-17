# Restaurant dataset

Owner: member 4. The CSV contract itself is defined in [API.md](API.md#upload-a-csv); member 1's validator is the production authority. This file documents the shipped data files, units and missing-data rules.

## Files

| File | Purpose |
|---|---|
| `data/template.csv` | Downloadable template: header plus two example rows. Served by member 1 at `GET /api/template.csv`. |
| `data/demo/restaurant_minimal_synthetic.csv` | Small **synthetic** dataset (simulated sales, not real records) for early development and tests. 4 dishes, 2 services, 56 days (2025-06-01 to 2025-07-26), 376 rows. |
| `data/demo/restaurant_demo_synthetic.csv` | **Full synthetic demo** used by "Load demo data": seed 42, 180 days (2025-06-01 to 2025-11-27), 16 dishes, lunch and dinner, 5,580 rows. `dish-05` (daily menu) is served at lunch only. |
| `data/demo/truth/restaurant_demo_truth.json` | Generator truth: planted effects, anomalies, test period. **Never use as a model input.** |
| `data/demo/truth/restaurant_demo_latent_demand.csv` | Latent demand per row, for verification only. **Never use as a model input.** |
| `data/context/weather_iasi.csv` | Open-Meteo daily snapshot for Iași: `temperature_mean_c`, `precipitation_mm`. |
| `data/context/calendar_iasi.json` | UAIC university periods and the 2025 Parascheva pilgrimage. Each interval links a primary source. |
| `data/context/sources.json` | Source ledger: URL, access time, period, `is_synthetic`. |
| `data/context/context_daily.csv` | The date-keyed `context` table for `analyze_patterns(rows, context)`, one row per date. |
| `docs/fixtures/analytics/operations_ready.json` | Valid operational import with 13 before/after-18:00 comparisons, a menu change, an opening-hours change, confirmed destinations and deliberately unknown destinations. |
| `scripts/generate_synthetic.py` | Deterministic generator: `--profile minimal` or `--profile demo` (seed 42). |
| `scripts/fetch_weather.py` | Refreshes the weather snapshot. This is the only step that needs network access. |
| `scripts/prepare_dataset.py` | Builds `context_daily.csv` from weather and calendar. Also exposes `load_context()`. |

Regenerate everything from the repository root. Only the first command needs network access; the demo works offline from the committed files:

```bash
python scripts/fetch_weather.py --start 2025-06-01 --end 2025-11-27
```

```bash
python scripts/prepare_dataset.py
```

```bash
python scripts/generate_synthetic.py --profile demo
```

```bash
python scripts/generate_synthetic.py --profile minimal
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
- Missing `discarded_qty`, `donated_qty`, or `carried_over_qty` in operational observations means unknown, never zero. Only confirmed destination quantities are counted.

## Operational observations

Operational records are imported separately through `POST /api/datasets/{dataset_id}/operations`; they do not change the original daily CSV. Timestamps require an explicit UTC offset, must stay inside the declared date, and intervals for the same dish/date may touch but must not overlap. Known destination quantities cannot exceed `prepared_qty - sold_qty`. Menu versions and opening-hours periods are inclusive and cannot overlap for the same dish or weekday.

The diagnostic comparison uses only intervals entirely before or entirely after 18:00. A crossing interval is retained but is not split. Both sides need 12 dates and 100 prepared portions. Cards show `unsold / prepared` and, only when sales are positive, the separate `unsold / sales` value.

## What the minimal synthetic data contains

These behaviours are planted on purpose so features have something to find. All of them are simulated:

- Sales are `min(prepared, latent demand)`, where demand is Poisson around a per-dish/service mean with a +20% weekend effect.
- On Friday dinner the kitchen prepares about 25% extra with no extra demand, so the unsold share is higher.
- `dish-04` appears only in the last 20 days. The simulator therefore falls back from weekday history to service history for this dish.
- About 70% of real stockouts carry `stockout_confirmed = true`.

## Context table (`data/context/context_daily.csv`)

| Column | Meaning |
|---|---|
| `date` | unique per row |
| `temperature_mean_c`, `precipitation_mm` | Open-Meteo daily values for the Iași grid cell. Empty means missing. |
| `rain_bin` | `rain` if precipitation is at least 1.0 mm, `dry` otherwise, empty if precipitation is missing. Over the demo period: 46 rain days and 134 dry days. |
| `university_state` | `term` or `break` (member 2's pattern vocabulary). Empty outside a verified interval. |
| `university_period` | `teaching`, `exams` or `vacation`, for detail. |
| `event_id` | `parascheva_pilgrimage_2025` from 8 to 15 October 2025, otherwise empty. |

Verified intervals:

- UAIC 2024-2025: teaching until 8 June, exams 9–29 June, vacation 30 June – 28 September 2025.
- UAIC 2025-2026: teaching from 29 September 2025.
- Pilgrimage: 8–15 October 2025, from the Metropolitan Cathedral program.

These dates are real. Their effect on the demo sales is **simulated**. The pilgrimage has no planted effect; it is present as context only.

Load the context in Python with `pd.read_csv("data/context/context_daily.csv", parse_dates=["date"])`, or call `load_context()` from `scripts/prepare_dataset.py`.

## What the full synthetic demo contains

The kitchen plans each dish from its usual demand, including a +15% weekend effect it knows about, times 1.08 plus noise. Sales are `min(prepared, demand)`. Three recurring effects are planted, written in member 2's factor vocabulary:

| Effect | Factor | Mechanism |
|---|---|---|
| Friday overproduction of mains | `category=main`, `weekday=Friday` | prepared ×1.30, demand unchanged |
| Rain lowers dessert demand | `category=dessert`, `rain_bin=rain` | demand ×0.65, kitchen does not adapt |
| Daily menu during university break | `dish_id=dish-05`, `university_state=break` | demand ×0.55, kitchen does not adapt |

There are five late anomalies (batches at 3.0× the plan: 2025-10-30 dish-06 dinner, 2025-11-05 dish-01 lunch, 2025-11-12 dish-12 dinner, 2025-11-19 dish-11 dinner, 2025-11-25 dish-04 lunch) between 2025-10-30 and 2025-11-25, inside the last 20% of dates (test period from 2025-10-24). Overall unsold rate is about 17%, and about 37% of rows sold out, so demand is censored there.

Verified on 2026-10-17: member 2's `analyze_patterns(rows, context)` ranks the three planted effects as its top patterns, and `build_recommendations` turns exactly those into the three actions.
