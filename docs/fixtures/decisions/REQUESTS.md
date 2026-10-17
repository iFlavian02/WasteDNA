# Requests from member 4 (data and decisions)

Written 2026-10-17 on `Data_decisions`, up to date with `main` `da9c708`. Each section is self-contained, so that member's agent can act without further context. Reply by updating the item here, or in your own Progress section.

**What member 4 has delivered on `main`.** Usage is in [DECISIONS_MODULE.md](../../DECISIONS_MODULE.md) and [DATASET.md](../../DATASET.md).

- `simulate`, `build_recommendations` and `forecast_surplus`, with their contracts in `backend/app/contracts/decisions.py`.
- Ready and insufficient fixtures in this folder.
- The full synthetic demo `data/demo/restaurant_demo_synthetic.csv` (180 days, 16 dishes).
- The verified Iași context `data/context/context_daily.csv`.
- A draft [DEMO_SCRIPT.md](../../DEMO_SCRIPT.md).

**What member 4 still has to do.**

- Step 3 of [MEMBER_4_DATA_DECISIONS.md](../../team/MEMBER_4_DATA_DECISIONS.md): actions page, simulator slider, printable report, donation prefill, then rehearsal.
- Later: hourly operational fixtures.

The requests below are what blocks those tasks.

## Update, 2026-10-17 (on `main` `c8e150f`)

Answers received:
- **Member 1** (`docs/fixtures/platform/REQUESTS.md`): confirmed the contract. The default export is `frontend/src/features/decisions/index.jsx` at `/decisions/*`, receiving `{ api, datasetId, isSynthetic }`. The shell will handle dataset state, refresh and expiry, and member 1 will supply the print rule.
- **Member 2** (`docs/fixtures/analytics/REQUESTS.md`): the report fields are stable. I will keep the demo seed and the anomaly truth unchanged until member 2 records the first recovery measurement.

**Member 4 has built the pages against that contract:** actions, simulator and printable report, in `frontend/src/features/decisions/`. Usage is in `DECISIONS_MODULE.md` § Frontend. They were checked in the browser against the real backend through a dev-only harness. Lint, build and tests pass. What is still needed is listed as **request 1.5** and the open parts of 1.1 below.

## Request to member 1 (platform)

### 1. Dataset state and a route for the decisions feature (blocks all of member 4's step 3)

**Context:** as of `da9c708`, the shell (`frontend/src/App.jsx`) only knows the redistribution session. My pages need a restaurant `datasetId`, which comes from your upload/summary pages (your step 4, first item). Today there is no upload or summary page, no dataset state in the shell, and no route for `frontend/src/features/decisions/`. The client in `src/api/client.js` and the `States.jsx` controls are exactly what I need. Thank you, I will use them as they are.

Please add:

- **Dataset state in the shell:**
  - set by your upload page (`POST /api/datasets`) and by "Load demo data" (`POST /api/datasets/demo`);
  - keep `dataset_id` in `localStorage` so it survives a refresh;
  - pass it, together with `is_synthetic`, to feature pages;
  - when the API answers 404/410 for an expired or unknown dataset, clear it and send the user back to upload, with a notice.
- **Route registration:** register the default export of `frontend/src/features/decisions/index.jsx` under `/decisions/*`. Use the same lazy pattern as redistribution. Props: `{ api, datasetId, isSynthetic }`. My feature handles its own sub-routes `actions`, `simulator` and `report`.
  - Add a nav link "Actions".
  - If no dataset is selected, show your own prompt to upload or load the demo, instead of rendering my page.
- **Waiting for analysis:** after import, components are `queued`/`running` (HTTP 202). Tell me whether the shell offers a shared helper to poll `GET /api/datasets/{id}` until components settle, or whether each feature should poll it itself. Member 2's diagnostic page needs the same answer. If you add a helper, please document its signature in `FRONTEND_SHELL.md`.
- **Print support (global styles are yours):** my printable report uses `window.print()`.
  - Please add an `@media print` rule in `App.css` that hides `.app-header` and `.notice`, so only the page content prints.
  - Or give me a class convention, for example `data-print-hide`, that I should respect instead.

**Calls my pages will make** (all exist today): `GET /api/datasets/{id}`, `GET /api/datasets/{id}/summary`, `GET /api/datasets/{id}/recommendations`, `GET /api/datasets/{id}/analysis` (for the report), and `POST /api/datasets/{id}/simulate`.

**Acceptance:** `/decisions/*` renders my `index.jsx` with `{ api, datasetId, isSynthetic }` after an upload or demo load, and keeps working after a refresh. Then tell member 4 that step 3 can start. Until then, per `AGENTS.md`, I will not build the pages against an interface I would have to guess.

### 1.5 New: register the decisions page, and a dish list in the summary

- **Register the route:** the default export `frontend/src/features/decisions/index.jsx` is committed. Please register it at `/decisions/*` with `{ api, datasetId, isSynthetic }`, and add the "Actions" nav link.
  - The page builds its sub-links from the mount path, so `/decisions` or any other prefix works.
  - It navigates to `/redistribution` with `{ state: { prefill: { category, description } } }`, as in `FRONTEND_SHELL.md`.
- **Still open from 1.1:**
  - Polling: until you decide, my feature polls component endpoints itself (`useComponent.js`, every 1.5 s, stopping on terminal state, error or unmount). It will switch to your helper if you publish one.
  - The `@media print` rule that hides `.app-header` and `.notice`.
- **Dish list (new):** `summary.result.top_dishes` holds only 5 dishes, so the simulator cannot list every dish of a dataset.
  - Please add `dishes: [{ dish_id, dish_name, category, time_slots }]` to the summary result, with all dishes.
  - My page already reads `summary.result.dishes` when it exists, and falls back to `top_dishes` plus a free dish-ID field.

**Acceptance:** `/decisions/actions`, `/decisions/simulator` and `/decisions/report` render inside the shell after a demo load, and printing shows only the report.

### 2. Backend integration gaps (affects the demo and the numbers in DEMO_SCRIPT.md)

I checked this through `create_app()` on `main`.

- **Demo import:** `backend/app/api/datasets.py` reads `data/demo/restaurant_minimal_synthetic.csv`. Please switch it to `data/demo/restaurant_demo_synthetic.csv`. With 56 days, `analyze_model` is `insufficient_data` (minimum 60). With the full demo, it is `ready`, with model MAE 14.98 pp against a baseline of 16.24 pp.
- **Context:** `backend/app/services/orchestration.py` calls `analyze_patterns(rows, None)` and `analyze_model(rows, None)`. Please pass `pd.read_csv("data/context/context_daily.csv", parse_dates=["date"])`. It has one row per date, so the join is many-to-one. Without context, two of the three planted effects disappear: desserts on rain days and the daily menu during the university break. The recommendations then show only weekday and service actions. Per the master plan, the cache identity should also include the context file.
- **Upload context:** for uploaded CSVs whose dates fall outside 2025-06-01 – 2025-11-27, the context has no rows. That is correct: missing context stays missing. No fill-in is needed.

**Acceptance:** `POST /api/datasets/demo` gives model `ready`, and its recommendations are the three actions listed in `DEMO_SCRIPT.md`.

### 3. `docs/API.md` forecast fields (small; you own the file)

`ForecastResult` uses `predicted_quantity` with an explicit `unit` (`kg` or `portions`) instead of `predicted_quantity_kg`. The interval is `lower` and `upper` with `interval_level` and `interval_coverage_test`. Each donor entry has `status`, `support_days`, `excluded_incomplete_days`, `model`, `baseline`, `model_mae`, `baseline_mae` and `test_days`. `generated_at` and `provenance` are on the result. See `forecast_ready.json` in this folder.

Please mirror this in § "Impact and surplus forecasts", or tell me if you want a rename. Regenerate `docs/openapi.json` once member 3's `/forecasts` route exists.

### 4. Later: operational import (your step 5)

My plan says hourly operational fixtures "follow the validated schema agreed by members 1 and 2". When `POST /api/datasets/{id}/operations` and its validator exist, tell me. I will then generate synthetic hourly observations, menu versions and opening hours for the demo period that pass your validator.

## Request to member 2 (diagnostics)

### 1. Anomaly recovery on the full demo

Over the test period, the demo plants 5 anomalies (batches at 1.8× the plan). They are listed with date, dish and service in `data/demo/truth/restaurant_demo_truth.json` under `anomalies`; the test period starts 2025-10-24. On `main`, `analyze_model(rows, context)` flags 19 anomalies, and only 1 of them is a planted one.

Please check your step 3.3 recovery against this truth file, and tell me if the planted anomalies should be different. For example, I can use a stronger multiplier (2.5×) or put them on dishes with less noise. I own the generator. You do not need to edit it.

The truth file is for verification only. It must never be a model input.

### 2. Fields my printable report will read

The report (my step 3) summarizes the analysis from `GET /api/datasets/{id}/analysis`. It will read these fields:

- **patterns:** `items[].id`, `title`, `factor`, `group.unsold_rate`, `baseline.unsold_rate`, `effect_pp`, `support.days`, `opportunity_ron_per_30_days`, `interpretation`.
- **model:** `evaluation` (`split`, `train_days`, `calibration_days`, `test_days`, `mae_model_pp`, `mae_baseline_pp`).
- **explanations:** `status`, `target`, `factors[]` (`name`, `mean_contribution_pp`, `support_rows`, `method`).
- **anomalies:** `date`, `dish_id`, `time_slot`, `excess_unsold_portions`, `excess_cost_ron`.

Please tell me before renaming any of these. Also tell me whether your diagnostic page will export small reusable components, such as a pattern card. If it does, the report can reuse them instead of duplicating your presentation.

### 3. Later: hourly analysis

When you and member 1 agree the hourly schema, tell me which signals your after-18:00 analysis needs to find. I will plant them in the operational fixtures.

## Request to member 3 (redistribution)

### 1. Donation prefill: category vocabulary

**Context:** `FRONTEND_SHELL.md` says I navigate with `navigate('/redistribution', { state: { prefill: { category, description } } })`. Your demo organizations accept `prepared_meals`, `bakery`, `bread`, `produce`, `dairy` and `canned`. My actions use restaurant dish categories: `soup`, `main`, `side`, `daily_menu` and `dessert`.

- **Proposed mapping:**
  - `soup`, `main`, `side`, `daily_menu` → `prepared_meals`;
  - `dessert` → `bakery`.

  Please confirm this mapping, or give me the full category list your `OfferCreate` should receive.
- **I will send only `category` and `description`**, for example "Unsold Friday mains from WasteDNA action 'Prepare fewer portions of main dishes on Fridays'".
  - I will **never** send a quantity or a deadline. Restaurant data is in portions and offers are in kg, and we do not convert.
  - The donor must confirm the real quantity and pickup deadline, as your plan says.

  Please confirm your form accepts this shape.

**Reply from member 3 (2026-10-17):** confirmed. `soup`, `main`, `side` and `daily_menu` map to `prepared_meals`, and `dessert` maps to `bakery`. Categories that already exist as offer categories pass through unchanged; anything else leaves the category empty with a note for the donor. The form accepts `{ category, description }` as suggestions only: quantity, allergens, storage and the pickup window are entered and confirmed by the donor. This is implemented in `frontend/src/features/redistribution/logic.js` (`mapPrefill`) and tested.

### 2. `/forecasts` endpoint

`forecast_surplus` and `ForecastResult` are on `main` (my replies to your three questions are in the Progress section of `MEMBER_4_DATA_DECISIONS.md`). You can now add `GET /api/redistribution/forecasts`.

- Call `forecast_surplus(extract_surplus_history(repo, session_id, now), days)`, passing `generated_at=now`.
- On today's offers-only history, every donor returns `insufficient_data` with the reason "offers do not show total surplus". The UI should show that reason rather than an empty chart.
- Fixtures for your UI: `forecast_ready.json` (one ready donor and two insufficient ones) and `forecast_insufficient_data.json`, in this folder.

**To decide together:** where complete daily history comes from. My suggestion is a donor-confirmed daily surplus log that records zero days too and sets `is_complete_observation=true`. Until it exists, real forecasts stay `insufficient_data`.

### 3. Checklist

Your Progress notes say steps 1–2 were verified with fixtures and through the registered app, but their boxes in `MEMBER_3_REDISTRIBUTION.md` are unticked. Please tick what is done, so the team status is accurate. I did not edit your file.

## Status of member 4's blocked items

| Item | Waiting for |
|---|---|
| Actions page, simulator slider, printable report (step 3) | **Registered** by member 1 (route, dataset state, print rule); in-shell browser verification by member 4 |
| Full dish list in the simulator | **Done**: member 1 added `dishes` to the summary; the simulator reads it |
| Donation prefill (step 3) | **Done**: member 3 confirmed the mapping and their form maps it (`mapPrefill`); the route is registered |
| Demo numbers matching the API (`DEMO_SCRIPT.md`) | **Done**: re-measured through the API on `main` 694f3ee |
| Real forecasts on member 3's demo | **Done**: tested with the seeded surplus log (member 3's follow-up answered) |
| Demo rehearsal | all pages are registered; needs the team for two full runs |
| Hourly operational fixtures | **Done**: `operations/`; member 1 to add `expected_version`, `time_slot` and versioning to the route |
| Anomaly tuning in the generator | **Done**: 3.0x and dish-12 on 2025-11-12; member 2's rerun confirms 5/5 recovered |
| Hourly fixtures for member 2's after-18:00 analysis | **Done**: member 2 marked it resolved; member 4's `operations_valid.json` also yields their dish-11 after-18:00 pattern |

## Request from member 3 (2026-10-17): one test update so the demo can seed forecast history by default

**Resolved** (`32ef7b7`, thank you): your test passes `with_surplus_history=False` explicitly. `create_demo_session` now defaults to seeded history, so Python callers and `POST /demo` behave the same.

**Context:** member 3 added a donor-confirmed daily surplus log. `POST /api/redistribution/demo` seeds deterministic synthetic logs (restaurant 90 days, supermarket 75, household 30), so `/forecasts` shows ready forecasts for two donors and `insufficient_data` for the household. Your test `backend/tests/decisions/test_forecasting.py::test_real_member_3_history_from_offers_is_insufficient` calls `create_demo_session(repo, now)` and expects every donor to be `insufficient_data`. To keep it passing, the Python default is still offers-only, and only the HTTP demo passes `with_surplus_history=True`.

**Please:**
- keep your offers-only assertion, but make it explicit: `create_demo_session(repo, now, with_surplus_history=False)`;
- optionally, add a seeded case: `create_demo_session(repo, now, with_surplus_history=True)` should give the restaurant and supermarket `ready`, and the household `insufficient_data` with `support_days == 30`.

**Acceptance:** your tests pass with either default. Tell member 3, who will then flip the default to seeded so Python callers and `POST /demo` behave the same. Details are in [redistribution README](../redistribution/README.md) § Surplus log and forecasts.

## Request from member 1 (2026-10-17): hourly operational fixtures for Step 5

The platform operations validator is the next Step 5 extension. Please publish
one valid and several invalid synthetic operations payloads in your owned
fixtures directory, aligned with the agreed `POST /api/datasets/{dataset_id}/operations`
shape in [API.md](../../API.md). Include overlapping intervals, destination
totals above unsold quantity, effective-date boundaries, missing destination
quantities, and a dish ID absent from the dataset. State the intended treatment
of a replacement import versus an appended version. Member 1 will implement
validation and versioned storage once these owner fixtures and semantics are
available; member 2's hourly diagnostics can follow that API.

**Decision from the user (2026-10-17):** use full replacement, with all three
arrays and `expected_version` required. The first import expects version `0`;
changed replacements increment the version, stale changed imports return
`409`, and identical retries keep the version. Every hourly observation must
include `time_slot` (`lunch` or `dinner`) and reference an existing CSV
`(date, dish_id, time_slot)` key. Please build your fixtures against the updated
[API contract](../../API.md#import-operational-observations-optional-m2),
including an identical retry and a stale replacement case. Member 1 will use
those fixtures to implement the validator and storage; member 2 will consume
the validated observations afterward.

**Reply from member 4 (2026-10-17):** done. The fixtures are in [operations/](operations/README.md), built by `scripts/build_operations_fixtures.py` against the agreed contract (full replacement, `expected_version` and `time_slot` required).

- **Valid snapshot:** `operations_valid.json`.
- **Replacement:** a version 1 replacement and a stale version 0 replacement.
- **11 invalid payloads:**
  - overlapping intervals;
  - destinations above unsold;
  - a menu and an opening-hours effective-date boundary overlap;
  - an unknown dish;
  - a key absent from the CSV;
  - a missing `time_slot`;
  - a missing `expected_version`;
  - a naive timestamp;
  - an interval leaving its date;
  - sold above prepared.
- **Missing destinations** appear as `null` (unknown) in the valid snapshot, next to confirmed zeros.
- **Versioning sequence:** `operations_cases.json` lists import → identical retry → stale 409 → replacement → invalid, with the expected status and version after each step.
- **Replacement versus append:** each import replaces the whole snapshot, and records left out are deleted, never appended.
- **Checked against your route on `main`** (with `expected_version` and `time_slot` stripped, since it does not accept them yet):
  - the valid snapshot returns 202;
  - 8 invalid files are already rejected;
  - the other 3 (`time_slot`, key absent, `expected_version`) need the agreed contract.
  - Member 2's `analyze_hourly_patterns` finds dish-11 after 18:00 at +10.6 pp.
- **Tests:** `backend/tests/decisions/test_operations_fixtures.py`. Once you add the new fields, please drop the stripping helper `legacy()` there, or tell me and I will.

### Resolved: fixture tests for the completed platform contract

Member 1 added required `expected_version` and `time_slot`, dataset-key validation, versioned full replacement, and `GET /operations` on `platform`. With the user's authorization, member 1 removed the obsolete `legacy()` helper in the member 4 test and updated it to submit committed payloads directly. `python -m pytest -q`: 219 passed, including the platform fixture sequence and all eleven invalid files.
