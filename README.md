# WasteDNA

## Backend development

Use Python 3.12. The pinned NumPy and other analysis packages require Python 3.12 or newer. From the repository root, install `backend/requirements.lock.txt`, then run:

```sh
uvicorn app.main:app --app-dir backend --reload
pytest backend/tests/platform
python scripts/export_openapi.py
```

The API starts at `/api/health`. Copy `.env.example` into your environment as needed;
`APP_MODE=normal` is the default. `APP_MODE=fixtures` only enables fixture routes
that are explicitly registered later. The health route imports pandas,
scikit-learn, and SHAP and reports their installed versions.

Dataset imports start analysis in a background task. Configure `DATA_DIR` as a
persistent writable directory and run one API worker so the JSON snapshot remains
the source of truth. `CORS_ORIGINS` is a comma-separated list of explicit frontend
origins; the default is `http://localhost:5173`. Poll `/api/datasets/{id}` until
`ready` or `partial`. A process restart during analysis cannot resume that task;
the completed summary remains available.

For a container deployment, build the root `Dockerfile`, mount persistent storage
at `/data`, set `CORS_ORIGINS` to the deployed frontend origin, and expose port
8000. Check `GET /api/health` and an `OPTIONS /api/health` preflight carrying
that origin after deployment. The image runs one worker because JSON dataset
snapshots are the current analysis store. Measured latency and memory for the
chosen host should be recorded here after deployment.

On Render, `render.yaml` defines a Docker web service, `/api/health` probe,
1 GB persistent disk, and the `/data` paths. It uses a paid 1 CPU / 2 GB plan
because analysis loads pandas, scikit-learn, and SHAP; review the plan and cost
before creating the Blueprint. Enter the frontend's exact origin for
`CORS_ORIGINS` when prompted. Automatic deploys are disabled until the service
and frontend are configured. After creation, deploy the branch that contains
the platform integration, then record the service URL, health/CORS result,
latency, and memory usage here.

The Docker image uses Python 3.12 to match `backend/requirements.lock.txt`.
If a Render build fails with `No matching distribution found for numpy==2.5.4`,
the deployed branch still has the older Python 3.11 Dockerfile; deploy a branch
containing this update. On a manually created Free service, set `DATA_DIR` and
`REDISTRIBUTION_DB_PATH` to writable temporary paths and expect their data to be
lost on sleep or restart. Free services cannot attach the persistent disk in
`render.yaml`.
See [Render deployment](docs/RENDER_DEPLOYMENT.md) for the manual Free service
settings and post-deployment checks.

Domain owners can add code under `backend/app/analytics`, `decisions`, and
`redistribution`, with their contracts in `backend/app/contracts`. See
`docs/team/README.md` for file ownership and internal function signatures.
