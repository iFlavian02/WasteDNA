# Business account: Data tab

The **Data** item in the business sidebar (formerly "Settings") opens `/upload`. It has two cards; the design follows the supplied "Analyze Restaurant Surplus" mock-up, built with the app's CSS tokens (no Tailwind).

## 1. Analyze restaurant surplus (import)

- **Template bar:** the real template columns (`date, dish_id, dish_name, category, time_slot, prepared_qty, sold_qty, unit_cost_ron`) and a download link to `GET /api/template.csv`.
- **Drop zone:** click, keyboard (it is a label for a hidden file input), or drag and drop a file. The staged file shows its name and size.
- **Checks before upload:** `csvFileProblem` rejects non-CSV, empty or oversized files before any request. The limit is 5 MB, the backend's `MAX_UPLOAD_BYTES`; the mock-up's 25 MB is not real. **Upload CSV** stays disabled until a valid file is staged.
- **Upload** sends `POST /api/datasets` (multipart field `file`). **Load demo data** sends `POST /api/datasets/demo` (180 days of synthetic data, not 30). On success the dataset becomes the selected one and a notice appears. The page **stays on the Data tab**; it no longer jumps to the summary. Errors show the API message and the first 8 row errors (422), or "File too large" (413).

## 2. Current dataset & data health

Every figure is real backend data, from `GET /api/datasets/{id}/summary` and `GET /api/datasets/{id}`. The card polls every 1.5 s until all analyses have finished.

| Tile | Value | Note |
|---|---|---|
| Status | Demo / Uploaded dataset active | "Analysing… n of 7 done" (amber, pulsing), then "7 of 7 analyses ready" |
| Records | Number of dishes | Days with records |
| Coverage | Calendar days in the period | First and last date |
| Unsold food | Unsold portions | Unsold cost in RON and the share of prepared portions |

The mock-up's "Last synced" tile was replaced by **Coverage**, because the app stores no import time. The **integrity check** lists the row rules the backend enforces on every accepted import: ISO dates, sold ≤ prepared, and unit costs > 0. With no dataset, the card says so and points to the import card. **View full summary** links to `/summary`.

## Code

| File | Role |
|---|---|
| `frontend/src/features/platform/Upload.jsx` | The page: `Upload({ api, dataset, onSelect })`, `DatasetCard`, `useDatasetSnapshot` (polling) |
| `frontend/src/features/platform/dataHealth.js` | Pure logic: `csvFileProblem`, `formatFileSize`, `analysisProgress`, `datasetHealth`, `MAX_UPLOAD_BYTES`, `TEMPLATE_COLUMNS` (tests in `dataHealth.test.js`) |
| `frontend/src/features/platform/data.css` | Styles (`dw-` prefix) and a shared `.sr-only` utility |
| `components/navigation.js`, `Sidebar.jsx` | "Data" label. `/upload` and `/summary` both highlight Data, and the active data-workspace link is highlighted too. |

The release e2e (`release.e2e.test.js`) now waits for "The demo dataset was imported" and "Demo dataset active" instead of the summary page.
