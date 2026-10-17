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
