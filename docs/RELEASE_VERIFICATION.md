# Step 5 release verification

Run these checks from a checkout synchronized with `main`. The platform branch
must contain the same main commit before release verification begins.

```powershell
git fetch origin main
git rev-list --left-right --count main...platform
python -m pytest -q
python scripts/export_openapi.py
git diff --exit-code -- docs/openapi.json
cd frontend
npm ci
npm run lint
npm run build
node --test src/api/*.test.js src/features/platform/*.test.js src/features/diagnostics/*.test.js src/features/decisions/*.test.js src/features/redistribution/*.test.js
```

Set `WASTEDNA_API_URL=https://wastedna.onrender.com` and run
`node --test src/features/redistribution/e2e.test.js` from `frontend` for the
opt-in live redistribution checks. The live test creates synthetic demo
sessions and records on the deployed backend.

The hosted browser walkthrough is repeatable with installed Chrome and:

```powershell
cd frontend
$env:WASTEDNA_FRONTEND_URL='https://waste-dna.vercel.app'
$env:WASTEDNA_API_URL='https://wastedna.onrender.com'
node --test src/features/platform/release.e2e.test.js
```

It imports the synthetic demo and follows every module through the actual
React shell. The test is opt-in because it creates a dataset on the live API.

For a deployed smoke check, verify:

1. `GET https://wastedna.onrender.com/api/health` returns HTTP 200 with
   `status: ok` and analysis library versions.
2. `OPTIONS /api/redistribution/demo` with `Origin:
   https://waste-dna.vercel.app`, `Access-Control-Request-Method: POST`, and
   `Access-Control-Request-Headers: content-type` returns HTTP 200 and the
   matching `Access-Control-Allow-Origin`.
3. `GET https://waste-dna.vercel.app/` and `/redistribution` return HTTP 200.
   Fetch the entry JavaScript asset named in the HTML and verify it contains
   `https://wastedna.onrender.com`.
4. In a browser, load the demo through Upload, inspect Summary, Diagnostics,
   Actions, Simulator and Report, then create and hand over a redistribution
   offer. Refresh Summary and Redistribution and confirm their state survives.
   Check the browser network panel for requests to the Render origin.

The HTTP checks verify deployment reachability, CORS and bundle configuration.
They do not execute the React pages; the browser walkthrough is a separate
release gate. Record host latency and memory from the hosting dashboard when
available.

## 2026-10-17 run

`platform` and `main` both pointed to `49e1475` after fetching `origin/main`.
`python -m pytest -q` passed 186 tests (one Starlette deprecation warning).
`npm ci` installed 67 packages; lint and build passed. The frontend test command
passed 41 tests and skipped three opt-in live tests. OpenAPI export produced no
diff. Hosted backend health returned HTTP 200 with `status: ok`; frontend home,
its entry asset and `/redistribution` returned HTTP 200. The entry asset
contained the Render origin, and CORS preflight returned HTTP 200 with the
expected frontend origin. Browser walkthrough and host memory/latency readings
remain unverified in this run.

## Follow-up finding

The Chrome walkthrough reached Upload but the hosted `POST /api/datasets/demo`
returned HTTP 500. The Docker image did not include
`data/demo/restaurant_demo_synthetic.csv` or `data/context/context_daily.csv`.
The Dockerfile now copies both files, and a platform test guards those lines.
Redeploy the corrected backend image, then rerun the hosted browser test above.
Until that deployment, the hosted demo and downstream pages are not verified.

A local Chrome run with `VITE_API_BASE_URL=http://127.0.0.1:8001` passed demo
import, Summary, Diagnostics, Actions, Simulator, Report, Redistribution,
refresh, and API origin checks. During that run, Windows briefly locked a JSON
snapshot while the UI polled it; `DatasetStore.update` now retries transient
`PermissionError` from atomic replace, with a platform regression test. A
second local Chrome run passed in about seven seconds without intervention.

Final local verification after the retry and real demo cluster check: 191 backend tests passed;
frontend lint, build, and 41 unit tests passed; the local Chrome walkthrough
passed with the report print rule and refresh check. OpenAPI export had no diff.
The hosted Chrome test still fails at demo import until Render deploys the
corrected Docker image.

## 2026-10-17 follow-up

`platform`, local `main`, and `origin/main` all point to `c711664` after a
fresh fetch. `python -m pytest -q` passed 199 tests; frontend lint and build
passed; the frontend test command passed 42 tests with four opt-in tests
skipped. OpenAPI export made no change. Deployed `GET /api/health` returned
HTTP 200 with `status: ok` and pandas, scikit-learn, and SHAP versions.

The hosted Chrome walkthrough now reaches the frontend and calls demo import,
but the backend rejects it with `Maximum active datasets reached.` The
default `MAX_DATASETS` is 3 and `DATASET_TTL_HOURS` is 24. The browser flow
through Summary, Diagnostics, Actions, Simulator, Report, and Redistribution
therefore remains unverified on the current deployment. Wait for an existing
dataset to expire or have the deployment operator clear the stored snapshots,
then rerun `release.e2e.test.js`. No hosted dataset was deleted in this run.

Operational import is a separate Step 5 extension. Member 4's requested
valid/invalid hourly payload fixtures are still absent from
`docs/fixtures/decisions/`; the agreed replacement/versioning upgrade to the
existing operations endpoint remains pending that handoff.

## Hosted walkthrough after capacity change

The deployment operator set `MAX_DATASETS=10`. The hosted Chrome test then
passed in 24 seconds, covering demo import, Summary, Diagnostics, Actions,
Simulator, Report, Redistribution, print styling, API origin, and refresh
persistence. The release verification item in Member 1's Step 5 is complete.
The operational-import extension remains open as described above.
