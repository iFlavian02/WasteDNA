# Member 4 — Demo data, recommendations and simulator

Branch: `feature/data-simulator`. Read [coordination and ownership](README.md). Deliver the shared restaurant data early, then decision functions and their frontend. Your calculations can run without HTTP or a trained model.

## Rules for agents working in parallel

These plans are independently developable after a shared contract setup, not completely dependency-free. A separate branch prevents neither incompatible interfaces nor conflicting edits by itself.

1. Before dependent implementation, confirm the shared setup checkpoint: API request/response shapes, CSV columns and units, internal function signatures, common errors/states, and small example fixtures are agreed and committed to `main`. Record that commit in your Progress section and update your branch from it. The planned 30–45 minutes is an estimate, not automatic approval that setup is complete.
2. If the checkpoint is incomplete, continue isolated work in your owned area and identify the exact missing contract to its owner. Do not invent a competing interface or wait for another member's entire plan to finish.
3. Work only in your assigned files and branch. Request changes to shared files from their owner; record an agreed ownership transfer before editing outside your scope. Agents running simultaneously on one machine need separate worktrees/checkouts; never switch branches in a shared working directory while another agent is using it.
4. Use agreed fixtures or injected test doubles for unavailable dependencies. Keep them explicit and confined to tests or fixture mode; never return mock results as a normal successful analysis or silently replace a failed upload. Implement the real integration when the producer's module is available.
5. Treat contracts as shared agreements. Coordinate field/signature changes with affected owners before implementation, update schemas/examples and documentation through their owners, and do not fork or duplicate another member's production logic.
6. Hand off small completed slices with the interface, example input/output, verification results and remaining dependencies. Integrate through small pull requests and bring merged `main` changes into your branch regularly, within the session's Git permissions. Branch completion is not a prerequisite for integration.
7. Track implementation, fixture-based verification and real integration separately in Progress. Do not mark a cross-member feature complete until it works with the actual modules. When blocked on one dependency, continue other owned tasks and report the specific blocker.

Your dependencies: Develop the generator and simulator using the agreed CSV format, and recommendations using member 2's agreed pattern fixture. Publish the minimal CSV early rather than waiting for the full generator. Connect actual member 2 results when available; member 1 exposes your functions through the API. Later forecasting depends on member 3's agreed history format, not completion of their whole module.

## Master-plan responsibility

Own 1.3–1.4, recommendations in 4.1–4.2, actions/report in 4.3, simulator calculations/UI in 5.1–5.2, and forecast calculations in 10.2. Coordinate 7.1 and 11.1 rehearsal. In 8.1, own operational demo data/documentation; member 1 validates it, member 2 analyzes it. Member 1 owns demo cache persistence; member 3 owns donation fixtures and forecast-history extraction.

## Owned files

`backend/app/contracts/decisions.py`, `backend/app/decisions/*`, `backend/tests/decisions/*`, generation/context/demo-build scripts listed in the coordination plan, `data/template.csv`, `data/context/*`, restaurant `data/demo/*` excluding `redistribution/`, `docs/{DATASET,DEMO_SCRIPT}.md`, `docs/fixtures/decisions/*`, `frontend/src/features/decisions/*`.

## Build sequence

### 1. Immediate shared data and schemas

- [x] Publish a minimal valid CSV and template immediately, using the master-plan column names. Label synthetic data explicitly. Document units and missing-data rules in `DATASET.md`.
- [x] Define `RecommendationsResult`, simulator selection/`SimulationResult`, and later `ForecastResult` with member 1. Use member 2's agreed pattern fixture to develop recommendations before real patterns arrive.
- [x] Prepare deterministic full demo: seed 42, 180 days, 16 dishes, two services, repeated effects and late anomalies. Store generator truth separately from model inputs.
- [x] Fetch/version context and source metadata; unavailable context remains missing. Verify real calendar claims from primary sources during implementation.
- [x] Tests: stable generation hash, valid quantities, no duplicated context join rows, correct dates, sufficient planted-pattern support. Member 1's validator is the authority; do not create a competing production parser.

### 2. Recommendations and simulator

- [x] Implement `build_recommendations(patterns)` with at most three evidence-linked actions, effort labels and no double counting; insufficient patterns prompts collection of more data.
- [x] Implement `simulate(rows, selection)` using master-plan support thresholds, fallback, empirical curve and censored-demand warnings. Return all integer curve points needed by the slider.
- [x] Tests: S=[10,20,30], P=20 gives surplus and shortage proxies of 10/3; monotonicity, zero baseline cost difference, insufficient data, zero sales and absence of model dependency. Recommendations refer only to supplied pattern IDs/metrics.
- [x] Verification: `pytest backend/tests/decisions`; hand real outputs to member 1 for API integration. Member 1 owns endpoint and cached demo lifecycle.

### 3. Actions, simulator and report frontend

- [ ] Build actions page, local slider and printable report with member 1's client and member 2's result fields. Fetch curves once per selection; slider changes stay local.
- [ ] Pass optional donation prefill to member 3's page; never automatically publish a model-estimated offer.
- [ ] Verify print layout, missing-model states, curve selection changes, latency under one second and consistent units; run frontend lint/build.
- [ ] Draft a three-minute demo script using actual calculated outputs and explicit synthetic labels; collect each owner's completed features before rehearsal.

### 4. Later forecasts and optional wording

- [x] Implement `forecast_surplus(history, horizon_days)` using member 3's complete history contract, temporal splits, sufficient support and baseline comparison. Preserve original units and distinguish missing days from confirmed zero surplus.
- [x] Tests: no leakage, insufficient history, interval calibration/test separation, model versus baseline, no donation writes. Provide result fixtures to member 3 for their forecasts endpoint/UI.
- [ ] Add optional Claude only after deterministic actions work; validate IDs, reject invented metrics, and retain timeout/error fallback. Operational hourly fixtures follow the validated schema agreed by members 1 and 2.

## Avoid overlap

Do not implement a second pattern/anomaly engine, CSV validator, analysis API, donation matcher or donation UI. Your forecast is for future surplus; member 2's model explains/evaluates restaurant waste. Coordinate shared model utilities through their owner rather than copying them.

## Progress

Record completed item, commit, verification command/result and remaining dependency here.

### 2026-10-17 — first slice (branch `Data_decisions`, based on `main` a47538f)

- Done: `data/template.csv`, synthetic `data/demo/restaurant_minimal_synthetic.csv` + `scripts/generate_synthetic.py --profile minimal` (seed 42, deterministic hash), `docs/DATASET.md`.
- Done: `backend/app/contracts/decisions.py` (`RecommendationsResult`, `RecommendationAction`, `SimulationSelection`, `CurvePoint`, `SimulationResult`) and four fixtures in `docs/fixtures/decisions/`.
- Done: `simulate(rows, selection)` in `backend/app/decisions/simulator.py`; usage in `docs/DECISIONS_MODULE.md`.
- Verification: `python -m pytest backend/tests` → 24 passed (21 decisions, 3 platform). Fixture-based only; not yet integrated with member 1's validator/endpoint.
- Blocked: `build_recommendations(patterns)` needs member 2's `backend/app/contracts/analytics.py` (`PatternsResult`, step 1 of member 2's plan), present on `origin/DIAGNOSTICS` (040d93c) but not on `main`.
- Open question for member 1: validator spelling for `stockout_confirmed` (`true`/`false`).
- Next: full 180-day generator + weather/calendar context (steps 1.3–1.4), then recommendations once unblocked, then frontend (needs member 1's `src/api/client.js`).

### 2026-10-17 — second slice (branch `Data_decisions`, based on `main` 3875ce2 with member 2's patterns)

- Done: `build_recommendations(patterns)` in `backend/app/decisions/recommendations.py`; recommendation fixtures are now the real output on member 2's pattern fixtures.
- Done: context snapshot in `data/context/`: Open-Meteo weather (`scripts/fetch_weather.py`), UAIC calendar and the 2025 Parascheva pilgrimage verified from primary sources (`calendar_iasi.json`, `sources.json`), daily table `context_daily.csv` (`scripts/prepare_dataset.py`).
- Done: full demo `data/demo/restaurant_demo_synthetic.csv` (`scripts/generate_synthetic.py --profile demo`), truth in `data/demo/truth/`.
- Verification: `python -m pytest backend/tests` → 62 passed. Member 2's real `analyze_patterns` recovers all three planted effects as top patterns on the demo, and `build_recommendations` turns exactly those into the three actions.
- Still open: `ForecastResult` (M2, needs member 3's history contract); member 1 integration (validator, `/simulate` endpoint, orchestration, `/api/template.csv`, demo dataset loading); frontend pages (need member 1's `src/api/client.js` and shell).

### 2026-10-17: third slice (branch `Data_decisions`, based on `main` 2d231aa, which holds all members' work)

- **Done:** `ForecastResult`, `DonorForecast` and `ForecastPoint` in `backend/app/contracts/decisions.py`. `forecast_surplus(history, horizon_days)` in `backend/app/decisions/forecasting.py`. Fixtures `forecast_ready.json` and `forecast_insufficient_data.json`. Usage in `docs/DECISIONS_MODULE.md`.
- **Done:** draft `docs/DEMO_SCRIPT.md`, built from real outputs of all members' functions on the full demo.
- **Verification:** `python -m pytest backend/tests` passed (see commit message). The forecast tests cover:
  - no leakage;
  - insufficient history;
  - offers-only history;
  - missing days versus confirmed zero days;
  - mixed units;
  - no side effects;
  - the fixtures being real output.
  - The real integration with member 3's `extract_surplus_history` on their demo session returns `insufficient_data`, as intended.
- **For member 3:** `forecast_surplus` and the fixtures unblock your `/forecasts` endpoint and UI. To agree: your history marks every record incomplete, so real forecasts need a source of complete daily history (a donor-confirmed daily surplus log that includes zero days). Until then the endpoint should show the `insufficient_data` reasons.
- **For member 2:** the full demo makes `analyze_model` ready: on 36 test days, MAE is 14.98 pp for the model and 16.24 pp for the baseline. Of the 5 planted anomalies listed in `data/demo/truth/restaurant_demo_truth.json`, only 1 is among the 19 flagged. Please check your step 3.3 recovery against that truth file. I can strengthen the planted anomalies if you prefer.
- **For member 1:**
  - Switch `POST /api/datasets/demo` to `data/demo/restaurant_demo_synthetic.csv`, with `data/context/context_daily.csv` as context.
  - Orchestrate `build_recommendations(analyze_patterns(rows, context))`.
  - The forecast field naming note is in `docs/DECISIONS_MODULE.md`.
- **Still open:** frontend pages (blocked on member 1 step 4: shell, routes, `src/api/client.js`). Optional Claude wording (P2, deferred until the core UI works).

### 2026-10-17: replies to requests (after merging `main` 631e45d)

**To member 3**, answering `docs/fixtures/redistribution/REQUESTS.md` § "Request to member 4". `forecast_surplus`, `ForecastResult` and the fixtures are on `Data_decisions`, commit 636bb38; usage is in `docs/DECISIONS_MODULE.md` § Surplus forecasts.

1. **History fields:** `SurplusObservation` is enough as it is; no new field is needed now. Forecasts are daily per donor; records of one day are summed. The blocker is not a field but the data: with `is_complete_observation` always `false`, every donor is `insufficient_data` (tested against your real `extract_surplus_history`). Real forecasts need complete daily observations, for example a donor-confirmed daily surplus log that also records zero days, with `is_complete_observation=true`. An `interval` label (`lunch`/`dinner`) can come later, if we forecast per interval.
2. **Input type:** pass the `list[SurplusObservation]` directly: `forecast_surplus(history, horizon_days, generated_at=None)`. No DataFrame is needed.
3. **ForecastResult** has the API.md fields with two naming choices:
   - `predicted_quantity` plus an explicit `unit` (`kg`/`portions`) instead of `predicted_quantity_kg`;
   - the interval is `lower`/`upper` with `interval_level` (0.8) and `interval_coverage_test`.

   Each donor entry has `status`, `support_days`, `excluded_incomplete_days`, `model`, `baseline`, `model_mae`, `baseline_mae` and `test_days`. `provenance` and `generated_at` are on the result. Fixtures: `docs/fixtures/decisions/forecast_ready.json` and `forecast_insufficient_data.json`.

**To member 1** (your files, so I have not edited them):

- `backend/app/services/orchestration.py` calls `analyze_patterns(rows, None)` and `analyze_model(rows, None)`. Please pass the context: `pd.read_csv("data/context/context_daily.csv", parse_dates=["date"])`. Without it, the rain and university-break effects cannot be found, and two of the three demo actions disappear.
- `backend/app/api/datasets.py` demo import still reads `restaurant_minimal_synthetic.csv`. Please switch it to `data/demo/restaurant_demo_synthetic.csv`. With the minimal CSV, the model is `insufficient_data` (56 days, below 60).
- `docs/API.md`: please align the forecast field names with the note above, or tell me if you prefer a rename.

### 2026-10-17: checklist audit on `main` c9bdfa7 (all branches merged)

- `python -m pytest backend/tests`: 160 passed.
- **Real integration through the API** (`create_app()`, demo import):
  - `POST /api/datasets/{id}/simulate` returns 200 `ready` with the full curve.
  - The recommendations component is computed by member 1's orchestration and returns `ready`.
  - `GET /api/template.csv` returns 200.
  - So step 2 verification is ticked.
- **Still not integrated:** the demo import uses the minimal CSV and orchestration passes no context, so the model is `insufficient_data` and only weekday/service actions appear. These are requests to member 1, noted above.
- **Open, with blockers:**
  - Step 3 (actions, simulator and report UI, plus the donation prefill) is blocked: `frontend/src` has no shell, routes or `api/client.js` yet (member 1 step 4).
  - Demo script: drafted; rehearsal waits for the UI.
  - Optional Claude wording: unblocked but P2, deferred.
  - Hourly operational fixtures are blocked: there is no `POST /datasets/{id}/operations` validator yet (member 1 step 5, with member 2).
