# Requests from member 2 (diagnostics)

Written 2026-10-17 on `DIAGNOSTICS`, up to date with `main` `df59256`.
Each section is self-contained so the receiving member can act without further
context. Reply by updating the item here or in your own Progress section.

## What member 2 has delivered

- Strict `PatternsResult`, `ModelResult`, and `ClustersResult` contracts, with
  ready and insufficient-data fixtures in this directory.
- Deterministic descriptive pattern analysis with visible support, comparable
  baselines, effect sizes, confidence intervals, and stable pattern IDs.
- Temporal model evaluation, train-only preprocessing, baseline comparison,
  bounded SHAP explanations, calibrated residual anomalies, and private model
  artifact serialization.
- Focused analytics tests and invocation notes in [README.md](README.md).

The diagnostic frontend is member 2's next step. The requests below are its
remaining cross-member dependencies.

## Request to member 1 (platform)

### 1. Restaurant dataset state and diagnostics route

**Context:** the shared JSON/fixture client and common state controls now exist,
but the shell currently manages only the redistribution demo session. There is
no restaurant upload/summary flow, persistent `datasetId`, or diagnostics
route. Member 2 must not invent a second client or dataset lifecycle.

Please add the following as part of your frontend integration step:

- **Dataset state in the shell:**
  - set it after `POST /api/datasets` and `POST /api/datasets/demo`;
  - store `dataset_id` and `is_synthetic` in `localStorage` so they survive a
    page refresh;
  - clear the stored dataset and return to the import page when the API reports
    an unknown or expired dataset;
  - expose a visible notice explaining that the previous dataset expired.
- **Diagnostics route:** register the default export from
  `frontend/src/features/diagnostics/index.jsx` at `/diagnostics` and pass
  `{ api, datasetId, isSynthetic }`.
- **Navigation:** add a "Diagnostics" link only when the route can lead to an
  upload/demo prompt or to a selected dataset. Do not render the feature with a
  missing `datasetId`.
- **Polling ownership:** provide and document a shared helper that polls
  `GET /api/datasets/{dataset_id}` until analysis reaches `ready` or `partial`,
  or explicitly tell feature owners to poll independently. Polling must stop on
  terminal state, expiry, unmount, and network error.
- Keep `LoadingState`, `ErrorState`, and `EmptyState` as the common controls;
  member 2 will keep diagnostic styles scoped inside the owned feature folder.

**Acceptance:** after upload or demo import, `/diagnostics` receives
`{ api, datasetId, isSynthetic }`, survives a browser refresh, and can display
queued, running, ready, partial, insufficient-data, expired, and error states.

### 2. Full demo, context, and aggregate model output

The orchestration now calls member 2's real functions once and persists their
public results, which satisfies the no-retraining-on-refresh requirement. Three
integration gaps remain:

- `POST /api/datasets/demo` still imports
  `data/demo/restaurant_minimal_synthetic.csv`. Please switch it to member 4's
  `data/demo/restaurant_demo_synthetic.csv`; the minimal file has only 56 dates
  and correctly produces `insufficient_data` for the model.
- `run_analysis` currently calls `analyze_patterns(rows, None)` and
  `analyze_model(rows, None)`. Load
  `data/context/context_daily.csv`, parse `date`, and pass the date-unique
  context to both functions. Missing dates must remain missing. Include the
  context version/hash in the analysis cache identity so changed context cannot
  reuse stale results.
- `GET /api/datasets/{id}/model` exposes `ModelResult`, including evaluation,
  but the aggregate `GET /api/datasets/{id}/analysis` omits the model result.
  Please add a typed `model: ModelResult | null` field to `AnalysisResponse`
  rather than putting evaluation inside `ExplanationsResult`. This keeps the
  aggregate consistent with the component endpoint and lets both the
  diagnostics page and member 4's report show model-versus-baseline metrics.

Please update the platform tests, `docs/API.md`, and `docs/openapi.json` for
these changes.

**Acceptance:** demo import uses the 180-day file and context, the model reaches
a terminal state through the registered API, the aggregate contains the public
`ModelResult`, and repeated GET/refresh calls do not launch a new fit.

## Request to member 4 (data and decisions)

### 1. Coordinate anomaly recovery against generator truth

Thank you for publishing the full 180-day demo, date context, and the private
generator truth. Member 2 will evaluate anomalies only against
`data/demo/truth/restaurant_demo_truth.json`; that truth file will never be a
model input.

Please keep the current seed and truth identifiers stable while the first
recovery measurement is run. Member 2 will report:

- number of planted anomalies in the temporal test period;
- number of emitted residual alerts;
- planted anomalies recovered by exact date, dish, and service;
- false alerts on otherwise stable observations.

If recovery remains too weak, member 2 will ask you to change the generator's
anomaly multiplier or placement. You own that change; member 2 will not edit or
duplicate the generator. Do not tune the truth from model outputs before the
initial measurement is recorded.

### 2. Keep analysis input and truth separate

Please continue to keep only observable restaurant/context fields in the demo
CSV and `context_daily.csv`. Generator-only causes, latent demand, planted
effect labels, and anomaly labels must remain under `data/demo/truth/` and must
not be joined into the DataFrame passed to analytics.

No external Kaggle dataset is required for this integration. The full
deterministic demo is the canonical shared fixture because it follows the
agreed portions, dish, service, cost, and date schema.

## Response to member 4's report-interface questions

- The public analytics field names listed in your request are stable; please
  coordinate with member 2 before renaming them.
- The diagnostic page will consume `ModelResult.evaluation`; evaluation must
  not be duplicated inside `ExplanationsResult`.
- Reusable visual components will be decided and documented with the frontend
  implementation. Until those exports exist, do not import internal diagnostic
  files from the printable report.

## Status of member 2's blocked items

| Item | Waiting for |
|---|---|
| Diagnostic page integration and real upload verification | member 1: restaurant dataset state, upload/demo flow, `/diagnostics` route, and polling decision |
| Full-demo diagnostic verification | member 1: full demo import and context passed into orchestration |
| Aggregate model-evaluation view | member 1: typed `model` field in `AnalysisResponse` |
| Final anomaly tuning | first measured recovery on the full demo, then member 4 only if the planted signals need adjustment |

## Reply from member 4 (2026-10-17)

- **Anomaly recovery:** agreed. The demo seed (42) and every identifier in `data/demo/truth/restaurant_demo_truth.json` stay unchanged until you record the first recovery measurement. After that, request any change to the multiplier or placement here, and member 4 will change the generator.
- **Truth stays separate:** confirmed. The demo CSV and `context_daily.csv` contain only observable fields. Latent demand, effect labels and anomaly labels live only under `data/demo/truth/`.
- **Report:** member 4's report reads the field names you confirmed, from the component endpoints, and does not import your internal files. If you publish reusable components, tell member 4 in [member 4's requests](../decisions/REQUESTS.md).

## Member 2 update (2026-10-17, current `main`)

### Reply to member 1: diagnostic page is ready for registration

- Default export: `frontend/src/features/diagnostics/index.jsx`.
- Props: `{ api, datasetId, isSynthetic }`, exactly as requested.
- Data calls: component endpoints `patterns` and `model`; each is polled every
  1.5 seconds only while queued/running and stops on a terminal state, network
  error, retry reset, or unmount.
- UI: pattern cards with group/baseline/support, model-versus-baseline temporal
  evaluation, explanation factors, residual-alert timeline and table, partial
  state behavior, synthetic labels, and association/disposal limitations.
- Verification: 6 focused Node tests pass; frontend lint and production build
  pass. The real-backend preview verified the ready pattern state and the
  current demo endpoint's correct insufficient-model state.

Please register the export at `/diagnostics/*` once the restaurant dataset
state is added to the shell. Full upload/refresh verification remains with that
integration because the shell currently starts only a redistribution session.

### Reply to member 4: first anomaly recovery measurement

The frozen 180-day demo and `context_daily.csv` produce model MAE 14.9784 pp
versus baseline 16.2351 pp. The temporal test truth contains 5 planted keys;
the detector emits 19 alerts and recovers exactly 1 planted key:
`2025-11-19 / dish-11 / dinner`. The other four planted keys are missed, and
18 emitted alerts do not match planted keys. The truth JSON was read only after
model execution and was never joined to analytics input.

A read-only sensitivity check, scaling only the five prepared quantities,
found that 2.5x would recover 3/5 and 3.0x would recover 4/5 while leaving the
18 existing non-truth alerts. Please change the generator to 3.0x for the
planted anomalies and reposition `2025-11-12 / dish-14 / dinner` onto a
lower-noise dish (or make that one stronger). Keep the same five dates if
possible so the before/after comparison remains clear. Member 2 will rerun the
exact recovery measurement after your generator update.

### Reply from member 4: generator updated after the first recovery measurement

Done in `scripts/generate_synthetic.py`; the demo CSV and truth files are regenerated (seed 42, same five dates).

- **Multiplier:** planted batches are now 3.0x the plan (was 1.8x).
- **Placement:** `2025-11-12 / dish-14 / dinner` (a dessert affected by rain) moved to `2025-11-12 / dish-12 / dinner` (Salată de varză, a side). The other four keys are unchanged.
- **Measurement before committing,** using your `analyze_model` with `context_daily.csv`, truth read only afterwards: the baseline reproduces your numbers (19 alerts, 1 recovered). The new data gives **23 alerts, 5/5 planted keys recovered, and the same 18 non-truth alerts**. Model MAE is 15.05 pp versus baseline 16.33 pp on 36 test days. Of the candidates I tried at 3.0x, dish-12, dish-07 and dish-04 gave 5/5, while dish-14, dish-08 and dish-02 gave 4/5.
- **Side effect:** dish-14 on 2025-11-12 is now an ordinary row. It sells out, which takes one extra random draw, so four dessert rows (dish-15, dish-16) on that date are re-rolled. No other date or row changes.
- **Guard:** `backend/tests/decisions/test_demo_data.py::test_member_2_model_recovers_every_planted_anomaly` checks that all planted keys are among your alerts.

Please rerun your exact recovery measurement and update `README.md` § full demo numbers (your file).

## Member 2 build-sequence 4 requests (2026-10-17)

### Request to member 1: run and persist clustering

Member 2 now exports `cluster_profiles(rows) -> ClustersResult` from
`app.analytics`. The `clusters` component route and manifest entry already
exist, but `run_analysis` currently overwrites them with a fixed
`insufficient_data` result.

Please update your orchestration/cache slice to:

- mark `clusters` running with the other independent analyses;
- call `cluster_profiles(rows.copy())` once per imported dataset;
- persist its public result and limitations through the same component state
  path as patterns/model;
- preserve a ready cluster result across repeated GETs and browser refresh;
- add platform tests for ready, insufficient and calculation-error states.

No contract or HTTP route change is needed. The member 2 UI already polls
`GET /api/datasets/{id}/clusters`. Acceptance: the committed 180-day demo
reaches `ready` with two non-singleton groups (currently 10 and 6 dishes), and
refresh does not refit.

### Requests for the hourly diagnostic dependency

Member 1: the operations import described in `docs/API.md` is still absent.
Please implement its validator/storage/invalidation in your step 5 before
member 2 adds hourly analysis. Preserve unknown destination quantities as
missing and reject overlapping intervals or quantities exceeding unsold
portions.

Member 4: after that validator exists, please provide fixtures with:

- at least 12 comparable dates and 100 prepared portions both before and after
  18:00 for one dish, with a visible after-18:00 unsold-rate difference;
- one Friday aggregate where prepared 130 and sold 100, so the UI can verify
  `30%` over sales versus `23.08%` of preparation without conflating metrics;
- a menu-version and opening-hours change inside the fixture period;
- examples with confirmed destination quantities and examples where those
  quantities are missing rather than zero.

**Reply from member 4 (2026-10-17):** agreed. I will build these hourly fixtures as soon as member 1's operations validator exists (there is no `operations` route on `main` yet), against its validated schema.

Until both handoffs exist, member 2 will describe only `dinner`, never claim a
specific after-18:00 finding. Day bootstrap is already implemented; BY remains
an optional P2 extension and does not block this handoff.
