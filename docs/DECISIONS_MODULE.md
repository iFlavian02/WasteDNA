# Decisions module (member 4): how to use it

This module computes recommendations, the what-if simulator and, later, surplus forecasts. Public contracts are in `backend/app/contracts/decisions.py` and functions are in `backend/app/decisions/`. Field semantics follow [API.md](API.md#shared-result-envelope-and-owner-handoff).

| Function | Status | Consumer |
|---|---|---|
| `simulate(rows, selection) -> SimulationResult` | implemented, tested | member 1: `POST /api/datasets/{id}/simulate` |
| `build_recommendations(patterns) -> RecommendationsResult` | implemented, tested against member 2's real `analyze_patterns` | member 1: orchestration |
| `forecast_surplus(history, horizon_days) -> ForecastResult` | not started (M2) | member 3: forecasts endpoint |

## Simulator

```python
from app.contracts.decisions import SimulationSelection
from app.decisions import simulate

selection = SimulationSelection(dish_id="dish-01", weekday="Friday", time_slot="dinner", requested_quantity=15)
result = simulate(rows, selection)   # rows: validated DataFrame from member 1
result.status                         # "ready" | "insufficient_data"
result.model_dump(mode="json")        # domain result; the platform wraps it as {status, result, limitations}
```

- **Input:** the validated DataFrame uses the CSV column names. `date` must be a date or parseable value. `stockout_confirmed` is optional (bool, or `"true"`/`"false"`). The input is never mutated, and no model is trained.
- **History:**
  - At least 8 days of `dish_id + weekday + time_slot` gives `basis="dish_weekday_slot"`.
  - Otherwise, at least 12 days of `dish_id + time_slot` gives `basis="dish_slot"`, with a limitation that announces the fallback.
  - Otherwise the result is `insufficient_data`, `basis="none"`, an empty curve, `null` baseline/cost/selected point, and `support_days` = the number of available `dish+slot` days. An unknown dish also returns `insufficient_data`, not an error, so the endpoint answers HTTP 200.
- **Curve:** the curve has every integer `quantity` from 0 to `max(requested, baseline, max sold, max prepared)`. With historical sales `S_j`:
  - `waste_proxy_portions = mean(max(q - S_j, 0))`
  - `shortage_lower_bound_portions = mean(max(S_j - q, 0))`
  - `risk_lower_bound = mean(S_j > q)`
  - `production_cost_change_ron_per_service = (baseline - q) * unit_cost_ron`. This is RON **per service** and is production cost avoided, not profit.
- **Baseline:** `baseline_quantity` is the median prepared quantity, rounded half up. `unit_cost_ron` is the median unit cost of that history.
- **`censored_demand`:** `true` if any history day sold out (`sold == prepared`) or has `stockout_confirmed`. A limitation then warns that shortage and risk may be underestimated.
- **Frontend:** fetch the curve once per selection, then move the slider locally over `curve[q]`. There is no request per slider move.

## Recommendations

```python
from app.analytics import analyze_patterns
from app.decisions import build_recommendations

patterns = analyze_patterns(rows, context)      # member 2
result = build_recommendations(patterns)        # RecommendationsResult
```

- Patterns are taken in member 2's ranking order, and at most 3 actions are returned. Each action cites exactly one pattern (`evidence_pattern_ids`). Its id is `action-<pattern id>`, and its opportunity is copied from that pattern.
- No double counting: a dish pattern and a category pattern with the same context and identical group and baseline metrics describe the same rows (for example, a dish that is the only member of its category). Only the first one becomes an action. Never sum opportunities across actions.
- Text only uses numbers from the pattern (group and baseline unsold share, effect in pp, support days).
- Effort labels:
  - Weekday or service context: `low` for one dish, `medium` for a category.
  - Weather or university context: `medium` for one dish, `high` for a category. These need planning ahead.
- If the patterns are `insufficient_data` or empty, the result is `insufficient_data` with one "Collect more sales history" action, empty evidence and `null` opportunity.
- On the full demo the three actions are: Friday mains (medium), dish-05 during university break (medium), and desserts on rain days (high).

## Recommendations contract

`RecommendationsResult` has `status`, `items` (at most 3 `RecommendationAction`s with unique `id`, `title`, `description`, `effort` = `low|medium|high`, `evidence_pattern_ids`, `opportunity_ron_per_30_days`) and `limitations`. With `insufficient_data`, actions carry no evidence and a `null` opportunity, and `limitations` must give a reason. Never sum opportunities across actions.

## Fixtures

These are domain result objects, not HTTP wrappers. All four are validated in `backend/tests/decisions/test_contracts_and_data.py`.

- `docs/fixtures/decisions/simulation_ready.json`: real `simulate` output on `data/demo/restaurant_minimal_synthetic.csv` for dish-01 / Friday / dinner / 15. The test re-runs the simulator and asserts equality.
- `docs/fixtures/decisions/simulation_insufficient_data.json`
- `docs/fixtures/decisions/recommendations_ready.json` and `recommendations_insufficient_data.json`: real `build_recommendations` output on member 2's `patterns_ready.json` and `patterns_insufficient_data.json`. The test re-runs the function and asserts equality.

## Tests

```bash
python -m pytest backend/tests/decisions
```
