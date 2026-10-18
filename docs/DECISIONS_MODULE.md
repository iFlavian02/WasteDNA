# Decisions module (member 4): how to use it

This module computes recommendations, the what-if simulator and, later, surplus forecasts. Public contracts are in `backend/app/contracts/decisions.py` and functions are in `backend/app/decisions/`. Field semantics follow [API.md](API.md#shared-result-envelope-and-owner-handoff).

| Function | Status | Consumer |
|---|---|---|
| `simulate(rows, selection) -> SimulationResult` | implemented, tested | member 1: `POST /api/datasets/{id}/simulate` |
| `build_recommendations(patterns) -> RecommendationsResult` | implemented, tested against member 2's real `analyze_patterns` | member 1: orchestration |
| `word_recommendations(result, patterns, *, enabled, api_key, model, client) -> RecommendationsResult` | implemented, tested with a fake client (P2, optional) | member 1: config flag, `anthropic` dependency, orchestration (requested) |
| `forecast_surplus(history, horizon_days) -> ForecastResult` | implemented, tested, including with member 3's real `extract_surplus_history` | member 3: `GET /api/redistribution/forecasts` |

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
- Titles frame each change as a test, because a supported association is evidence for an experiment rather than a guaranteed production reduction.
- Each explanation has two labeled parts. `Observed evidence` reports the group unsold share, support days, comparable-baseline unsold share, and effect in percentage points. `Suggested experiment` gives a concrete next step and asks the user to review both unsold and stockout results before adopting it.
- Text only uses numbers from the pattern (group and baseline unsold share, effect in percentage points, support days). IDs, evidence references, opportunities, effort, ranking, and simulator selection remain unchanged.
- Effort labels:
  - Weekday or service context: `low` for one dish, `medium` for a category.
  - Weather or university context: `medium` for one dish, `high` for a category. These need planning ahead.
- If the patterns are `insufficient_data` or empty, the result is `insufficient_data` with one "Build comparable sales history" action, empty evidence and `null` opportunity. It explains that both the observed group and comparable baseline need 12 distinct days and 100 prepared portions, and preserves the analytics limitation so the user can see the dataset-specific reason.
- Recommendation wording consistently says `unsold`; it never treats unsold portions as confirmed discarded food. The result limitations state this distinction explicitly.
- On the full demo the three actions are: Friday mains (medium), dish-05 during university break (medium), and desserts on rain days (high).

## Inactive external wording helper

`backend/app/decisions/wording.py` is an optional helper left from an earlier P2 experiment. It is inactive for this prototype: orchestration calls `build_recommendations` directly, there is no runtime enable flag or API key configuration, and no external wording service is called. The deterministic templates above are the complete product path. The example below is library-level usage for a future integration, not active application configuration.

```python
from app.decisions import build_recommendations, word_recommendations

result = build_recommendations(patterns)
result = word_recommendations(result, patterns, enabled=settings.llm_enabled, api_key=settings.anthropic_api_key)
```

- **What Claude receives:** action IDs, the current title, effort, and each evidence pattern's factor, unsold shares and effect in pp. Nothing else: no CSV rows, no dish costs, no key. Model `claude-opus-5-5` by default, effort `low`, JSON-schema output.
- **What it may change:** only `title`, and the advice part of `description`. The description keeps the deterministic first sentence, which carries every number. Then comes Claude's advice. IDs, effort, evidence and opportunity never change. One limitation line is added: "Action titles and advice were worded by Claude…".
- **Validation:**
  - the IDs returned must be exactly the IDs sent, each once;
  - the title is 3–80 characters and the advice 10–240;
  - **no digit at all** in Claude's text;
  - no extra fields.
- **Fallback:** in every one of these cases the result returned is the identical deterministic object:
  - the flag is off;
  - there is no key;
  - the `anthropic` SDK is not installed;
  - a timeout (8 s, no retries) or any API error;
  - a refusal or truncated output;
  - invalid JSON or a failed validation.
- **Cache:** in memory, keyed on the SHA-256 of the model plus the prompt input (256 entries). A recomputed analysis with the same patterns does not call Claude again.
- **Logs:** only the exception class name. Never the prompt, the key or the response.
- **Tests:** `backend/tests/decisions/test_wording.py`, with no network: success, timeout, API error, invalid JSON, wrong shape, refusal, truncation, unknown or repeated ID, digits in the title or advice, flag off, missing key, missing SDK, insufficient data, cache, contract.

## Recommendations contract

`RecommendationsResult` has `status`, `items` (at most 3 `RecommendationAction`s with unique `id`, `title`, `description`, `effort` = `low|medium|high`, `evidence_pattern_ids`, `opportunity_ron_per_30_days`) and `limitations`. With `insufficient_data`, actions carry no evidence and a `null` opportunity, and `limitations` must give a reason. Never sum opportunities across actions.

## Surplus forecasts

```python
from app.redistribution import extract_surplus_history   # member 3
from app.decisions import forecast_surplus

history = extract_surplus_history(repo, session_id, now)  # list[SurplusObservation]
result = forecast_surplus(history, horizon_days=7)        # ForecastResult; optional generated_at=...
result.model_dump(mode="json")
```

- **Input:** member 3's `SurplusObservation` records. Per donor, the records of a day are summed. A day counts only if **all** its records have `is_complete_observation=true`. Incomplete days are excluded and counted in `excluded_incomplete_days`. Absent days stay absent and are never treated as zero. A record with quantity 0 and `is_complete_observation=true` is a real zero-surplus day.
- **Support:** at least 60 complete days per donor. Otherwise that donor is `insufficient_data`, with a reason. If a donor mixes units, it is `insufficient_data` too: no conversion is assumed.
- **Method:** distinct dates are split in time order into 60% train, 20% calibration and 20% test. Two candidates are compared:
  - `weekday_median`: the baseline.
  - `weekday_profile_recent_level`: the weekday profile times the mean of the last 28 days.
- **Choice and reporting:** the method with the lower **calibration** MAE is published, and ties keep the baseline. `model_mae` and `baseline_mae` are measured on the **test** days, so the baseline can win and this stays visible.
- **Interval:** an 80% empirical interval from calibration residuals (`lower`, `upper`), with its coverage on test days in `interval_coverage_test`.
- **Output:** forecasts start the day after the latest history date, the same start for every donor, and run for `horizon_days` days (1–60). `status` is `ready` when at least one donor is ready. The unit is echoed from the history (`kg` or `portions`), and values are never converted.
- **No side effects:** no database, HTTP or donation imports. Forecasts never create offers, reservations or route stops.
- **Real data:** complete history comes from member 3's donor-confirmed daily surplus log (`POST /api/redistribution/surplus-log`, where `0` kg is a confirmed zero day). A logged day becomes one complete record; days with only offers stay incomplete and are excluded.
  - On member 3's seeded demo (`create_demo_session(..., with_surplus_history=True)`, which `POST /api/redistribution/demo` uses), the restaurant (90 days) and supermarket (75 days) are `ready` and the household (30 days) is `insufficient_data`.
  - With offers only (`with_surplus_history=False`), every donor is `insufficient_data`, with the reason "offers do not show total surplus".
  - Both cases are tested in `backend/tests/decisions/test_forecasting.py` (`test_real_member_3_*`).
- **Field names vs API.md:** API.md mentions `predicted_quantity_kg`. The contract instead uses `predicted_quantity` plus an explicit `unit`, so portions can be expressed without renaming. Member 1 should adjust API.md, or reply if a rename is preferred.

## Fixtures

These are domain result objects, not HTTP wrappers. All four are validated in `backend/tests/decisions/test_contracts_and_data.py`.

- `docs/fixtures/decisions/simulation_ready.json`: real `simulate` output on `data/demo/restaurant_minimal_synthetic.csv` for dish-01 / Friday / dinner / 15. The test re-runs the simulator and asserts equality.
- `docs/fixtures/decisions/simulation_insufficient_data.json`
- `docs/fixtures/decisions/forecast_ready.json` and `forecast_insufficient_data.json`: real `forecast_surplus` output on the synthetic complete history defined in `backend/tests/decisions/test_forecasting.py::fixture_history`. It covers three donors: one ready, one supermarket with offers-only (incomplete) history, and one household with only 30 days.
- `docs/fixtures/decisions/recommendations_ready.json` and `recommendations_insufficient_data.json`: real `build_recommendations` output on member 2's `patterns_ready.json` and `patterns_insufficient_data.json`. The test re-runs the function and asserts equality.

## Tests

```bash
python -m pytest backend/tests/decisions
```

## Frontend: actions, simulator and report (`frontend/src/features/decisions/`)

**Status:** implemented and checked in the browser against the real backend. It is not yet reachable from the app: member 1 must register the route.

- **Mount:** the default export of `index.jsx` goes at `/decisions/*`, with props `{ api, datasetId, isSynthetic }`, as agreed in `docs/fixtures/platform/REQUESTS.md`.
- **Sub-routes:** `actions`, `simulator` and `report`. The index redirects to `actions`.
- **Links:** sub-page links are built from the mount path, because React Router v7 resolves relative links inside a `*` route from the full URL. The feature works under any mount path.

| File | Role |
|---|---|
| `index.jsx` | Routes and tab bar, plus a "Simulated sales" badge when `isSynthetic` |
| `Actions.jsx` | `GET .../recommendations` (and `.../patterns` for evidence). Cards show effort, an indicative opportunity (never a total) and evidence IDs. Their only action, "Try it in the simulator", passes a selection from the evidence pattern (`simulatorSelectionFor(action, patterns, summary)`): its dish, or for a category pattern the highest-ranked dish-level pattern with the same condition and category (then the category's top dish by unsold cost); the weekday (default Friday); and the pattern's service, otherwise dinner if the dish has it, else its only service. |
| `Simulator.jsx` | One `POST .../simulate` per dish/weekday/service, with `requested_quantity: 0`, so the whole curve comes back. The slider then reads the curve locally, with no request per move (about 50 ms per update, measured). Shows figures per service, the sold-out warning, a two-line chart with a table view, and the limitations |
| `Report.jsx` | Reads the component endpoints `summary`, `patterns`, `model` and `recommendations`, not `/analysis`, which has no model yet. A missing, pending or insufficient part shows a sentence instead of breaking the report. A "Print report" button calls `window.print()`; the feature hides its own controls with `.decisions-noprint` |
| `useComponent.js` | Loads `GET /api/datasets/{id}/{component}` and polls every 1.5 s while the state is `queued` or `running`. It stops on a terminal state, an error or unmount. It will be replaced by member 1's shared helper if one is published |
| `logic.js` | Pure helpers: curve point, slider range, figures, action rows, dish options, report sections and formatters. Unit-tested in `logic.test.js` |
| `decisions.css` | Feature-scoped styles: every rule starts with `.decisions`, plus print rules for the feature's own elements |
| `preview/` | **Dev-only harness**, not in the build. It mounts the page with a demo dataset until member 1 registers the route |

- **Prefill:** only `category` and `description` are sent, never a quantity or a deadline, because portions are not converted to kg.
  - Category mapping in `logic.js` (`OFFER_CATEGORY`): `soup`, `main`, `side` and `daily_menu` → `prepared_meals`; `dessert` → `bakery`.
  - Default: `prepared_meals`. This waits for member 3's confirmation.
- **Dish list:** the simulator lists dishes from `summary.result.top_dishes` (5 dishes) plus dishes named in patterns, and has a free "dish ID" field. It will use `summary.result.dishes` automatically once member 1 adds that field (requested).

Run from `frontend/`:

```bash
node --test src/features/decisions/logic.test.js
```

```bash
npm run lint
```

```bash
npm run build
```

To preview locally:
1. Start the backend: `uvicorn app.main:app --app-dir backend` from the repository root.
2. Run `npm run dev` in `frontend/`.
3. Open http://localhost:5173/src/features/decisions/preview/index.html.
