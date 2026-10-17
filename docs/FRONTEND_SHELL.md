# Shared frontend shell and API client

The platform shell lives in `frontend/src/App.jsx`. It starts a redistribution demo session on first use, stores the ID under `wastedna-demo-session-id` in `localStorage`, and passes `api`, `sessionId`, and `prefill` to the default export of `frontend/src/features/redistribution/index.jsx` at `/redistribution/*`. The route is discovered by Vite when that feature file is added. Until then, the shell shows a placeholder. The feature owns its sub-routes and styles.

`api.request(path, { method, body, headers })` returns parsed JSON or throws `ApiError` with `status`, `code`, `details`, `requestId`, and `message`. It sends JSON automatically and attaches `X-Demo-Session-Id` to redistribution calls except session creation. On a 404 `NOT_FOUND` for a redistribution call, the shell probes `/donors` to distinguish an unknown session from a missing resource. If the session is gone, it creates a new one, shows a reset notice, and rethrows the original error so the page can stop its current action and reload its data.

For fixture work, `createClient({ transport: createFixtureTransport(fixtures), getSessionId })` uses an injected transport. Fixture keys are `METHOD /api/path` and values are `{ status, body }` or a function returning that shape. Production uses `fetch` and `VITE_API_BASE_URL` (empty by default). Vite proxies `/api` to `http://localhost:8000` during development.

Shared controls in `frontend/src/components/States.jsx` are `LoadingState({ label })`, `ErrorState({ error, onRetry })`, and `EmptyState({ title, description })`. They render accessible status or alert roles.

Member 4 can navigate with `navigate('/redistribution', { state: { prefill: { category, description } } })`. Member 3 receives `prefill` as a suggestion only; the donor confirms quantity and pickup deadline.
