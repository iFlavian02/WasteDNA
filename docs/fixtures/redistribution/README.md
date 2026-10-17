# Redistribution handoff (member 3)

Surplus redistribution: a donor-confirmed offer → rule-based matching with reasons → atomic full-offer reservation → pickup route → confirmed handover → impact. The JSON files in this directory are **real outputs** of the module, produced with a fixed clock (2026-10-17 10:00 Europe/Bucharest) from the synthetic demo data in `data/demo/redistribution/`. They are examples and test inputs only. Normal mode never substitutes them for a real result.

HTTP contract: [`docs/API.md` § Surplus redistribution](../../API.md). This page covers how to use the module from other code, the demo data, and the request sequence.

## For member 1: register the router

```python
from app.api.redistribution import router as redistribution_router
app.include_router(redistribution_router, prefix="/api/redistribution")
```

- **Errors:** the router raises `HTTPException`, so the existing handlers in `app/main.py` produce the common envelope:
  - 404 `NOT_FOUND`: unknown or missing session, offer, reservation or organization.
  - 409 `CONFLICT`: state, version, capacity or idempotency conflicts.
  - 422 `INVALID_DATA`: semantically invalid data, for example an unknown donor or an excessive handover.
  - 400 `VALIDATION_ERROR`: a malformed body.
- **CORS:** the current settings (all headers allowed, GET and POST) already cover the `X-Demo-Session-Id` header. Every route uses GET or POST.
- **Requested setting (please add):** `redistribution_db_path: Path` in `Settings`, read from `REDISTRIBUTION_DB_PATH`, and documented in `.env.example`.
  - The router reads `app.state.settings.redistribution_db_path` when that setting is present.
  - Until then it uses `backend/.runtime-redistribution/redistribution.sqlite3`.
  - Either way the database is a file separate from `DATA_DIR` and from the 24 h analytics TTL.
  - The repository writes a `.gitignore` containing `*` into the database directory, so the file is never committed.
- **Proposed API.md addition:** `GET /api/redistribution/reservations?status=` lists the session's reservations. Without it the UI cannot find reservation IDs for release, handover or routing. `GET /offers/{id}` and the `from`/`to` (YYYY-MM-DD) filters on `/impact` are small additions in the same spirit.

## Python interface (`app.redistribution`)

All functions are HTTP-free. Each takes `(repo, session_id, ..., now)`, returns a Pydantic model from `app/redistribution/schemas.py`, and raises `NotFoundError`, `ConflictError` or `InvalidDataError`. All three are subclasses of `RedistributionError`.

```python
from datetime import datetime, UTC
from app.redistribution import Repository, create_demo_session, find_matches, reserve
from app.redistribution.schemas import ReservationCreate

repo = Repository("backend/.runtime-redistribution/redistribution.sqlite3")
now = datetime.now(UTC)
session_id = create_demo_session(repo, now)
offer = ...  # from list_offers(repo, session_id, now)
matches = find_matches(repo, session_id, offer.id, now)          # MatchesResult
reservation = reserve(repo, session_id, offer.id,
    ReservationCreate(organization_id=matches.eligible[0].organization_id,
                      offer_version=offer.version, idempotency_key="k1"), now)
```

| Function | Purpose |
|---|---|
| `create_demo_session`, `list_offers`, `create_offer`, `cancel_offer` | Sessions and offers. Listing is sorted by urgency: earliest deadline, then ID. |
| `find_matches` | Applies every mandatory filter: category, allergens, storage, radius, daily capacity, and opening hours ∩ pickup window. Returns `eligible`, ranked by distance then ID, and `rejected`, with all reasons. This is a rule-based filter, not a trained model. |
| `reserve`, `release`, `list_reservations` | Atomic full-offer reservation. It rechecks state, version and eligibility, and its capacity check includes other active reservations and handovers on the same local day. |
| `confirm_handover`, `impact` | Received kg ≤ offered kg. Impact counts only confirmed handovers, once per reservation. |
| `plan_pickup_route` | Deterministic insertion heuristic over simulated travel times. Planning never changes reservation state. |
| `extract_surplus_history` | **For member 4 (proposal, not yet agreed).** Produces `SurplusObservation` records, one per non-cancelled offer, with `unit="kg"` and `is_complete_observation=false`. Offers do not prove total surplus, and days without an offer are absent, not zero. |

State rules:
- Every call first expires offers whose deadline has passed and releases the capacity they held.
- A released reservation returns its offer to `available` (version + 1).
- Collected and expired offers cannot be cancelled.
- Unknown allergens (`allergens: null`) block automatic matching.

## Demo data (`data/demo/redistribution/`)

All names and locations are synthetic (Iași area).
- **Donors:** one restaurant, one supermarket and one household.
- **Organizations:**
  - food bank: broad categories, ambient and chilled storage, 60 kg/day;
  - canteen: chilled only, excludes gluten and peanuts, 25 kg/day;
  - shelter: ambient only, 10 kg/day;
  - pantry: far away, 3 km radius, closed at weekends.

Offer times are relative to the moment the session is created. `{"day": 0, "time": "17:00"}` falls on the anchor day: today if the local time is before 15:00, otherwise tomorrow.

| Scenario (`offers.json`) | Expected result |
|---|---|
| `success_multiple_matches`: supermarket bread, gluten, 8 kg | food bank and shelter eligible. The nearby canteen is rejected with three reasons. |
| `success_chilled_meals`: restaurant soup, celery, chilled, 12 kg | food bank and canteen eligible. The shelter is rejected (storage, capacity). |
| `unknown_allergens`: household cake | no eligible match ("Allergens unknown…") |
| `no_match`: frozen meals | no eligible match; this is a 200 response with an empty `eligible` list |
| `expired` | listed with `status: "expired"`. Matching or reserving it returns 409. |

## Request sequence (runnable)

```sh
uvicorn app.main:app --app-dir backend --reload   # after member 1 registers the router
B=http://localhost:8000/api/redistribution
S=$(curl -s -X POST $B/demo | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])")
H="X-Demo-Session-Id: $S"
curl -s -H "$H" $B/offers                                   # pick an offer id + version
curl -s -H "$H" $B/offers/OFFER_ID/matches                  # eligible + rejected with reasons
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $B/offers/OFFER_ID/reservations \
     -d '{"organization_id":"org-foodbank-nord","offer_version":1,"idempotency_key":"r1"}'   # 201
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $B/offers/OFFER_ID/reservations \
     -d '{"organization_id":"org-shelter-tatarasi","offer_version":1,"idempotency_key":"r2"}' # 409 CONFLICT
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $B/routes/plan \
     -d '{"organization_id":"org-foodbank-nord","reservation_ids":["RES_ID"],"vehicle_capacity_kg":40,"departure_at":"<ISO time with offset>","start_location":{"lat":47.173,"lon":27.574},"destination":{"lat":47.173,"lon":27.574}}'
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $B/reservations/RES_ID/handover \
     -d '{"received_quantity_kg":7.5,"received_at":"<ISO time with offset, before the deadline>","idempotency_key":"h1"}'  # 201, replay is safe
curl -s -H "$H" $B/impact                                   # handed_over_quantity_kg counted once
```

## Fixture inventory

| File | Model |
|---|---|
| `offer_created.json`, `offer_expired.json` | `Offer` |
| `matches_success.json`, `matches_no_match.json`, `matches_unknown_allergens.json` | `MatchesResult` |
| `reservation_created.json` | `Reservation` |
| `reservation_conflict_error.json` | `app.contracts.common.ErrorResponse` (409) |
| `route_plan.json` | `RoutePlan` |
| `handover_collected.json` | `Handover` |
| `impact.json` | `ImpactResult` |

`backend/tests/redistribution/test_schemas_and_persistence.py` validates every fixture. Run the tests from the repository root with `pytest backend/tests/redistribution`.

## Not yet available

- **`GET /forecasts`:** waits for member 4's `forecast_surplus(history, horizon_days)` and `ForecastResult` (their step 4). The endpoint will call that function; it will not fit a second model.
- **Donation UI (`frontend/src/features/redistribution/`):** waits for member 1's shell, routes and `src/api/client.js` (their step 4).
