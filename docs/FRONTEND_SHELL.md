# Shared frontend shell and API client

The platform shell lives in `frontend/src/App.jsx`. It starts a redistribution demo session on first use, stores the ID under `wastedna-demo-session-id` in `localStorage`, and passes `api`, `sessionId`, and `prefill` to the default export of `frontend/src/features/redistribution/index.jsx` at `/redistribution/*`. The route is discovered by Vite when that feature file is added. Until then, the shell shows a placeholder. The feature owns its sub-routes and styles.

`api.request(path, { method, body, headers })` returns parsed JSON or throws `ApiError` with `status`, `code`, `details`, `requestId`, and `message`. It sends JSON automatically and attaches `X-Demo-Session-Id` to redistribution calls except session creation. On a 404 `NOT_FOUND` for a redistribution call, the shell probes `/donors` to distinguish an unknown session from a missing resource. If the session is gone, it creates a new one, shows a reset notice, and rethrows the original error so the page can stop its current action and reload its data.

For fixture work, `createClient({ transport: createFixtureTransport(fixtures), getSessionId })` uses an injected transport. Fixture keys are `METHOD /api/path` and values are `{ status, body }` or a function returning that shape. Production uses `fetch` and `VITE_API_BASE_URL` (empty by default). Vite proxies `/api` to `http://localhost:8000` during development.

Shared controls in `frontend/src/components/States.jsx` are `LoadingState({ label })`, `ErrorState({ error, onRetry })`, and `EmptyState({ title, description })`. They render accessible status or alert roles.

Member 4 can navigate with `navigate('/redistribution', { state: { prefill: { category, description } } })`. Member 3 receives `prefill` as a suggestion only; the donor confirms quantity and pickup deadline.

## Dataset pages and feature routes

`/upload` accepts a CSV and offers the full 180-day synthetic demo. Both imports return a dataset ID and move to `/summary`. The shell stores `{ dataset_id, is_synthetic }` under `wastedna-dataset` in localStorage, verifies it with `GET /api/datasets/{id}` after refresh, and clears it on a 404/410 response. A notice then directs the user to upload again. The summary shows totals, the synthetic label, component states, and links to the feature pages. It polls status every 1.5 seconds until every component is `ready`, `insufficient_data`, or `error`; polling stops on error or unmount. Individual feature pages poll their own component endpoints.

The shell mounts `/diagnostics/*` and `/decisions/*` with `{ api, datasetId, isSynthetic }`. The latter owns `actions`, `simulator`, and `report` sub-routes. Without a selected dataset, these routes show an upload prompt. `/redistribution/*` remains independent of the restaurant dataset and receives `{ api, sessionId, prefill }`. Global print CSS hides the shell header and notices.

The backend summary result now includes `dishes: [{ dish_id, dish_name, category, time_slots }]` for every dish, sorted by ID. `top_dishes` remains the top five by unsold cost. Demo import uses `restaurant_demo_synthetic.csv`; analysis receives date-matched rows from `context_daily.csv` when available. Missing context dates are left missing.

## Verification

Run `node --test src/api/*.test.js src/features/platform/*.test.js` from `frontend` to check the shared transport, dataset persistence and polling. The tests cover invalid CSV row errors without changing the selected dataset, replacement of the selected dataset across refresh, and a backend 503 response. Run `npm run lint` and `npm run build` before sharing frontend changes. The full frontend test command and results are recorded in the member 1 plan; the live-backend redistribution tests require `WASTEDNA_API_URL`.
