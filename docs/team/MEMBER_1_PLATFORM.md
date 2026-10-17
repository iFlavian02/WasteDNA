# Member 1 — API and data platform

Branch: `platform`. Read [coordination and ownership](README.md) first. Your deliverable is a running API that validates/stores data, calls the other members' modules and exposes their results, plus the later frontend shell and upload flow.

## Rules for agents working in parallel

These plans are independently developable after a shared contract setup, not completely dependency-free. A separate branch prevents neither incompatible interfaces nor conflicting edits by itself.

1. Before dependent implementation, confirm the shared setup checkpoint: API request/response shapes, CSV columns and units, internal function signatures, common errors/states, and small example fixtures are agreed and committed to `main`. Record that commit in your Progress section and update your branch from it. The planned 30–45 minutes is an estimate, not automatic approval that setup is complete.
2. If the checkpoint is incomplete, continue isolated work in your owned area and identify the exact missing contract to its owner. Do not invent a competing interface or wait for another member's entire plan to finish.
3. Work only in your assigned files and branch. Request changes to shared files from their owner; record an agreed ownership transfer before editing outside your scope. Agents running simultaneously on one machine need separate worktrees/checkouts; never switch branches in a shared working directory while another agent is using it.
4. Use agreed fixtures or injected test doubles for unavailable dependencies. Keep them explicit and confined to tests or fixture mode; never return mock results as a normal successful analysis or silently replace a failed upload. Implement the real integration when the producer's module is available.
5. Treat contracts as shared agreements. Coordinate field/signature changes with affected owners before implementation, update schemas/examples and documentation through their owners, and do not fork or duplicate another member's production logic.
6. Hand off small completed slices with the interface, example input/output, verification results and remaining dependencies. Integrate through small pull requests and bring merged `main` changes into your branch regularly, within the session's Git permissions. Branch completion is not a prerequisite for integration.
7. Track implementation, fixture-based verification and real integration separately in Progress. Do not mark a cross-member feature complete until it works with the actual modules. When blocked on one dependency, continue other owned tasks and report the specific blocker.

Your dependencies: Develop upload, validation, storage, summaries and infrastructure independently. Use agreed member 2 analysis fixtures and member 4 decision fixtures until their functions are available. Integrate their real modules incrementally; member 3 supplies its router for you to register. Publish the shared foundation and API client early so other members can integrate without waiting for your entire plan.

## Master-plan responsibility

Lead 0.1–0.3, 1.1–1.2, 1.5, 6.1–6.2. Own orchestration/cache/API portions of 3.4, 4.1, 5.1, 8.1–8.2 and integration/release portions of 11.1. Member 2 owns analysis calculations; member 4 owns recommendations/simulator; member 3 owns donation storage/routes. For 11.2, you own eventual authentication infrastructure after the pilot design is specified; it is outside the hackathon core.

## Owned files

See the ownership table for shared files. Domain-specific files: `backend/app/services/{ingestion,storage,summary,orchestration,operations}.py`, `backend/app/api/{health,datasets}.py`, `backend/tests/platform/*`, `frontend/src/features/platform/*`. Maintain shared manifests, configuration, entry points, API client and route registration. Import domain schemas from their owner's module; do not duplicate them in common schemas.

## Build sequence

### 1. Shared foundation

- [x] Set up FastAPI, configuration, common errors/states, test configuration, health, fixture-mode switch and skeleton contracts with domain owners. Health must actually import the advertised libraries.
- [x] Complete the API gaps listed in the coordination plan. Define simulator and analysis aggregation responses from owner-provided schemas. Keep `/analysis` consistent with component endpoints.
- [x] Establish isolated redistribution demo sessions with member 3; document how clients send session IDs. Export OpenAPI from implemented schemas.
- [x] Verify health and domain fixture validation; run `pytest backend/tests/platform` from the repository root once the test setup exists.

### 2. Upload, storage and summary

- [x] Implement CSV limits, row errors, UTF-8/BOM and delimiters, uniqueness and quantities. Use the master-plan formulas, TTL, cache identity and partial states.
- [x] Implement template download, upload, demo import and summary/status endpoints. Keep malformed uploads distinct from demo data.
- [x] Tests: valid/invalid CSV, duplicates, nonfinite values, `sold>prepared`, zero production, upload size, expiration/restart; example P=[10,30], S=[7,15], cost=[5,10] gives 18 unsold, 165 RON and 45%.
- [x] Handoff: share a runnable API request and real response with all members, including error response.

### 3. Integrate calculations and redistribution router

- [x] Call member 2's pattern/model functions and member 4's recommendations/simulator through the agreed interfaces. Persist/cache results and prevent refresh-triggered training.
- [x] Register member 3's router and supply configuration; member 3 owns its persistence and state logic.
- [x] Tests: analysis failure leaves summary usable; partial/insufficient results serialize correctly; fresh dataset does not reuse another dataset's results; fixture responses cannot appear in normal mode.
- [x] Deploy the backend and verify health/CORS early. Record measured latency/memory and configuration in README.

### 4. Frontend integration phase

- [x] Build shared React shell, routes, client with real/fixture transports, common loading/error controls, upload and summary pages. Publish component exports and props before others build screens.
- [x] Register the other members' exported pages. Own frontend dependencies and global styles; feature owners keep styles scoped.
- [x] Verify invalid upload, polling termination, refresh, dataset switching and backend failure. Run `npm run lint` and `npm run build` from `frontend`.

### 5. Release and later extensions

- [x] Coordinate full regression, clean install, deployed smoke checks, OpenAPI export and shared progress updates. Check each module through the actual frontend.
- [ ] Later: operational import validation/versioning and clusters endpoint/cache, with member 2 calculations and member 4 fixtures/documentation.

## Avoid overlap

Do not implement another pattern engine, forecast model, simulator or donation repository. Ask the module owner for changes and use their fixtures while waiting. Do not mark a shared master-plan step complete until its UI and algorithm owners have finished.

## Progress

Record completed item, commit, verification command/result and remaining dependency here.

- Step 2 upload, CSV validation, template, small demo import, persistent TTL snapshots, status, and summary implemented on `platform`. `pytest backend/tests/platform -q`: 10 passed; `pytest -q`: 50 passed. Analysis components remain queued until step 3 orchestration; the full 180-day demo remains member 4's step 1.4 deliverable. Usage: [platform dataset handoff](../PLATFORM_DATASETS.md).
- 2026-10-17 checklist audit on `main` at `03539f6`: `python -m pytest backend/tests/platform -q` passed (10 tests); `python -m pytest -q` passed (50 tests, including domain fixture validation). Step 1 remains open: analysis aggregation/component routes and simulator API are absent; member 3's redistribution router/session persistence is absent, although the `X-Demo-Session-Id` contract is documented. Step 2 remains open: analysis partial states are only declared, with no execution/orchestration yet, and the handoff lacks a runnable request plus captured success and error responses. Member 3 owns the router and session persistence in their step 1; member 1 owns registration and API aggregation in step 1/3.
- 2026-10-17: Steps 1 and 2 completed on `main`. Member 3's real router is registered with a separate configured SQLite path; `X-Demo-Session-Id` is documented in [API.md](../API.md) and [the dataset handoff](../PLATFORM_DATASETS.md). The API exposes stored summary, queued component envelopes, aggregate analysis and member 4's real simulator with owner-owned result schemas. Queued components return HTTP 202 and are `null` in the aggregate until step 3 orchestration. `docs/openapi.json` was regenerated with `python scripts/export_openapi.py`. `python -m pytest backend/tests/platform -q`: 13 passed; `python -m pytest -q`: 114 passed. Step 3 still owns model/recommendation orchestration and persistent results; member 2's model function and member 4's recommendation function are not yet present.
- 2026-10-17: Step 3 analysis integration on `platform` at `2417ada`: import starts real pattern, recommendation, and model calculations; public results persist per dataset and refresh does not retrain. Failures leave the summary and independent components available. Interrupted work becomes an error after restart. Clusters remain a later optional step. A root Dockerfile is committed and a Render blueprint is prepared; live deployment and host measurements await the user's Render project setup. `python -m pytest -q`: 144 passed; `python scripts/export_openapi.py` succeeded.
- 2026-10-17: Member 3 frontend handoff: shared JSON/fixture client, demo session persistence and reset handling, shell route hook, shared state controls, and prefill state are implemented. The member 3 page export is not present yet, so the route shows a placeholder until that owner adds `frontend/src/features/redistribution/index.jsx`. Usage is in [FRONTEND_SHELL.md](../FRONTEND_SHELL.md); `docs/API.md` now includes the requested impact and route fields. `node --test src/api/client.test.js`: 3 passed; `npm.cmd run lint` and `npm.cmd run build`: passed.
- 2026-10-17: Step 4 shell, upload and summary pages, persistent dataset verification, expired-dataset redirect, component status polling, diagnostics/actions/redistribution routes, and print CSS implemented on `platform`. The full 180-day demo and date-matched context are wired into analysis; summary exposes all dishes. Route props and usage are in [FRONTEND_SHELL.md](../FRONTEND_SHELL.md). `node --test src/api/*.test.js src/features/platform/*.test.js`: 7 passed; `npm.cmd run lint`, `npm.cmd run build`, `python -m pytest -q`: passed (177 backend tests). Browser walkthrough and deployed smoke test remain before marking the final verification item complete.
- 2026-10-17: Step 4 verification completed on `platform`: fixture transport checks that invalid CSV errors retain row details and the selected dataset, dataset switching persists across refresh, backend 503 errors remain actionable, and polling ends only for terminal component states. `node --test src/api/*.test.js src/features/platform/*.test.js src/features/diagnostics/*.test.js src/features/decisions/*.test.js src/features/redistribution/*.test.js`: 41 passed, 3 opt-in live-backend tests skipped. `npm.cmd run lint` and `npm.cmd run build` passed from `frontend`; `python -m pytest -q`: 186 passed. Browser walkthrough and deployed smoke checks are release work in step 5.
- 2026-10-17: Live backend supplied at `https://wastedna.onrender.com/`. `GET /api/health` returned `status: ok` with pandas, scikit-learn and SHAP versions. With `WASTEDNA_API_URL=https://wastedna.onrender.com`, `node --test src/features/redistribution/e2e.test.js` passed all 3 live tests: offer/match/reserve/handover/impact across donor types; no-match, allergens, expiry and conflict; forecasts and surplus log. A browser walkthrough of the hosted frontend remains part of step 5.
- 2026-10-17: Step 5 release verification started on `platform` at `49e1475`, current with `main`. `python -m pytest -q`: 186 passed; clean `npm ci`, `npm run lint`, `npm run build`: passed; frontend tests: 41 passed, 3 opt-in live tests skipped. OpenAPI export produced no diff. Deployed health, frontend home, entry asset and `/redistribution` returned HTTP 200; the bundle contains the Render API origin and CORS preflight allows the Vercel origin. Reproduction steps and limits are in [release verification](../RELEASE_VERIFICATION.md). Hosted browser walkthrough and host memory/latency readings remain open, so Step 5 is not yet complete.
- 2026-10-17: Step 5 follow-up integrated member 2's real `cluster_profiles` into per-dataset orchestration and persistent public results. Platform tests cover restart persistence and independent cluster failure. The hosted Chrome walkthrough found `POST /api/datasets/demo` returning HTTP 500; the Dockerfile omitted the full demo CSV and daily context, so both are now copied with a regression test. The corrected image needs deployment and another browser run. Hourly operational import waits for member 4's synthetic payload fixtures and replacement/version semantics, requested in `docs/fixtures/decisions/REQUESTS.md`; its validator has not been started.
- 2026-10-17: Local Chrome walkthrough passed all modules, print CSS, and refresh after a Windows snapshot replace retry fix. The first run found `PermissionError` during a concurrent JSON read/write, leaving components queued; bounded retry is covered by a platform test. Full backend regression passed 189 tests before this fix and the focused retry test passed afterward. Hosted verification still needs the corrected Docker image deployed. The Step 5 release and operational extension boxes remain open until their respective external gates pass.
- 2026-10-17: Final local Step 5 verification after the retry fix: `python -m pytest -q` passed 191 tests, including real demo clusters; `npm run lint`, `npm run build`, and frontend unit tests passed (41 passed, 4 opt-in skipped); local Chrome walkthrough passed in about six seconds through every page, print CSS and refresh. OpenAPI export had no diff. Hosted Chrome still fails at demo import because Render has the older image. Operational import remains dependent on member 4's fixtures and agreed version semantics.
- 2026-10-17: User adopted full replacement and explicit `time_slot` for operational imports. The agreed payload, optimistic version rule, idempotent retry, atomic validation, and read endpoint are recorded in [API.md](../API.md#import-operational-observations-optional-m2) and [shared decisions](../DECISIONS.md#operational-import-decision--2026-10-17). Member 4's fixture request is updated. Runtime implementation still waits for the owner fixtures; no operational endpoint is claimed in OpenAPI yet.
- 2026-10-17: Step 5 release follow-up on `platform` at `c711664`, current with local and fetched `main`: `python -m pytest -q` passed 199 tests; frontend lint/build passed; frontend tests passed 42 with four opt-in skips; OpenAPI export had no diff. Hosted health returned HTTP 200. The hosted Chrome walkthrough reached the app, but demo import was rejected with `Maximum active datasets reached.` The default limit is three active snapshots with a 24-hour TTL; the hosted module walkthrough must be rerun after capacity is available. See [release verification](../RELEASE_VERIFICATION.md). Member 4's operational fixtures are still absent, so the agreed replacement/versioning upgrade to the existing operations endpoint has not started per the dependency rule.
- 2026-10-17: After the deployment operator raised `MAX_DATASETS` to 10, the hosted Chrome walkthrough passed in 24 seconds: demo import, Summary, Diagnostics, Actions, Simulator, Report, Redistribution, print CSS, API origin, and refresh persistence. `platform` remains even with fetched `origin/main` (`0/0`). Release verification is complete; the later operational-import item remains open pending Member 4's requested fixtures.
