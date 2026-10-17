# Member 1 — API and data platform

Branch: `feature/api-platform`. Read [coordination and ownership](README.md) first. Your deliverable is a running API that validates/stores data, calls the other members' modules and exposes their results, plus the later frontend shell and upload flow.

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

- [ ] Set up FastAPI, configuration, common errors/states, test configuration, health, fixture-mode switch and skeleton contracts with domain owners. Health must actually import the advertised libraries.
- [ ] Complete the API gaps listed in the coordination plan. Define simulator and analysis aggregation responses from owner-provided schemas. Keep `/analysis` consistent with component endpoints.
- [ ] Establish isolated redistribution demo sessions with member 3; document how clients send session IDs. Export OpenAPI from implemented schemas.
- [ ] Verify health and domain fixture validation; run `pytest backend/tests/platform` from the repository root once the test setup exists.

### 2. Upload, storage and summary

- [ ] Implement CSV limits, row errors, UTF-8/BOM and delimiters, uniqueness and quantities. Use the master-plan formulas, TTL, cache identity and partial states.
- [ ] Implement template download, upload, demo import and summary/status endpoints. Keep malformed uploads distinct from demo data.
- [ ] Tests: valid/invalid CSV, duplicates, nonfinite values, `sold>prepared`, zero production, upload size, expiration/restart; example P=[10,30], S=[7,15], cost=[5,10] gives 18 unsold, 165 RON and 45%.
- [ ] Handoff: share a runnable API request and real response with all members, including error response.

### 3. Integrate calculations and redistribution router

- [ ] Call member 2's pattern/model functions and member 4's recommendations/simulator through the agreed interfaces. Persist/cache results and prevent refresh-triggered training.
- [ ] Register member 3's router and supply configuration; member 3 owns its persistence and state logic.
- [ ] Tests: analysis failure leaves summary usable; partial/insufficient results serialize correctly; fresh dataset does not reuse another dataset's results; fixture responses cannot appear in normal mode.
- [ ] Deploy the backend and verify health/CORS early. Record measured latency/memory and configuration in README.

### 4. Frontend integration phase

- [ ] Build shared React shell, routes, client with real/fixture transports, common loading/error controls, upload and summary pages. Publish component exports and props before others build screens.
- [ ] Register the other members' exported pages. Own frontend dependencies and global styles; feature owners keep styles scoped.
- [ ] Verify invalid upload, polling termination, refresh, dataset switching and backend failure. Run `npm run lint` and `npm run build` from `frontend`.

### 5. Release and later extensions

- [ ] Coordinate full regression, clean install, deployed smoke checks, OpenAPI export and shared progress updates. Check each module through the actual frontend.
- [ ] Later: operational import validation/versioning and clusters endpoint/cache, with member 2 calculations and member 4 fixtures/documentation.

## Avoid overlap

Do not implement another pattern engine, forecast model, simulator or donation repository. Ask the module owner for changes and use their fixtures while waiting. Do not mark a shared master-plan step complete until its UI and algorithm owners have finished.

## Progress

Record completed item, commit, verification command/result and remaining dependency here.
