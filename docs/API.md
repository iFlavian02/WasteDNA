# WasteDNA API Contract

This document is the shared contract for frontend, backend, and analysis work. The application uses JSON over HTTP, except CSV dataset uploads, which use `multipart/form-data`. All routes use the `/api` prefix. Examples describe the intended interface; confirm implementation status in `PLAN.md` and `docs/PROGRESS.md`.

## Conventions

- JSON request and response bodies use `Content-Type: application/json; charset=utf-8`.
- Timestamps are ISO 8601 with an explicit offset, for example `2026-10-17T19:00:00+03:00`. Display times in `Europe/Bucharest`.
- Quantities are non-negative numbers. Food offer and handover weights use kilograms (`kg`); restaurant production and sales use portions (`portions`). Never infer a conversion between portions and kilograms unless the dataset supplies the portion weight.
- Rates are decimals from `0` to `1` (`0.30` means 30%). Differences in rates are percentage points (`pp`), not relative percentages.
- IDs are opaque strings. Clients must not construct or interpret IDs.
- Unknown values are omitted or `null`, according to the field contract; they must not silently be treated as zero.
- Dataset analysis and donation operations are separate resources. Expiring an analysis cache must not delete donation offers or handover records.
- The demo uses synthetic records. Responses and UI must identify simulated results as such.

## Common errors

Errors use the same shape for all endpoints:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "quantity_kg",
        "message": "Must be greater than zero."
      }
    ],
    "request_id": "req-abc123"
  }
}
```

Use HTTP `400` for malformed requests, `404` for unknown resources, `409` for state or concurrency conflicts, `413` for oversized uploads, `422` for semantically invalid data, and `500` for unexpected server errors. Clients may display `message` and field-level `details`; they should not depend on server traceback text.

## Dataset and restaurant analysis

### Upload a CSV

`POST /api/datasets`

Content type: `multipart/form-data`, field name `file`. The CSV has one row per unique `(date, dish_id, time_slot)`. Required columns: `date`, `dish_id`, `dish_name`, `category`, `time_slot`, `prepared_qty`, `sold_qty`, `unit_cost_ron`. Optional columns: `unit_price_ron`, `stockout_confirmed`. Dates use `YYYY-MM-DD`; `time_slot` is `lunch` or `dinner`; quantities are integers and `0 <= sold_qty <= prepared_qty`; `unit_cost_ron` must be finite and greater than zero. UTF-8 with or without BOM is accepted. A rejected upload is never replaced with demo data.

Successful response (`202 Accepted`):

```json
{
  "dataset_id": "ds-opaque123",
  "source": "upload",
  "is_synthetic": false,
  "status": "processing",
  "created_at": "2026-10-17T10:00:00+03:00"
}
```

Implemented dataset routes and summary fields are described in [PLATFORM_DATASETS.md](PLATFORM_DATASETS.md). `GET /api/template.csv` downloads the template. The demo route imports the full 180-day synthetic CSV. After each import, a background task runs patterns, recommendations, model evaluation and clustering once and persists their public results in the dataset snapshot. Reading or refreshing a dataset never starts a calculation. The response to upload remains `202`; poll status until it is `ready` or `partial`.

The registered API also provides `GET /api/datasets/{dataset_id}/analysis` and component envelopes at `GET /api/datasets/{dataset_id}/{patterns|model|explanations|anomalies|recommendations|clusters}`. Pending components return HTTP `202` with `{ "status": "queued", "result": null, "limitations": [] }`. Completed components return HTTP `200`; `insufficient_data` carries the owner's result and limitations, while errors have a null result and safe limitation. The aggregate carries the same component states and public results, including the complete public `ModelResult`. Its status is `partial` if a calculation fails, while the summary remains ready. Clustering runs independently and therefore may fail without hiding patterns or model output. `POST /api/datasets/{dataset_id}/simulate` calls member 4's real simulator on the validated stored rows.

An invalid CSV returns `422` with row numbers and stable error codes in `details`.

### Load the synthetic demo dataset

`POST /api/datasets/demo`

No request body. Returns the same dataset response shape, with `source: "demo"` and `is_synthetic: true`. Demo data is read-only.

### Get dataset status

`GET /api/datasets/{dataset_id}`

```json
{
  "dataset_id": "ds-opaque123",
  "source": "demo",
  "is_synthetic": true,
  "status": "ready",
  "components": {
    "summary": "ready",
    "patterns": "ready",
    "model": "ready",
    "explanations": "ready",
    "anomalies": "ready",
    "recommendations": "ready",
    "clusters": "ready"
  }
}
```

Component states: `queued`, `running`, `ready`, `insufficient_data`, or `error`. A component error does not make completed components unavailable.

### Shared result envelope and owner handoff

Each component endpoint returns `{ "status": ComponentState, "result": object | null, "limitations": string[] }`. `queued` and `running` return HTTP `202` with `result: null`; `ready`, `insufficient_data`, and `error` return HTTP `200`. An `insufficient_data` result has the domain's empty arrays and a reason in `limitations`. An `error` result is `null` and has a safe explanation in `limitations`; it does not erase other components. The aggregate `/analysis` response lists component state strings under `components`; its public `summary`, `patterns`, `model`, `anomalies`, `explanations`, `recommendations`, and `clusters` values are derived from the same stored results used by the component endpoints. Clients must not infer readiness from an empty array.

Domain owners implement Pydantic models and one `ready` and one `insufficient_data` fixture in their owned `backend/app/contracts/{analytics,decisions}.py` and `docs/fixtures/{analytics,decisions}/`. The platform validates fixtures against those models and exposes only public fields. `docs/openapi.json` is exported after the owner models and routes are implemented; the current export contains only implemented routes.

Member 2's `PatternsResult` has `status`, `items` (pattern objects), and `limitations`; `ModelResult` has `status`, `evaluation`, `explanations`, `anomalies`, and `limitations`. `ClustersResult` has `status`, `items`, and `limitations`. `insufficient_data` uses empty arrays and `null` evaluation, never fabricated metrics. Pattern metrics include `unsold_rate` (unsold/prepared), `prepared_portions`, and nullable `unsold_over_sales`; the latter is present only when its sales denominator is positive. Optional bootstrap fields are `effect_ci_pp: [lower, upper] | null` and `opportunity_ron_per_30_days: number | null`. An anomaly item has `id`, `date`, `dish_id`, `time_slot`, `observed_unsold_portions`, `expected_unsold_portions`, `excess_unsold_portions`, `excess_cost_ron`, `support_days`, and `interpretation`. Model evaluation includes `split`, `train_days`, `calibration_days`, `test_days`, `mae_model_pp`, and `mae_baseline_pp`. Explanation factors use the fields in the example below; `method` is `SHAP` only when SHAP was actually computed.

Member 4's `RecommendationsResult` has `status`, `items` (zero to three actions), and `limitations`. Each action has `id`, `title`, `description`, `effort` (`low`, `medium`, `high`), `evidence_pattern_ids`, and `opportunity_ron_per_30_days: number | null`. Opportunity is indicative and must not be summed across overlapping actions. With no supported patterns, return one data-collection action with empty evidence and `null` opportunity.

`POST /api/datasets/{dataset_id}/simulate` accepts JSON `{ "dish_id": "dish-01", "weekday": "Friday", "time_slot": "dinner", "requested_quantity": 20 }`. `weekday` uses English weekday names and `requested_quantity` is a non-negative integer in portions. The `SimulationResult` has `status`, `selection`, `support_days`, `basis` (`dish_weekday_slot`, `dish_slot`, or `none`), `baseline_quantity`, `unit_cost_ron`, `selected_point`, `curve`, `censored_demand`, and `limitations`. `selected_point` and every curve point have `quantity`, `waste_proxy_portions`, `shortage_lower_bound_portions`, `risk_lower_bound`, and `production_cost_change_ron_per_service`. The curve contains every integer quantity from 0 through the highest quantity returned by the simulation, including `requested_quantity` and `baseline_quantity`. `production_cost_change_ron_per_service` is `(baseline_quantity - quantity) * unit_cost_ron`; it is cost avoided, not profit. With insufficient support, `basis: "none"`, `support_days` reflecting available observations, `baseline_quantity`, `unit_cost_ron`, and `selected_point` are `null`, and `curve` is empty. The API returns HTTP `200` for this supported request with insufficient history. Member 4 owns the empirical calculation; member 1 owns the endpoint.

### Get analysis

`GET /api/datasets/{dataset_id}/analysis`

Returns the summary and computed analysis. For progressive loading, clients may instead call `GET /api/datasets/{dataset_id}/{summary|patterns|explanations|anomalies|recommendations|clusters}`. While processing, return `202`; for a completed component with insufficient support, return `200` with its state and empty result arrays.

```json
{
  "dataset_id": "ds-opaque123",
  "source": "demo",
  "is_synthetic": true,
  "status": "ready",
  "components": {
    "summary": "ready",
    "patterns": "ready",
    "model": "ready",
    "explanations": "ready",
    "anomalies": "ready",
    "recommendations": "ready",
    "clusters": "insufficient_data"
  },
  "summary": {
    "prepared_portions": 1200,
    "sold_portions": 900,
    "unsold_portions": 300,
    "unsold_cost_ron": 4500.0,
    "unsold_rate": 0.25,
    "period": {
      "from": "2026-06-01",
      "to": "2026-10-01",
      "calendar_days": 123
    }
  },
  "patterns": [
    {
      "id": "pattern-opaque1",
      "title": "Higher unsold share on Fridays",
      "factor": { "weekday": "Friday" },
      "group": { "unsold_rate": 0.3, "prepared_portions": 300 },
      "baseline": { "unsold_rate": 0.2, "prepared_portions": 900 },
      "effect_pp": 10.0,
      "relative_effect": 0.5,
      "support": { "rows": 12, "days": 12 },
      "interpretation": "Association in the uploaded data; this does not establish causation."
    }
  ],
  "anomalies": [],
  "explanations": {
    "status": "ready",
    "target": "unsold_portions / prepared_portions",
    "evaluation": {
      "split": "temporal",
      "mae_model_pp": 8.2,
      "mae_baseline_pp": 10.1,
      "test_days": 36
    },
    "factors": [
      {
        "name": "weekday=Friday",
        "mean_contribution_pp": 3.4,
        "support_rows": 45,
        "method": "SHAP"
      }
    ]
  },
  "clusters": {
    "status": "insufficient_data",
    "items": []
  },
  "limitations": [
    "Unsold portions do not prove that food was discarded.",
    "Associated factors are not proven causes."
  ]
}
```

`unsold_portions` means prepared minus sold. Do not label it as discarded food. `unsold_rate` is unsold / prepared; if total prepared is zero, it is `null`. The separate diagnostic field `(prepared - sold) / sold` may be shown only when sales are greater than zero, with its denominator clearly labeled. ML metrics are measured on held-out later dates and may show that the model is worse than baseline. SHAP values describe model contributions, not causal effects.

### Import operational observations (optional M2)

`POST /api/datasets/{dataset_id}/operations`

Imports separately validated hourly observations, menu versions, and opening hours. Hourly intervals must not overlap for a dish and date. Menu and opening-hour records include effective dates. Missing hourly observations do not imply zero waste; without them, analysis may describe the dinner service only, not claim a specific after-18:00 pattern.

```json
{
  "hourly_observations": [
    {
      "date": "2026-10-16",
      "dish_id": "soup-01",
      "interval_start": "2026-10-16T18:00:00+03:00",
      "interval_end": "2026-10-16T19:00:00+03:00",
      "prepared_qty": 12,
      "sold_qty": 7,
      "discarded_qty": 4,
      "donated_qty": 0,
      "carried_over_qty": 1
    }
  ],
  "menu_versions": [
    {
      "dish_id": "soup-01",
      "effective_from": "2026-10-01",
      "effective_to": null,
      "unit_cost_ron": 5.0,
      "unit_price_ron": 9.0
    }
  ],
  "opening_hours": [
    {
      "weekday": "Friday",
      "opens_at": "09:00",
      "closes_at": "22:00",
      "effective_from": "2026-10-01",
      "effective_to": null
    }
  ]
}
```

Destination quantities are optional, non-negative integers. Their sum may not exceed `prepared_qty - sold_qty`. Missing destination fields mean unknown, not zero. Only confirmed `discarded_qty` is counted as discarded. A successful import invalidates dependent analysis results and returns `202` with the updated dataset status.

Intervals crossing 18:00 are stored but excluded from the before/after comparison because their quantities cannot be split without inventing observations. A reported `after_18:00` pattern requires at least 12 dates and 100 prepared portions both before and after the cutoff. The committed request fixture is `docs/fixtures/analytics/operations_ready.json`.

### Cluster shape (optional M2)

The `clusters` result contains `status` and `items`. Each item has an opaque `id`, descriptive `label`, `member_dish_ids`, `member_count`, `support_days`, and `center` values in original units (for example, `unsold_rate`, `daily_variation`, `dinner_share`, `mean_prepared_portions`). Cluster labels describe similar profiles; they do not imply causes. Insufficient support returns `status: "insufficient_data"` and `items: []`.

## Surplus redistribution (M2)

All routes below are under `/api/redistribution`. The demo session is synthetic and isolated. A production pilot must authorize access by user role and resource ownership before using real addresses or contact information.

### Start demo session and list participants

`POST /api/redistribution/demo` — no body; returns `{ "session_id": "sess-opaque", "is_synthetic": true }`.

Send that ID in the `X-Demo-Session-Id` header on all subsequent `/api/redistribution` requests. The demo creation request needs no header. Missing or unknown IDs return `404` using the common error envelope. Clients retain the ID across refresh; it is never part of a URL.

`GET /api/redistribution/donors` and `GET /api/redistribution/organizations` return records available to the current demo session. A donor has an opaque `id`, `type` (`restaurant`, `supermarket`, or `household`), display name, and location. An organization has an opaque `id`, display name, accepted food categories, excluded allergens, storage/transport requirements, daily capacity in kg, opening hours, and maximum pickup radius in km.

### Create and list an offer

`POST /api/redistribution/offers`

```json
{
  "donor_id": "donor-opaque1",
  "category": "bread",
  "description": "Unsold loaves from today",
  "allergens": ["gluten"],
  "storage_requirements": ["ambient"],
  "quantity_kg": 8.0,
  "portion_count": null,
  "available_from": "2026-10-17T17:00:00+03:00",
  "pickup_deadline": "2026-10-17T19:00:00+03:00",
  "location": { "lat": 47.1585, "lon": 27.6014 }
}
```

`allergens` may be `null` if unknown; unknown required suitability data prevents automatic matching. `quantity_kg` must be greater than zero. `available_from` must precede `pickup_deadline`. Response: `201 Created` with the offer fields, an opaque `id`, `status: "available"`, and `version: 1`.

`GET /api/redistribution/offers` lists offers for the current session. Optional filters: `status`, `category`, `available_before`. Never return expired offers as available.

`GET /api/redistribution/offers/{offer_id}` returns one offer in the current session. `GET /api/redistribution/reservations?status=reserved` lists reservations, optionally filtered by status, so clients can recover reservation IDs after refresh.

### Find eligible organizations

`GET /api/redistribution/offers/{offer_id}/matches`

The response separates eligible matches from rejected candidates and includes reasons. Eligibility requires compatible category, allergens, storage/transport, capacity, distance, and pickup time. Eligible organizations sort by earliest deadline, then distance, then ID for stable ties.

```json
{
  "offer_id": "offer-opaque1",
  "eligible": [
    {
      "organization_id": "org-opaque1",
      "distance_km": 2.4,
      "capacity_available_kg": 20.0,
      "pickup_window": {
        "from": "2026-10-17T17:00:00+03:00",
        "to": "2026-10-17T18:30:00+03:00"
      },
      "reasons": ["Accepts bread", "Can store at ambient temperature", "Within pickup radius"]
    }
  ],
  "rejected": [
    { "organization_id": "org-opaque2", "reasons": ["Does not accept declared allergen: gluten"] }
  ]
}
```

No match is a successful response with empty arrays, not an error.

### Reserve and release an offer

`POST /api/redistribution/offers/{offer_id}/reservations`

```json
{
  "organization_id": "org-opaque1",
  "offer_version": 1,
  "idempotency_key": "reserve-offer-opaque1-org-opaque1"
}
```

Successful response (`201 Created`): `{ "reservation_id": "res-opaque1", "offer_id": "offer-opaque1", "organization_id": "org-opaque1", "status": "reserved", "reserved_at": "2026-10-17T16:30:00+03:00" }`.

An offer can be reserved in full by one organization. Reservation rechecks offer state, version, eligibility, deadline, and remaining daily capacity atomically. Concurrent reservation, stale version, expired offer, or insufficient capacity returns `409 CONFLICT`. Repeating the same idempotency key returns the original result; reusing it for a different request returns `409`.

`POST /api/redistribution/reservations/{reservation_id}/release` — releases a reservation before its deadline and returns the offer to `available`. Invalid transitions return `409`.

`POST /api/redistribution/offers/{offer_id}/cancel` — cancels an uncollected offer. Collected offers cannot be cancelled.

### Plan a pickup route

`POST /api/redistribution/routes/plan`

```json
{
  "organization_id": "org-opaque1",
  "reservation_ids": ["res-opaque1", "res-opaque2"],
  "vehicle_capacity_kg": 40.0,
  "departure_at": "2026-10-17T16:45:00+03:00",
  "start_location": { "lat": 47.1585, "lon": 27.6014 },
  "destination": { "lat": 47.1500, "lon": 27.6100 }
}
```

Response includes `route_id`, `is_simulated`, ordered stops (`reservation_id`, location, estimated arrival, `quantity_kg`), total kg, and excluded reservations with reasons. A route includes only reservations for the specified organization and must respect capacity, opening hours, pickup deadlines, and storage compatibility. Planning does not change reservation status. The demo route uses a local simulated travel-time matrix; it is not a live traffic estimate or a claim of globally optimal routing. Replan if a reservation is cancelled or expires. The result also includes `method`, `stops[].estimated_departure`, `stops[].load_after_kg`, `arrival_at_destination`, and `limitations`; see [the route fixture](fixtures/redistribution/route_plan.json).

### Confirm handover

`POST /api/redistribution/reservations/{reservation_id}/handover`

```json
{
  "received_quantity_kg": 7.5,
  "received_at": "2026-10-17T18:05:00+03:00",
  "idempotency_key": "handover-res-opaque1"
}
```

The receiver confirms the actual accepted amount, which must be greater than zero and no more than the offered amount. Response: `201 Created` with `status: "collected"` and the confirmed handover. Handover is idempotent. Only confirmed `received_quantity_kg` contributes to impact; offered and reserved amounts do not. A second handover with a different idempotency key returns `409`.

### Impact and surplus forecasts

`GET /api/redistribution/impact` returns totals for the selected period, with separate `offered_quantity_kg`, `reserved_quantity_kg`, and `handed_over_quantity_kg`, plus completed handover count. Impact totals are computed only from confirmed handover records and deduplicated by reservation. Emissions avoided are omitted unless documented factors and compatible units are available.

Optional `from` and `to` query parameters are inclusive `YYYY-MM-DD` dates for the impact period. They filter by the Europe/Bucharest calendar date of each offer's `pickup_deadline`; handovers use the same offer date. The response also has `is_synthetic`, `destinations[]` (`organization_id`, `handed_over_quantity_kg`, `handover_count`), and `limitations[]`. See [the impact fixture](fixtures/redistribution/impact.json).

`GET /api/redistribution/forecasts?days=7` returns per donor and time interval: `predicted_quantity_kg` (or portions, explicitly labeled), optional calibrated empirical interval, `predicted_for`, `generated_at`, `support_days`, `model`, `baseline_mae`, `model_mae`, and provenance. Forecasts use only information available before the predicted period. Insufficient history returns a donor entry with `status: "insufficient_data"`; forecasts never create offers, reservations, or route stops.

## Health and API documentation

`GET /api/health` returns service status and the installed versions of required analysis libraries. `docs/openapi.json` is generated from the backend schemas and should reflect implemented routes; this document describes the agreed human-readable contract.

## Frontend and implementation agreement

Before parallel implementation, backend and frontend owners should agree on this contract and use the examples above as mock responses. If an endpoint or field changes, update this file and the OpenAPI schema in the same change, then notify the owners of affected branches. The frontend should handle loading, empty/`insufficient_data`, validation, conflict, and server-error states explicitly. AI/ML results are returned through the backend analysis endpoints and carry support, evaluation, and limitation fields so the interface can explain what the data supports.
