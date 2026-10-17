# Shared contract decisions

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
| 2 | `backend/app/contracts/analytics.py`; ready and insufficient fixtures in `docs/fixtures/analytics/`; `analyze_patterns` and `analyze_model` according to the team plan | 1 aggregation; 4 recommendations |
| 3 | Redistribution schema and fixtures in owned paths; router export; full demo session request sequence | 1 registration and client |
| 4 | Small valid `data/template.csv` and demo CSV; `backend/app/contracts/decisions.py`; ready and insufficient fixtures in `docs/fixtures/decisions/` | 1 validator, API, and orchestration |

If a domain model cannot express the fields in `API.md`, the owner should propose one coordinated edit to that document before consumers implement the change.
