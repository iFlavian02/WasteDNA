# Requests from member 3 (redistribution)

Written 2026-10-17 after merging `origin/main` (`2d231aa`) into `redistrib`. Each section is self-contained so that member's agent can act without further context. The backend part of redistribution is finished and integrated: see [README.md](README.md) for the module guide and a runnable request sequence. Reply by updating the item here or in your own Progress section.

## Request to member 1 (platform)

**Context:** member 3's donation UI (`frontend/src/features/redistribution/`) is blocked on the frontend shell. As of `origin/main` `2d231aa`, `frontend/src/` has only the default Vite files, with no `api/client.js`, routes or shell. Per `docs/team/README.md` your step 4 (frontend integration phase) comes first.

### 1. Shared client and shell (needed before member 3 can start step 3)

Please publish these, with usage notes in your docs, before I build pages:

- **`frontend/src/api/client.js`** with real and fixture transports. For redistribution it needs:
  - a request helper that sends JSON and **automatically attaches `X-Demo-Session-Id`** to every `/api/redistribution/*` call except `POST /api/redistribution/demo`;
  - the parsed common error envelope (`{error: {code, message, details, request_id}}`) exposed to pages, so they can tell 404 (unknown session), 409 (conflict), 422 and 400 apart.
- **Demo session state in the shell:**
  - create the session via `POST /api/redistribution/demo` on first use;
  - keep the ID in `localStorage` so it survives a refresh;
  - provide it to pages (props or context);
  - re-create it when the API answers 404 `NOT_FOUND` for the session, for example after the database file was reset. Pages must be told the data was reset.
- **Route registration:** register member 3's default export, `frontend/src/features/redistribution/index.jsx`, under `/redistribution` (sub-routes are handled inside the feature). Member 3 keeps styles scoped to the feature.
- **Shared components:** loading, error and empty-state controls, and their props, as listed in your step 4.
- **Prefill from the actions screen (member 4):** the shell should pass navigation state like `{ prefill: { category, description } }` to `/redistribution`. Member 3's form treats it as a suggestion only: the donor must confirm the real quantity and pickup deadline.

### 2. `docs/API.md` additions (small, you own the file)

- **`GET /api/redistribution/impact`** accepts optional `from` and `to` query parameters (`YYYY-MM-DD`, inclusive). They filter by the local (Europe/Bucharest) calendar date of the offer's `pickup_deadline`. Handovers are filtered by the same date. The response also includes `is_synthetic`, `destinations[]` (`organization_id`, `handed_over_quantity_kg`, `handover_count`) and `limitations[]`; see `docs/fixtures/redistribution/impact.json`.
- **`POST /api/redistribution/routes/plan`:** the response fields are in `docs/fixtures/redistribution/route_plan.json` (`method`, `stops[].estimated_departure`, `stops[].load_after_kg`, `arrival_at_destination`, `limitations`). Please mirror them if API.md lists the route response.
- **New routes (member 3, 2026-10-17):** `POST /api/redistribution/surplus-log` (body `donor_id`, `date`, `quantity_kg` >= 0, where 0 is a confirmed zero day; 201, 409 for a different quantity on a confirmed day, 422 for future days or totals below what was already offered), `GET /api/redistribution/surplus-log?donor_id=` and `GET /api/redistribution/forecasts?days=1..60`. Forecasts return member 4's `ForecastResult` directly; see `docs/fixtures/redistribution/forecasts_demo.json` and `surplus_log_created.json`.
- Regenerate `docs/openapi.json` once these are in, if routes or fields changed.

**Acceptance:** `frontend/src/api/client.js` exists and is documented; the shell creates and persists the demo session; the redistribution route renders member 3's page; the API.md items above are in. Tell member 3 so UI work can start.

## Request to member 4 (data and decisions)

**Context:** member 3 exposes `GET /api/redistribution/forecasts?days=7`. It must call your `forecast_surplus` and must not fit a second model (`docs/team/README.md`). Per `docs/DECISIONS_MODULE.md`, `forecast_surplus(history, horizon_days) -> ForecastResult` is "not started (M2)", and `ForecastResult` is not defined in `backend/app/contracts/decisions.py`. This is a later-stage item, so it does not block anything else.

### Resolved by member 4 (2026-10-17) and implemented by member 3

Member 4 delivered `forecast_surplus`, `ForecastResult` and fixtures, and answered the history questions: the `SurplusObservation` fields are enough, input is the list directly, and field names differ slightly from `API.md` (`predicted_quantity` + `unit`; they asked member 1 to align the doc). The remaining blocker was data, not fields: offers alone are never complete history.

Member 3 has now added a donor-confirmed daily surplus log (`POST/GET /api/redistribution/surplus-log`, where `0` kg is a confirmed zero day) and `GET /api/redistribution/forecasts?days=7`, which calls `forecast_surplus` unchanged. Details and the request sequence are in [README.md](README.md) § Surplus log and forecasts.

### Follow-up for member 4 (one small test change, in your file): resolved 2026-10-17

`backend/tests/decisions/test_forecasting.py::test_real_member_3_history_from_offers_is_insufficient` builds a demo session with `create_demo_session(repo, now)` and expects every donor to be `insufficient_data`. That is still true, because `create_demo_session` stays **offers-only by default** so your test passes unchanged. Only `POST /api/redistribution/demo` seeds the confirmed logs (`with_surplus_history=True`).

Please add a second assertion using `create_demo_session(repo, now, with_surplus_history=True)`: the restaurant and supermarket should be `ready`, and the household (30 days) `insufficient_data`. Then tell member 3 and the default can flip to seeded. Details of the `API.md` forecast-field alignment stay with member 1.

**Reply from member 4 (2026-10-17):** done. `test_real_member_3_confirmed_surplus_log_gives_ready_forecasts` uses `create_demo_session(repo, now, with_surplus_history=True)`: the restaurant (90 days) and supermarket (75 days) are `ready` with 7 predictions each, and the household (30 days) is `insufficient_data`. The offers-only test now passes `with_surplus_history=False` explicitly, so **you can flip the default to seeded** without breaking member 4's tests. The prefill mapping confirmation is acknowledged. Thank you.

## Status of member 3's items

| Item | Status |
|---|---|
| Donor-confirmed surplus log and `GET /forecasts` (backend) | done and tested (member 3) |
| Donation and forecast frontend (step 3) | done (member 3), built on member 1's shell; see README § Frontend |
| `API.md` additions | impact filters and route fields **done**; surplus-log routes and forecast field names still open with member 1 (follow-up 2026-10-17 in `docs/fixtures/platform/REQUESTS.md`) |
| `Dockerfile` must copy `data/demo/redistribution/` | **resolved** by member 1 (`5bd5d1b`); `test_deployment_assets.py` now guards it |
| Pilot authorization model (`PILOT.md`) | member 1: agree on roles/permissions and identity dependency (follow-up sent 2026-10-17) |
| Seeded forecast history as the Python default | **resolved**: member 4 made their test explicit; `create_demo_session` now seeds by default |

## Reply and requests from member 4 (2026-10-17)

- **Reply to "Request to member 4":** done. `forecast_surplus`, `ForecastResult`, `forecast_ready.json` and `forecast_insufficient_data.json` are on `main`. The answers to your three questions are in the Progress section of `docs/team/MEMBER_4_DATA_DECISIONS.md` and in [member 4's requests](../decisions/REQUESTS.md) § 3.2.
- **Requests** (detail in [member 4's requests](../decisions/REQUESTS.md) § 3):
  1. **Confirm the prefill category mapping.** `soup`, `main`, `side` and `daily_menu` → `prepared_meals`; `dessert` → `bakery`. The actions page already sends `{ category, description }` this way, and never a quantity or deadline.
  2. **Add `GET /api/redistribution/forecasts`**, calling `forecast_surplus`, and agree with member 4 on a source of complete daily history.
  3. **Tick the steps 1–2 boxes** your Progress notes already report as done.

**Reply from member 3 (2026-10-17):** all three are done on `main`.
  1. Mapping confirmed, and also in [member 4's requests](../decisions/REQUESTS.md) § 3.1. The form passes offer categories you already mapped (`prepared_meals`, `bakery`) through unchanged, and maps raw dish categories itself. Quantity and the pickup window are always entered and confirmed by the donor.
  2. `GET /api/redistribution/forecasts?days=1..60` calls `forecast_surplus` unchanged. Complete history comes from the new donor-confirmed daily surplus log (`POST/GET /api/redistribution/surplus-log`; `0` kg is a confirmed zero day). See [README.md](README.md) § Surplus log and forecasts, and the follow-up for your test above.
  3. Steps 1–3 are ticked in `docs/team/MEMBER_3_REDISTRIBUTION.md`.
