# Four-person delivery plan

Read this file, your member plan, `../../PLAN.md`, and `../API.md` before implementation. These plans assign work; unchecked items are not implemented. The repository currently contains a frontend scaffold and backend dependency file, so build the foundations explicitly.

## Ownership

| Member / branch | Owns backend work | Owns frontend work later | Individual plan |
|---|---|---|---|
| 1 / `feature/api-platform` | API platform, validation, storage, orchestration, deployment | Shell, shared client/components, upload and summary | [Member 1](MEMBER_1_PLATFORM.md) |
| 2 / `feature/waste-diagnostics` | Patterns, model evaluation, SHAP, anomalies, clustering | Diagnostic dashboard | [Member 2](MEMBER_2_DIAGNOSTICS.md) |
| 3 / `feature/redistribution` | Offers, matching, reservations, handover, impact, routing | Donation and pickup screens | [Member 3](MEMBER_3_REDISTRIBUTION.md) |
| 4 / `feature/data-simulator` | Demo/context data, recommendations, simulator, forecasts | Actions, simulator, report | [Member 4](MEMBER_4_DATA_DECISIONS.md) |

File ownership overrides broad file globs in the master plan. A member changes only their owned files. Request cross-module changes from the owner; agree on a temporary transfer before editing another owner's files.

| Files | Sole writer |
|---|---|
| Root configuration/docs, `PLAN.md`, `docs/API.md`, `docs/openapi.json`, `docs/PROGRESS.md`, `docs/DECISIONS.md`; backend manifests, Dockerfile, app entry point/config/common schemas, dataset routes/services, shared test configuration; `scripts/export_openapi.py` | 1 |
| `backend/app/contracts/common.py`, `backend/app/contracts/__init__.py`, shared package initialization | 1 |
| `backend/app/contracts/analytics.py`, `backend/app/analytics/*`, `backend/tests/analytics/*`, `docs/fixtures/analytics/*` | 2 |
| `backend/app/redistribution/*` except `forecasting.py`, `backend/app/api/redistribution.py`, `backend/tests/redistribution/*`, `data/demo/redistribution/*`, `docs/fixtures/redistribution/*`, `docs/PILOT.md` | 3 |
| `backend/app/contracts/decisions.py`, `backend/app/decisions/*`, `backend/tests/decisions/*`, `scripts/{prepare_dataset,generate_synthetic,fetch_weather,build_demo}.py`, `data/context/*`, `data/template.csv`, `data/demo/*` except `redistribution/`, `docs/{DATASET,DEMO_SCRIPT}.md`, `docs/fixtures/decisions/*` | 4 |
| Frontend manifests/lockfile, `src/{App,main}.jsx`, global CSS, `src/api/*`, shared `components/*`, `features/platform/*` | 1 |
| `frontend/src/features/diagnostics/*` | 2 |
| `frontend/src/features/redistribution/*` | 3 |
| `frontend/src/features/decisions/*` | 4 |
| Each individual member plan | That member |

Platform tests live in `backend/tests/platform/`. The directory names above replace the equivalent flat service/test paths proposed in the master plan: do not implement a second copy there. In particular, clustering lives in `analytics/`, forecasting and simulator calculations in `decisions/`. Member 3 exposes forecasts through their router by calling member 4's module; member 3 does not train a second forecast model.

## Shared start: first 30–45 minutes

- [ ] Member 1 commits the shared skeleton, package initialization, common error/state contract, backend test configuration, and runtime configuration. Register the redistribution router once its module exists.
- [ ] Members 2 and 4 commit domain schemas and small synthetic result fixtures in their own paths. Member 3 supplies redistribution schemas/fixtures. Member 1 consolidates public shapes in `API.md` and exports implemented OpenAPI.
- [ ] Member 4 supplies a small valid CSV immediately. Full 180-day generation follows; members 1 and 2 need not wait for external context downloads.
- [ ] Agree on request fields, result envelopes, units and null handling. Resolve current API document gaps: simulation response; complete anomaly/recommendation schemas; operational menu/hour schemas; demo session transport. Resolve ambiguous examples rather than implementing inconsistent variants.
- [ ] Commit shared contracts to `main`; create/update each feature branch from that commit.

Member 1 owns contract integration, not every domain schema. Members can develop isolated calculations, data fixtures and repository logic while the shared skeleton is prepared. Shared contracts are a real dependency: code against fixtures only after the field names are agreed.

## Internal module handoffs

Use Python functions, not another HTTP service, between backend modules. All result objects are Pydantic models from the owner's contract module, serialized by the API layer. These names are the agreed entry points to implement:

| Producer | Interface | Consumer |
|---|---|---|
| 2 | `analyze_patterns(rows, context) -> PatternsResult` | 1 orchestration; 4 recommendations |
| 2 | `analyze_model(rows, context) -> ModelResult` | 1 orchestration |
| 2 | `cluster_profiles(rows) -> ClustersResult` | 1 orchestration, later M2 |
| 4 | `build_recommendations(patterns) -> RecommendationsResult` | 1 orchestration |
| 4 | `simulate(rows, selection) -> SimulationResult` | 1 simulation endpoint |
| 4 | `forecast_surplus(history, horizon_days) -> ForecastResult` | 3 forecasts endpoint, later M2 |
| 3 | `router` from `backend/app/api/redistribution.py` | 1 app registration |

`rows` is a validated pandas DataFrame using the master-plan CSV names, parsed dates, and numeric columns. `context` is a date-keyed DataFrame with unique dates; missing context remains missing. Member 1 joins/loads context without duplicating rows. Functions do not mutate their inputs or access HTTP requests, dataset paths, or global databases. Member 1 owns execution limits, persistence, result caching, and state transitions; member 2 owns fitting and model calculations.

Result schemas distinguish `ready` and `insufficient_data`, contain the API data and support/limitations, and never silently substitute fixtures. Member 1 adds queued/running/error transport states. Model results include evaluation, explanations, anomalies and internal artifacts; only explicit public fields are serialized. Simulator selection includes dish, weekday, time slot and requested quantity; the returned curve contains all points needed by the slider.

Forecast history uses donor/date/interval, observed surplus, explicit unit and observation-completeness flag. Member 3 extracts this history from confirmed records; member 4 fits and evaluates it. Offers alone do not establish total surplus or zero-surplus days. Unsupported history returns `insufficient_data`.

The frontend shared client belongs to member 1 and accepts a fixture transport during development. Feature pages use that client and receive `datasetId` or demo session state from the shell. Feature owners export default page components; member 1 owns route registration and shared styling. Use JavaScript/JSX. Scoped feature styles prevent CSS conflicts.

## Parallel schedule and integration gates

Times are planning targets for the existing 18-hour hackathon, not a promise that all features fit.

1. Hours 0–1: shared contracts, minimal CSV, health and skeleton; everybody starts their isolated work.
2. Hours 1–5: upload/summary, descriptive patterns, manual donation flow, recommendations/simulator develop concurrently. Merge these slices as soon as usable.
3. Hours 5–9: integrate real module outputs and API routes. Member 1 sets up frontend shell/client early in this window. Other members can start assigned pages with fixtures as their core backend work completes.
4. Hours 9–13: all four prioritize their frontend pages and integration. Backend fixes remain with the original owner. Advanced algorithms yield to a complete visible flow.
5. Hours 13–15: feature freeze, regressions, deployment. Hours 15–18: pitch and reserve.

First integration gate: real CSV → summary → supported pattern → deterministic recommendation, plus simulator API. Second gate: manual offer → eligible charity → reservation → confirmed handover and impact. Third gate: these flows work through the UI after refresh. Route optimization, clustering, operational hourly analysis, forecasts, optional Claude/BY and real pilot work remain later tasks unless core gates are complete.

Redistribution development may run alongside M1; M1 analytical acceptance remains independently deliverable. Do not wait for every member's branch to finish before integrating. Merge through small pull requests and bring merged `main` changes into each branch regularly. Use new feature branches from current `main` when switching to UI work.

## Completion and reporting

Each member runs focused checks described in their plan and records commands/results there. Member 1 consolidates master-plan checkboxes only after all owners of a split step have finished. Shared steps are explicitly split below; they are not four separate implementations of the same feature. Member 4 coordinates rehearsal; member 1 coordinates technical release; each owner fixes failures in their own area.
