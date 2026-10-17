# Shared contract decisions

## Instructions for member agents

1. Read [the coordination plan](team/README.md), [the API contract](API.md), and your own `docs/team/MEMBER_*` plan. The foundation and these decisions are commits `fa42985` and `ec92c30` on `platform`; integrate them through the team's shared branch, then update your own checkout. Do not switch branches in a checkout another member is using.
2. Work only in the paths assigned to your member in `docs/team/README.md`. The package directories and test/fixture directories already exist. `backend/app/contracts/common.py` supplies `ComponentState`, `ApiError`, `ErrorDetail`, and `ErrorResponse`; import those instead of creating another common state or error type.
3. Implement your owned Pydantic result models with the public fields specified in `API.md`. For domain calculations, return the owner's result model. The platform wraps it for HTTP with `{status, result, limitations}`. `status` and `limitations` in the wrapper are copied from the domain result, not independently invented. Do not put a transport `queued`, `running`, or `error` result in a calculation function; those states belong to the platform.
4. Put small synthetic JSON examples in your owned `docs/fixtures/<domain>/` directory. Name each by result and state, such as `patterns_ready.json` and `patterns_insufficient_data.json`. Each file must be a **domain result object**, not the HTTP wrapper. Validate both files with `YourResult.model_validate_json(path.read_text(encoding="utf-8"))` in your own tests. Include a small invocation example in your handoff showing the function arguments and returned model.
5. Run `pytest backend/tests/<your-domain>` from the repository root. Share the commit, fixture paths, tests run, and any proposed contract change with member 1. Member 1 then registers routes, validates aggregate/component responses, and regenerates `docs/openapi.json` with `python scripts/export_openapi.py`. Planned routes are not in OpenAPI until implemented.

The current foundation is runnable with `uvicorn app.main:app --app-dir backend --reload` and `pytest backend/tests/platform` from the repository root after installing `backend/requirements.lock.txt`. Only `/api/health` is registered today. The empty domain packages and fixture directories are handoff locations, not completed implementations. `APP_MODE=fixtures` is an opt-in setting; it does not currently register fixture routes.

## 2026-10-17 — Foundation handoff

- The shared backend foundation is commit `fa42985` on `platform`. Domain owners should base their implementation on that commit after it reaches the shared integration branch. The team coordination plan's named Python function signatures remain authoritative.
- API component transport uses `status`, `result`, and `limitations`; domain results remain Pydantic models in their owner's module. The platform owns route, cache, and execution states. Domain owners own their ready and insufficient-data examples. See [API.md](API.md) for exact fields.
- The validated restaurant DataFrame uses the CSV column names in `API.md`; `date` is a parsed date, quantities are integer portions, and costs/prices are RON per portion. Context is unique by date. A missing context observation stays missing.
- Demo redistribution clients send `X-Demo-Session-Id: <session_id>` on every request after `POST /api/redistribution/demo`. The creation request has no session header. A missing or unknown session returns `404` with the common error envelope. Session IDs are opaque and must not be put in URLs or logs. Member 3 owns the repository and router; member 1 registers the router and configures CORS to allow the header.
- Fixtures are examples and test inputs only. `APP_MODE=normal` never substitutes a fixture for a failed upload or unavailable calculation. `APP_MODE=fixtures` may expose explicitly marked fixture routes during development.
- `docs/openapi.json` records implemented routes, not planned ones. Member 1 regenerates it as each owner's schemas and router land.

## Owner handoffs

| Owner | Deliver first | Consumer |
|---|---|
| 2 | `backend/app/contracts/analytics.py`; `patterns_ready.json`, `patterns_insufficient_data.json`, `model_ready.json`, `model_insufficient_data.json` in `docs/fixtures/analytics/`; `analyze_patterns` and `analyze_model` according to the team plan | 1 aggregation; 4 recommendations |
| 3 | Redistribution schema and synthetic success/no-match/conflict fixtures in owned paths; router export from `backend/app/api/redistribution.py`; full demo session request sequence using `X-Demo-Session-Id` | 1 registration and client |
| 4 | Valid `data/template.csv` and small synthetic demo CSV; `backend/app/contracts/decisions.py`; `recommendations_ready.json`, `recommendations_insufficient_data.json`, `simulation_ready.json`, `simulation_insufficient_data.json` in `docs/fixtures/decisions/` | 1 validator, API, and orchestration |

If a domain model cannot express the fields in `API.md`, the owner should propose one coordinated edit to that document before consumers implement the change.

The fixture filenames above are the shared handoff convention. Member 2's `clusters` and member 4's `forecast` are later work; they should add equivalent ready/insufficient fixtures when those features start. Member 3 owns its own request/response shapes as described in `API.md` and may organize fixtures by flow rather than by a single result model.

## Operational import decision — 2026-10-17

The user chose full replacement and explicit `time_slot` for Stage 8.1 operational data. `POST /api/datasets/{dataset_id}/operations` takes a complete snapshot containing all three arrays and `expected_version`; the first expected version is `0`. Changed imports increment `operations_version`, stale changed imports return `409`, and identical retries return the current version. Validation is atomic. Hourly observations reference an existing CSV `(date, dish_id, time_slot)` key and use offset-aware interval timestamps. Member 4 supplies valid and invalid synthetic fixtures against this contract; member 1 implements validation and versioned storage; member 2 consumes validated observations for hourly diagnostics. See [API.md](API.md#import-operational-observations-optional-m2) for the payload and null semantics.
