# Dataset upload and summary

Member 1 owns the dataset routes and `app.services.{ingestion,storage,summary}`. Start the API with `uvicorn app.main:app --app-dir backend`. Runtime snapshots go to `DATA_DIR` (default `backend/.runtime`), expire after `DATASET_TTL_HOURS` (default 24), and are limited by `MAX_DATASETS` (default 3). IDs are opaque. A restart retains ready summaries; a pending analysis job is not launched by this step.

Download `GET /api/template.csv`, then upload with multipart field `file` to `POST /api/datasets`. The validator accepts UTF-8/BOM and comma or semicolon delimiters. It requires the columns and units in [API.md](API.md#upload-a-csv), unique date/dish/slot rows, consistent dish metadata, at most 5 MB, 20,000 rows, 30 dishes and 366 calendar days. Invalid rows return HTTP 422 with `error.details[].row`, `code` and `message`; oversized uploads return 413. Failed uploads create no dataset.

`POST /api/datasets/demo` imports member 4's full 180-day synthetic CSV. Both imports return HTTP 202 with `dataset_id`, `source`, `is_synthetic`, `status` and `created_at`. `GET /api/datasets/{id}` reports component states. `GET /api/datasets/{id}/summary` immediately returns `{status: "ready", result, limitations}`. `result` includes totals, period, daily observations, top five dishes by unsold cost, a complete `dishes` list with ID, name, category and time slots, and monthly equivalent cost. Unsold means prepared minus sold, not confirmed discarded food. The unsold rate is null when total prepared is zero. Missing calendar days contribute to the period denominator but are not filled with zero observations.

For example, upload rows with prepared `[10,30]`, sold `[7,15]` and unit cost `[5,10]`: summary yields 18 unsold portions, 165 RON unsold cost, and an unsold rate of 0.45. Analysis states remain `queued` until member 1's step 3 integration registers the other modules.

Verify with `pytest backend/tests/platform` from the repository root.

## Runnable HTTP handoff

Start the server from the repository root with `uvicorn app.main:app --app-dir backend`. In a second shell, save this as `example.csv`:

```csv
date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron
2025-01-01,a,Soup,soup,lunch,10,7,5
2025-01-02,b,Main,main,dinner,30,15,10
```

```sh
curl -i -F 'file=@example.csv;type=text/csv' http://localhost:8000/api/datasets
curl -i http://localhost:8000/api/datasets/DATASET_ID/summary
curl -i http://localhost:8000/api/datasets/DATASET_ID/analysis
curl -i http://localhost:8000/api/datasets/DATASET_ID/patterns
curl -i -X POST http://localhost:8000/api/datasets/demo
```

Use the `dataset_id` returned by the first call. The upload returns HTTP 202 with `source: "upload"` and `is_synthetic: false`. The summary returns HTTP 200 with the result shown below.

An upload response has this shape; the ID and timestamp vary on each run:

```json
{"dataset_id":"ds-0123456789abcdef0123456789abcdef","source":"upload","is_synthetic":false,"status":"processing","created_at":"2026-10-17T10:00:00+00:00"}
```

```json
{"status":"ready","result":{"prepared_portions":40,"sold_portions":22,"unsold_portions":18,"unsold_cost_ron":165.0,"unsold_rate":0.45,"monthly_equivalent_unsold_cost_ron":2475.0,"period":{"from":"2025-01-01","to":"2025-01-02","calendar_days":2},"daily":[{"date":"2025-01-01","prepared_portions":10,"sold_portions":7,"unsold_portions":3},{"date":"2025-01-02","prepared_portions":30,"sold_portions":15,"unsold_portions":15}],"top_dishes":[{"dish_id":"b","dish_name":"Main","unsold_portions":15,"unsold_cost_ron":150.0},{"dish_id":"a","dish_name":"Soup","unsold_portions":3,"unsold_cost_ron":15.0}]},"limitations":["Unsold portions do not prove that food was discarded."]}
```

The analysis response carries that same summary and component states. Until step 3 orchestration runs, `GET /patterns` returns HTTP 202 with `{"status":"queued","result":null,"limitations":[]}`. The simulator endpoint is available now and returns an `insufficient_data` result for this two-day sample:

```sh
curl -i -H 'Content-Type: application/json' -d '{"dish_id":"a","weekday":"Wednesday","time_slot":"lunch","requested_quantity":10}' http://localhost:8000/api/datasets/DATASET_ID/simulate
```

For an error response, change the first row to `sold_qty=11` and upload it. HTTP 422 returns the following shape; the request ID varies:

```json
{"error":{"code":"INVALID_DATA","message":"The CSV contains invalid data.","details":[{"field":"sold_qty","message":"Sold cannot exceed prepared.","code":"SOLD_EXCEEDS_PREPARED","row":2}],"request_id":"req-0123456789abcdef0123456789abcdef"}}
```

No dataset is created.

The redistribution demo is separate from analytical datasets. Create a session with `POST /api/redistribution/demo`, then send its ID as `X-Demo-Session-Id` on every subsequent redistribution request. Its SQLite path is `REDISTRIBUTION_DB_PATH`; expiration of `DATA_DIR` does not remove donation records. See the [member 3 request sequence](fixtures/redistribution/README.md#request-sequence-runnable).
