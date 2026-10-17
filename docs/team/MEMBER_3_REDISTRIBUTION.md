# Member 3 — Redistribution and pickup

Branch: `feature/redistribution`. Read [coordination and ownership](README.md). Deliver a complete manually entered donation flow independent of restaurant ML, then its frontend.

## Rules for agents working in parallel

These plans are independently developable after a shared contract setup, not completely dependency-free. A separate branch prevents neither incompatible interfaces nor conflicting edits by itself.

1. Before dependent implementation, confirm the shared setup checkpoint: API request/response shapes, CSV columns and units, internal function signatures, common errors/states, and small example fixtures are agreed and committed to `main`. Record that commit in your Progress section and update your branch from it. The planned 30–45 minutes is an estimate, not automatic approval that setup is complete.
2. If the checkpoint is incomplete, continue isolated work in your owned area and identify the exact missing contract to its owner. Do not invent a competing interface or wait for another member's entire plan to finish.
3. Work only in your assigned files and branch. Request changes to shared files from their owner; record an agreed ownership transfer before editing outside your scope. Agents running simultaneously on one machine need separate worktrees/checkouts; never switch branches in a shared working directory while another agent is using it.
4. Use agreed fixtures or injected test doubles for unavailable dependencies. Keep them explicit and confined to tests or fixture mode; never return mock results as a normal successful analysis or silently replace a failed upload. Implement the real integration when the producer's module is available.
5. Treat contracts as shared agreements. Coordinate field/signature changes with affected owners before implementation, update schemas/examples and documentation through their owners, and do not fork or duplicate another member's production logic.
6. Hand off small completed slices with the interface, example input/output, verification results and remaining dependencies. Integrate through small pull requests and bring merged `main` changes into your branch regularly, within the session's Git permissions. Branch completion is not a prerequisite for integration.
7. Track implementation, fixture-based verification and real integration separately in Progress. Do not mark a cross-member feature complete until it works with the actual modules. When blocked on one dependency, continue other owned tasks and report the specific blocker.

Your dependencies: Develop the manual donation flow against your own agreed donor, charity and offer fixtures. It does not depend on restaurant analysis, a trained model, or forecasts. Member 1 registers your router for integration. Member 4's forecasts are a later dependency and must not block matching, reservations or handover.

## Master-plan responsibility

Own 9.1–9.3 and 10.1. For 10.2, own history extraction and forecasts HTTP endpoint/UI only; member 4 owns forecast calculations. Own the operational pilot document in 11.2 and donation portion of 11.1. Member 1 owns app registration, shared config, deployment and eventual authentication infrastructure.

## Owned files

`backend/app/redistribution/*` except `forecasting.py`, `backend/app/api/redistribution.py`, `backend/tests/redistribution/*`, `data/demo/redistribution/*`, `docs/fixtures/redistribution/*`, `docs/PILOT.md`, `frontend/src/features/redistribution/*`. Forecast computation instead lives in member 4's `decisions/forecasting.py`; do not create a duplicate model.

## Build sequence

### 1. Independent schema, fixtures and persistence

- [ ] Define donor/organization/offer/reservation/handover schemas and fixtures for all three donor types. Supply success, no-match, unknown-allergen, expired and conflict examples.
- [ ] Implement SQLite persistence isolated by demo session and separate from dataset TTL. Agree session header/cookie transport and configuration with member 1 before exposing routes.
- [ ] Export an `APIRouter` for member 1 to register. Develop repository/service tests directly without waiting for their app.
- [ ] Tests: constraints, restart persistence, session isolation and analytical cleanup preserving donation records.

### 2. Matching and complete handover

- [ ] Implement category/allergen/storage/capacity/distance/time eligibility with rejection reasons. For a single offer, deadline is constant; rank its eligible organizations by distance then ID. Across available offers, earliest deadline sets urgency.
- [ ] Implement atomic full-offer reservations, version conflict, idempotency, release/cancel/expire and confirmed handover. Capacity checks include concurrent reservations and actual handovers.
- [ ] Count confirmed received kg once, with offered/reserved/handed-over quantities shown separately. Predictions never create available stock.
- [ ] Tests: incompatible nearby charity excluded; two concurrent reservations have one winner; replay never duplicates impact; expiry releases capacity; excessive handover quantity rejected.
- [ ] Verification: `pytest backend/tests/redistribution`; provide member 1 a full runnable request sequence for offer → match → reserve → handover.

### 3. Donation frontend

- [ ] Build offer creation/list, explained matching, reserve/release and handover pages with member 1's client; use manual input first.
- [ ] Accept optional prefill from member 4's actions screen, but require confirmation of real available quantity and pickup deadline.
- [ ] Handle 409/expired/empty states and refresh without losing the demo session. Verify every donor type and no-match scenario; run frontend lint/build.

### 4. Later routes, forecasts and pilot

- [ ] Add feasible routing with vehicle capacity, windows, storage and simulated duration matrix; include excluded reservations with reasons. Test impossible routes and invalidation after cancellation.
- [ ] Supply complete observed surplus history to member 4 only where supported; list forecasts separately from confirmed offers. Expose member 4's function through your endpoint without fitting a separate model.
- [ ] Document real pilot acceptance/transport responsibilities and validation needs with partners. Coordinate authorization requirements with member 1 before real accounts/data are introduced.

## Avoid overlap

You own matching rules even though they are described as an AI-related feature. Member 2 does not implement charity matching. Request shared configuration/OpenAPI/client changes from member 1. Restaurant synthetic data belongs to member 4; donation fixtures belong to you.

## Progress

Record completed item, commit, verification command/result and remaining dependency here.

### 2026-10-17: backend steps 1, 2 and routing (branch `redistrib`, based on `main` @ `a47538f`)

- **Implemented:**
  - `backend/app/redistribution/{schemas,geo,repository,matching,service,routing,demo}.py` and `backend/app/api/redistribution.py` (`router`).
  - SQLite per-session persistence, rule-based matching with reasons, atomic idempotent reservations, release, cancel and expire, idempotent handover, separate impact totals, the route heuristic, and `extract_surplus_history` (a proposed contract for member 4).
  - Synthetic demo data in `data/demo/redistribution/`.
  - Generated fixtures and the handoff guide in `docs/fixtures/redistribution/README.md`; the pilot document in `docs/PILOT.md`.
- **Verification (fixtures and real module):** `pytest backend/tests/redistribution backend/tests/platform` gives 64 passed. The concurrency test passed 30 of 30 repeated runs. The tests cover:
  - an incompatible nearby charity is excluded;
  - two concurrent reservations produce one winner;
  - a replay never duplicates impact;
  - expiry releases capacity;
  - an excessive handover is rejected;
  - restart persistence and session isolation;
  - analytics cleanup keeps donation records;
  - the HTTP flow for all three donor types.
- **Real integration (backend):** done once member 1 registered the router and added `redistribution_db_path` / `REDISTRIBUTION_DB_PATH` (`origin/platform` @ `1bd4545`). `backend/tests/redistribution/test_registered_app.py` exercises the router through the platform's own `create_app()`: demo → matches → idempotent reserve → list/get, the platform's error envelope, the configured DB path and the CORS preflight for `X-Demo-Session-Id`. Full backend suite: 125 passed. The frontend is not integrated yet.
- **Requests to member 1:** `GET /reservations` and `GET /offers/{id}` were added to `API.md`. Still open: the `/impact` `from`/`to` filters.
- **Requests written for members 1 and 4:** [docs/fixtures/redistribution/REQUESTS.md](../fixtures/redistribution/REQUESTS.md).
- **Blocked:**
  - Step 3 UI waits for member 1 step 4 (shell, routes, `src/api/client.js`).
  - The `/forecasts` endpoint waits for member 4 step 4 (`forecast_surplus`, `ForecastResult`), plus agreement on the history format.
- **Steps 1–2 checklist:** verified with fixtures and through the registered backend app. Frontend integration (step 3) is still pending.
