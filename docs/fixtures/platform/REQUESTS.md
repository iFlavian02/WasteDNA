# Step 4 frontend handoff requests from member 1

Written 2026-10-17 on `platform`, after updating from `main` `df59256`. These requests cover only the feature files owned by the other members. Member 1 owns `frontend/src/App.jsx`, dataset state, shared controls, the API client, global styles, upload and summary pages, and route registration. Reply in your plan's Progress section or in this file with the export path, props, verification result, and commit.

The shared client and controls are documented in [FRONTEND_SHELL.md](../../FRONTEND_SHELL.md): `api.request(path, options)`, `LoadingState`, `ErrorState`, and `EmptyState`. Use real API responses or explicit fixture transport in tests. The shell will keep the selected dataset ID across refresh, clear it on 404/410, and pass it to dataset feature pages. Member 1 will publish the dataset props and route before asking members 2 and 4 to integrate their pages.

## Member 2: diagnostic page (your step 3)

Please add a default export at `frontend/src/features/diagnostics/index.jsx` for `/diagnostics/*`. The shell will pass `{ api, datasetId, isSynthetic }`; keep any sub-routes and feature CSS inside your directory. Use `GET /api/datasets/{datasetId}/analysis` or the component endpoints documented in [API.md](../../API.md).

The page needs pattern cards with support and baseline, an anomaly timeline, model evaluation, and explanation views. Show queued/running, partial, insufficient-data and error states without treating missing results as zeros. Label synthetic data and display association limitations. Verify with your fixtures and an uploaded dataset, including refresh without retraining. Run frontend lint and build. Tell member 1 when the default export is committed so the route can be registered.

## Member 3: redistribution page (your step 3)

Please add a default export at `frontend/src/features/redistribution/index.jsx` for `/redistribution/*`. The route already discovers this file and passes `{ api, sessionId, prefill }`; `prefill` is optional `{ category, description }` navigation state. Keep sub-routes and feature CSS inside your directory. The shell/client already create and persist the demo session, attach `X-Demo-Session-Id`, and show a notice when a lost session is reset.

The page needs manual offer creation/list, explained matches, reservation/release, and confirmed handover. Require the donor to confirm actual quantity and pickup deadline even when a prefill is present. Handle empty results, expired offers, 409 conflicts, and refresh. Verify all donor types and a no-match case with the real backend; run frontend lint and build. Confirm the accepted prefill category mapping with member 4 as requested in [their requests](../decisions/REQUESTS.md). Tell member 1 when the default export is committed so the placeholder can be replaced.

**Reply from member 3 (2026-10-17):** the default export is at `frontend/src/features/redistribution/index.jsx` and uses exactly `{ api, sessionId, prefill }`. Its sub-routes and `.rd`-scoped CSS stay inside the feature. It is verified with lint, build, unit tests, an end-to-end run against the real backend (all donor types plus no-match) and a browser walkthrough, including refresh. The placeholder can be replaced: the route already discovers the file. The commit is on `redistrib`; details are in `docs/fixtures/redistribution/README.md` § Frontend.

## Member 4: actions, simulator and report (your step 3)

Please add a default export at `frontend/src/features/decisions/index.jsx` for `/decisions/*`. The shell will pass `{ api, datasetId, isSynthetic }`; keep `actions`, `simulator`, and `report` sub-routes and feature CSS inside your directory. If no dataset is selected, the shell will send the user to upload or demo import. Member 1 will supply the global print rule requested in [your requests](../decisions/REQUESTS.md).

Use the real recommendations and simulation endpoints. Fetch a simulation curve once per selection and move the slider locally. The report should print clearly and preserve units, support, limitations, and synthetic labels. For donation prefill, navigate to `/redistribution` with `{ state: { prefill: { category, description } } }`; do not publish an offer or infer kilograms from portions. Verify missing-model and insufficient-data states, selection changes, print layout, and refresh. Run frontend lint and build. Tell member 1 when the default export is committed so the route can be registered.

## Integration order

1. Member 1 publishes dataset state, upload/summary pages, and the `/diagnostics/*` and `/decisions/*` route contracts. This answers member 4's [dataset-state request](../decisions/REQUESTS.md).
2. Members 2, 3 and 4 commit their default exports and verification. Each export can be integrated separately; no member needs to wait for every page.
3. Member 1 registers each available page, tests the upload → analysis → actions and offer → handover flows through the actual frontend, and runs `npm run lint` and `npm run build` from `frontend`.

## Reply and requests from member 4 (2026-10-17)

- **Reply to "Member 4: actions, simulator and report":**
  - **Export:** the default export is committed at `frontend/src/features/decisions/index.jsx`. Props: `{ api, datasetId, isSynthetic }`.
  - **Sub-routes:** `actions`, `simulator` and `report`; links are built from the mount path.
  - **Verification:** checked against the real backend through a dev-only harness (`frontend/src/features/decisions/preview/`, not in the build). Covered: actions, the simulator handoff, the slider with no request per move (about 50 ms), insufficient history, missing-model report, and the prefill navigation.
  - **Commands:** `node --test src/features/decisions/logic.test.js` gives 11 passed; `npm run lint` and `npm run build` pass.
  - **Not verified yet:** the real print preview inside the shell.
  - Usage is in `docs/DECISIONS_MODULE.md` § Frontend.
- **Requests** (full detail in [member 4's requests](../decisions/REQUESTS.md), sections 1.1, 1.2, 1.3 and 1.5):
  1. Register `/decisions/*` and an "Actions" nav link.
  2. Add the `@media print` rule that hides `.app-header` and `.notice`.
  3. Decide on polling.
  4. Add a full `dishes` list to the summary result.
  5. Switch the demo import to `restaurant_demo_synthetic.csv`, and pass `context_daily.csv` to the analysis.
  6. Align the forecast field names in `API.md`.

## Step 4 integration reply (2026-10-17)

The shell now registers `/diagnostics/*`, `/decisions/*` and `/redistribution/*`. The first two receive `{ api, datasetId, isSynthetic }`; redistribution receives `{ api, sessionId, prefill }`. Upload and demo import set a persisted dataset ID. Refresh validates the ID, and a missing or expired dataset redirects to `/upload`. The summary polls dataset status every 1.5 seconds; feature pages continue polling their own component endpoints and stop on terminal state, error or unmount. Global print CSS hides `.app-header` and `.notice`. The summary response now includes every dish in `dishes` as requested. Demo import uses the full 180-day file and analysis receives date-matched context. Usage is documented in [FRONTEND_SHELL.md](../../FRONTEND_SHELL.md).
