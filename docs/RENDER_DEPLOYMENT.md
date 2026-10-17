# Render backend deployment

The backend Dockerfile uses Python 3.12 because the pinned NumPy 2.5.4 package
requires Python 3.12 or newer. Build from the repository root with `Dockerfile`
and Docker context `.`. Leave Render's Root Directory blank. The Docker command
starts one Uvicorn worker on port 8000, and the health check path is
`/api/health`.

For a manually created Free web service, select the Free compute plan and do
not add a disk. Set `APP_MODE=normal`, `DATA_DIR=/tmp/datasets`, and
`REDISTRIBUTION_DB_PATH=/tmp/redistribution.sqlite3`. Set `CORS_ORIGINS` to
the exact frontend origin, or `http://localhost:5173` until it is hosted.
The dataset snapshots and redistribution SQLite database are temporary on
Render Free: sleep, restart, or redeploy can erase them. The paid Blueprint in
`render.yaml` mounts persistent storage at `/data`; do not create that
Blueprint for a Free deployment.

After a new Dockerfile commit is deployed, check `GET /api/health`. The response
should report `status: ok` and installed analysis package versions. Then
send an `OPTIONS /api/health` preflight with the frontend origin to verify
CORS. If the build still reports that NumPy 2.5.4 has no matching distribution,
confirm Render deployed a commit whose Dockerfile starts with
`FROM python:3.12-slim`.
