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
- Regenerate `docs/openapi.json` once these are in, if routes or fields changed.

**Acceptance:** `frontend/src/api/client.js` exists and is documented; the shell creates and persists the demo session; the redistribution route renders member 3's page; the API.md items above are in. Tell member 3 so UI work can start.

## Request to member 4 (data and decisions)

**Context:** member 3 exposes `GET /api/redistribution/forecasts?days=7`. It must call your `forecast_surplus` and must not fit a second model (`docs/team/README.md`). Per `docs/DECISIONS_MODULE.md`, `forecast_surplus(history, horizon_days) -> ForecastResult` is "not started (M2)", and `ForecastResult` is not defined in `backend/app/contracts/decisions.py`. This is a later-stage item, so it does not block anything else.

### Please decide the history format with me (proposal)

`extract_surplus_history(repo, session_id, now)` in `backend/app/redistribution/service.py` already returns `list[SurplusObservation]` (`backend/app/redistribution/schemas.py`):

| Field | Meaning |
|---|---|
| `donor_id`, `donor_type` | opaque donor ID; `restaurant`, `supermarket` or `household` |
| `date` | `YYYY-MM-DD`, local date of `available_from` |
| `interval_start`, `interval_end` | the offer's availability and pickup-deadline timestamps (offset-aware) |
| `observed_quantity` | kilograms, from a donor-confirmed offer |
| `unit` | always `"kg"` |
| `is_complete_observation` | **always `false`** for now |

**Important limits (from the team plan):**
- Offers alone do not establish a donor's total surplus or a zero-surplus day. Days without an offer are **absent**, not zero.
- Records are built only from donor-confirmed, non-cancelled offers.
- Households and new donors will rarely have 60 days of history, so `insufficient_data` is the expected result for them.

**Questions for you:**
1. Is this record enough for your temporal split and weekday/interval baseline? If you need other fields (for example an explicit `interval` label like `lunch`/`dinner`, or `observation_status`), say which and I will add them. The history extraction is mine.
2. Will `forecast_surplus` take this list directly, or a DataFrame? I will convert on my side if you prefer a DataFrame; tell me the column names.
3. Please define `ForecastResult` in `contracts/decisions.py` using the fields in `docs/API.md` § Impact and surplus forecasts: per donor and interval, `predicted_quantity_kg` (or portions with an explicit label), optional calibrated `interval`, `predicted_for`, `generated_at`, `support_days`, `model`, `baseline_mae`, `model_mae`, `provenance`, with `status: "insufficient_data"` and no fabricated numbers for donors without enough history. Add `forecast_ready.json` and `forecast_insufficient_data.json` under `docs/fixtures/decisions/`.

**Acceptance:** `forecast_surplus` and `ForecastResult` are on `main` with fixtures, and you have replied about the history fields. Member 3 then adds the `/forecasts` endpoint that calls your function. Forecasts never create offers, reservations or route stops.

## Status of member 3's blocked items

| Item | Waiting for |
|---|---|
| Donation frontend (step 3) | member 1: client, shell and routes (above) |
| `GET /forecasts` and the forecast UI | member 4: `forecast_surplus`, `ForecastResult` and the history-format reply |

## Reply and requests from member 4 (2026-10-17)

- **Reply to "Request to member 4":** done. `forecast_surplus`, `ForecastResult`, `forecast_ready.json` and `forecast_insufficient_data.json` are on `main`. The answers to your three questions are in the Progress section of `docs/team/MEMBER_4_DATA_DECISIONS.md` and in [member 4's requests](../decisions/REQUESTS.md) § 3.2.
- **Requests** (detail in [member 4's requests](../decisions/REQUESTS.md) § 3):
  1. **Confirm the prefill category mapping.** `soup`, `main`, `side` and `daily_menu` → `prepared_meals`; `dessert` → `bakery`. The actions page already sends `{ category, description }` this way, and never a quantity or deadline.
  2. **Add `GET /api/redistribution/forecasts`**, calling `forecast_surplus`, and agree with member 4 on a source of complete daily history.
  3. **Tick the steps 1–2 boxes** your Progress notes already report as done.
