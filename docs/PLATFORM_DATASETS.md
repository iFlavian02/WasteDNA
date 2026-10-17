# Dataset upload and summary

Member 1 owns the dataset routes and `app.services.{ingestion,storage,summary}`. Start the API with `uvicorn app.main:app --app-dir backend`. Runtime snapshots go to `DATA_DIR` (default `backend/.runtime`), expire after `DATASET_TTL_HOURS` (default 24), and are limited by `MAX_DATASETS` (default 3). IDs are opaque. A restart retains ready summaries; a pending analysis job is not launched by this step.

Download `GET /api/template.csv`, then upload with multipart field `file` to `POST /api/datasets`. The validator accepts UTF-8/BOM and comma or semicolon delimiters. It requires the columns and units in [API.md](API.md#upload-a-csv), unique date/dish/slot rows, consistent dish metadata, at most 5 MB, 20,000 rows, 30 dishes and 366 calendar days. Invalid rows return HTTP 422 with `error.details[].row`, `code` and `message`; oversized uploads return 413. Failed uploads create no dataset.

`POST /api/datasets/demo` imports member 4's currently available small synthetic CSV. Both imports return HTTP 202 with `dataset_id`, `source`, `is_synthetic`, `status` and `created_at`. `GET /api/datasets/{id}` reports component states. `GET /api/datasets/{id}/summary` immediately returns `{status: "ready", result, limitations}`. `result` includes totals, period, daily observations, top five dishes by unsold cost, and monthly equivalent cost. Unsold means prepared minus sold, not confirmed discarded food. The unsold rate is null when total prepared is zero. Missing calendar days contribute to the period denominator but are not filled with zero observations.

For example, upload rows with prepared `[10,30]`, sold `[7,15]` and unit cost `[5,10]`: summary yields 18 unsold portions, 165 RON unsold cost, and an unsold rate of 0.45. Analysis states remain `queued` until member 1's step 3 integration registers the other modules.

Verify with `pytest backend/tests/platform` from the repository root.
