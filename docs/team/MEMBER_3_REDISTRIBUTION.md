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

- [x] Define donor/organization/offer/reservation/handover schemas and fixtures for all three donor types. Supply success, no-match, unknown-allergen, expired and conflict examples.
- [x] Implement SQLite persistence isolated by demo session and separate from dataset TTL. Agree session header/cookie transport and configuration with member 1 before exposing routes.
- [x] Export an `APIRouter` for member 1 to register. Develop repository/service tests directly without waiting for their app.
- [x] Tests: constraints, restart persistence, session isolation and analytical cleanup preserving donation records.

### 2. Matching and complete handover

- [x] Implement category/allergen/storage/capacity/distance/time eligibility with rejection reasons. For a single offer, deadline is constant; rank its eligible organizations by distance then ID. Across available offers, earliest deadline sets urgency.
- [x] Implement atomic full-offer reservations, version conflict, idempotency, release/cancel/expire and confirmed handover. Capacity checks include concurrent reservations and actual handovers.
- [x] Count confirmed received kg once, with offered/reserved/handed-over quantities shown separately. Predictions never create available stock.
- [x] Tests: incompatible nearby charity excluded; two concurrent reservations have one winner; replay never duplicates impact; expiry releases capacity; excessive handover quantity rejected.
- [x] Verification: `pytest backend/tests/redistribution`; provide member 1 a full runnable request sequence for offer → match → reserve → handover.

### 3. Donation frontend

- [x] Build offer creation/list, explained matching, reserve/release and handover pages with member 1's client; use manual input first.
- [x] Accept optional prefill from member 4's actions screen, but require confirmation of real available quantity and pickup deadline.
- [x] Handle 409/expired/empty states and refresh without losing the demo session. Verify every donor type and no-match scenario; run frontend lint/build.

### 4. Later routes, forecasts and pilot

- [x] Add feasible routing with vehicle capacity, windows, storage and simulated duration matrix; include excluded reservations with reasons. Test impossible routes and invalidation after cancellation.
- [x] Supply complete observed surplus history to member 4 only where supported; list forecasts separately from confirmed offers. Expose member 4's function through your endpoint without fitting a separate model. *(Backend done: donor-confirmed daily surplus log, `extract_surplus_history` and `GET /forecasts` calling `forecast_surplus`. The forecast UI belongs to step 3.)*
- [ ] Document real pilot acceptance/transport responsibilities and validation needs with partners. Coordinate authorization requirements with member 1 before real accounts/data are introduced. *(partial: `docs/PILOT.md` is written; coordination with member 1 on authorization is still open.)*

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

### 2026-10-17: Step 4 forecasts backend (branch `redistrib`, after merging `origin/main` @ `a77857d`)

- **Merged and checked first:** member 4 delivered `forecast_surplus` / `ForecastResult` and replied that `SurplusObservation` is enough as it is. The blocker was data, not fields: offers alone are never complete history.
- **Implemented:**
  - Donor-confirmed daily surplus log: `POST/GET /api/redistribution/surplus-log`. `0` kg is a confirmed zero day. Conflicts and invalid dates are rejected; see `docs/fixtures/redistribution/README.md`.
  - `extract_surplus_history` now emits complete records for logged days (replacing that day's offers) and incomplete records for offer-only days.
  - `GET /api/redistribution/forecasts?days=1..60` through `app/redistribution/forecasts.py`, calling member 4's function unchanged. Donors with no history appear as explicit `insufficient_data`.
  - `POST /demo` seeds deterministic synthetic logs (restaurant 90 days, supermarket 75, household 30), so the demo shows both ready and insufficient forecasts.
- **Verification (fixtures and real module):** `pytest backend/tests` gives 176 passed, including the forecasts through the platform's registered app. The concurrency test passed 15 of 15 repeated runs.
- **Open with member 4:** `create_demo_session(repo, now)` stays offers-only by default because their `test_real_member_3_history_from_offers_is_insufficient` relies on it. They should add a seeded-session assertion, then the default can flip.
- **Open with member 1:** `API.md` additions (surplus log, forecasts, impact filters), and the shared frontend shell published in `7bfc112` still has to be checked before step 3.

### 2026-10-17: Step 3 donation frontend (branch `redistrib`, after merging `origin/main` @ `c8e150f`)

- **Checked first:** `AGENTS.md` and every `docs/fixtures/*/REQUESTS.md`. Member 1's shell (`FRONTEND_SHELL.md`) provides `{ api, sessionId, prefill }` at `/redistribution/*`. Member 4 asked to confirm the prefill category mapping. Member 2 had no request for member 3.
- **Implemented:** `frontend/src/features/redistribution/`:
  - offers list, offer form, offer details (explained matches, reserve/release, cancel, handover), reservations with route planning, impact, and forecasts with the surplus log;
  - prefill mapping, 409/400/422/404/network handling, and retry-safe idempotency keys.
  - The guide is in `docs/fixtures/redistribution/README.md` § Frontend.
- **Verification:**
  - `npm run lint`: clean. `npm run build`: OK.
  - `node --test "src/**/*.test.js"`: 16 passed, including member 1's 3 client tests.
  - The opt-in `e2e.test.js` against a live backend: 3 passed, with all 3 donor types completing offer → match → reserve → handover → impact. No-match, unknown allergens, expired, 409 and forecasts were also covered.
  - Headless-Edge walkthrough of the real UI (Vite + uvicorn): offers, matches, reserve, over-quantity handover error, handover, refresh keeping the session, impact, forecasts, route plan, and prefill form validation. No console errors.
  - It found and fixed one bug: tab links on nested pages resolved against the splat URL (React Router v7).
- **Replied:** member 4's prefill mapping in `docs/fixtures/decisions/REQUESTS.md`; member 1's handoff request in `docs/fixtures/platform/REQUESTS.md`.
