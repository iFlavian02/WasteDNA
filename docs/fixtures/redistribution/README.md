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
| `log_surplus`, `list_surplus_log` | A donor confirms its **total surplus for a day** in kg. `0` is a real, confirmed zero-surplus day. Replaying the same quantity is safe; a different quantity for a confirmed day is a 409; future days and totals below what was already offered that day are 422. |
| `extract_surplus_history` | Builds `SurplusObservation` records for member 4's `forecast_surplus`. A logged day gives one **complete** record and replaces that day's offers. A day with only offers gives **incomplete** records, which the forecast excludes. Days with neither are absent, never zero. |

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

**Iași marketplace (opt-in):** `POST /demo?marketplace=true` (what the WiseEat shell uses) also seeds `marketplace.json`: six synthetic Iași restaurants with nine priced offers whose windows are relative to now (`minutes_from_now`), so they are always live. `create_demo_session(..., with_marketplace=True)` does the same in Python. The default `POST /demo` is unchanged, so the scenarios below and member 4's tests keep their exact counts. Used by the personal food map, [PERSONAL_MAP.md](../../PERSONAL_MAP.md).

**Customer orders:** `POST /offers/{id}/orders`, `GET /orders`, `POST /orders/{id}/cancel` (see [API.md § Customer orders](../../API.md#customer-orders)); offers expose `portions_left`. Tests: `backend/tests/redistribution/test_orders.py`.

**Prices:** offers accept optional `price_ron` (per portion, or for the whole offer when `portion_count` is null) and `original_price_ron` (requires `price_ron`, must be ≥ it); both default to `null`, a plain donation. The restaurant and supermarket seed offers are priced. Invalid combinations are a 400 `VALIDATION_ERROR`. Tests: `backend/tests/redistribution/test_marketplace.py`.

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
| `surplus_log_created.json` | `SurplusLogEntry` |
| `forecasts_demo.json` | `app.contracts.decisions.ForecastResult` |

`backend/tests/redistribution/test_schemas_and_persistence.py` validates every fixture. Run the tests from the repository root with `pytest backend/tests/redistribution`.

## Surplus log and forecasts

Forecasts need complete daily history, and offers alone are not complete. So a donor records its total surplus per day:

```sh
# confirm 25 kg of surplus today (use 0 for a day with no surplus)
curl -s -H "$H" -H 'Content-Type: application/json' -X POST $B/surplus-log \
     -d '{"donor_id":"donor-restaurant-copou","date":"2026-10-17","quantity_kg":25}'   # 201
curl -s -H "$H" "$B/surplus-log?donor_id=donor-restaurant-copou"                       # confirmed days
curl -s -H "$H" "$B/forecasts?days=7"                                                  # 1..60 days
```

- **`GET /forecasts`:** the adapter `app/redistribution/forecasts.py` calls member 4's `forecast_surplus` and fits no model itself. It returns member 4's `ForecastResult` unchanged, plus an explicit `insufficient_data` entry for any donor with no history at all.
- **Per donor:** at least 60 complete days gives `status: "ready"`, with predictions, an 80% interval, `model_mae` and `baseline_mae` measured on later test days, and `support_days`. Otherwise `status: "insufficient_data"` with a reason and no numbers.
- **First forecast day:** the day after the latest history date. Today's offers count as history, so with offers today the first forecast day is tomorrow (member 4's rule).
- **Never creates anything:** forecasts do not create offers, reservations or route stops. They are suggestions for coordinating pickups.
- **Demo:** `POST /demo` seeds deterministic synthetic logs, a restaurant with 90 days (closed Mondays are confirmed zero days), a supermarket with 75 and a household with 30. The household is below the 60-day minimum, so the demo shows both outcomes. Generation rules: `data/demo/redistribution/surplus_log.json`.
- **Python:** `create_demo_session(repo, now)` seeds the same confirmed logs as `POST /demo`. Pass `with_surplus_history=False` for an offers-only session.
- **Fixtures:** `forecasts_demo.json` (`ForecastResult` from the HTTP demo with a fixed clock) and `surplus_log_created.json`.

## Frontend (`frontend/src/features/redistribution/`)

**Mounting:** the default export of `index.jsx` is mounted by member 1's shell at `/redistribution/*` with `{ api, sessionId, prefill }` (see [FRONTEND_SHELL.md](../../FRONTEND_SHELL.md)). The shell owns the demo session (persisted across refresh, re-created on reset); this feature owns its sub-routes and scoped CSS (`.rd`).

| Route | Page |
|---|---|
| `/redistribution` | Business customer-sales orders: priced offers only, with status/category filters, prices, discounts, stock and pickup windows |
| `/redistribution/new` | Required product, portions, regular price and discount, plus food safety, quantity and pickup details. The customer price is computed and the listing is published to the personal food map. |
| `/redistribution/offers/:offerId` | Customer-sale details and removal from sale. This page does not request organization matches or expose charity reservations. |

**Prefill from member 4:** `navigate('/redistribution', { state: { prefill: { category, description } } })` opens the form with product and category suggested. Dish categories are mapped: `soup`, `main`, `side` and `daily_menu` become `prepared_meals`; `dessert` becomes `bakery`. Price, discount, quantity and deadlines are never prefilled.

The backend redistribution matching, reservation, handover, impact and forecast APIs remain available to backend integrations and their end-to-end tests, but they are intentionally not routed from the business Orders tab. See [ORDERS_TAB.md](../../ORDERS_TAB.md) for the customer-sales UI contract.

**Errors:**
- **409:** the page shows "Changed in the meantime" and reloads the data, so the new offer version is used.
- **400/422:** the API message and field details are shown, and the form input is kept.
- **Lost session:** the shell's reset notice appears, and the page offers a retry.
- **Network failure:** "Cannot reach the server".

**Code layout:**
- `logic.js`: pure rules (validation, prefill mapping, Europe/Bucharest time, error wording, keys).
- `api.js`: endpoint wrappers on the shared `api.request`.
- `hooks.js`: `useLoad` and `useDirectory`.
- `components.jsx` and `pages/*.jsx`: the UI.

**Checks** (from `frontend`):

```sh
npm run lint && npm run build
node --test "src/**/*.test.js"                     # unit tests incl. fixture-transport API tests
# opt-in, against a running backend:
WASTEDNA_API_URL=http://localhost:8000 node --test src/features/redistribution/e2e.test.js
```

The end-to-end test drives the real backend through these modules: every donor type through offer, match, reserve, handover and impact, then no-match, unknown allergens, expired, 409, forecasts and the surplus log. It reports how many handovers it completed. Organizations close in the evening, so set `WASTEDNA_E2E_REQUIRE_MATCHES=1` to demand all three.
