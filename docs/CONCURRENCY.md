# Many users at once (live demo)

The backend runs as one process (`uvicorn --workers 1`) on a 1-CPU Render plan. This page describes how it handles 10–15 demo users importing and browsing at the same time.

## Analysis queue

Every dataset import (CSV upload, demo import, or an operations replacement) still returns `202` immediately. The analysis then waits in a FIFO line ([analysis_queue.py](../backend/app/services/analysis_queue.py)), and only `ANALYSIS_WORKERS` (default `1`) analyses train at the same time. Ten simultaneous uploads therefore run one after another instead of all competing for the single CPU and its 2 GB of memory.

- `GET /api/datasets/{id}` returns `queue`:
  - `null` once the dataset has left the line;
  - `{"state": "running", "position": 0, "ahead": 0, "waiting": n}` while it trains;
  - `{"state": "waiting", "position": p, "ahead": a, "waiting": n}` while it waits. `position` is 1-based among waiting jobs, and `ahead` counts every analysis before it, including the running one.
- When `MAX_QUEUED_ANALYSES` (default `25`) jobs are already waiting, a new import is refused with `503` and code `BUSY` before anything is saved.
- The queue lives in memory. After a restart, interrupted analyses are marked `error` (as before) and the dataset must be imported again.

**Frontend:** `queueMessage(queue)` in [dataHealth.js](../frontend/src/features/platform/dataHealth.js) turns the field into one line ("Waiting in line: 2 analyses ahead of yours."). The Data tab card (`.dw-queue` banner) and the Summary page show it while the analysis is not settled. A `503` on import is shown as "Many people are importing right now".

## Identical datasets are analysed once

When a dataset with identical rows and no imported operations is already `ready`, a new import copies its results instead of training again (`DatasetStore.reuse_finished_twin`). This is checked at import time and again when a queued job reaches its turn. In practice, only the first "Load demo data" click trains, and everyone after that, including people who clicked at the same moment, gets results within seconds.

## Dataset limit and eviction

`MAX_DATASETS` now defaults to `40` (it was `3`, which refused the 4th demo user with `409`). When the limit is reached, the oldest dataset whose analysis has finished is evicted to make room. `409` is only returned if every stored dataset is still processing.

## Safe concurrent writes

- `DatasetStore.lock(dataset_id)` is a per-dataset lock. Hold it around any read-modify-write of a snapshot. The operations import route and the analysis worker both use it.
- The analysis worker merges only its own fields (`ANALYSIS_KEYS` in [storage.py](../backend/app/services/storage.py)) into the latest snapshot. If newer operations are imported while it runs, it stops writing, because the rerun queued by that import owns the dataset. Operations are never overwritten by a stale analysis.
- `DatasetStore.get` serves parsed snapshots from an in-memory cache keyed by file mtime and size, and returns a private copy. Polling by 15 users does not re-parse the 1.6 MB demo snapshot on every request.
- The redistribution SQLite file uses WAL journaling (`PRAGMA journal_mode = WAL`, `synchronous = NORMAL`). Writes are still serialized by `BEGIN IMMEDIATE`, so orders and reservations stay atomic.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANALYSIS_WORKERS` | `1` | Analyses training at the same time. Keep `1` on the 1-CPU plan. |
| `MAX_QUEUED_ANALYSES` | `25` | Waiting imports before new ones get `503 BUSY`. |
| `MAX_DATASETS` | `40` | Stored datasets before the oldest finished one is evicted. |

## Measured

The load test started a real server and ran 15 simulated users at once. Each user created a marketplace session, imported data (5 CSV uploads and 10 demo imports), polled status and summary every 1.5 s, browsed donors, offers, orders and impact, and placed an order.

| | Result |
| --- | --- |
| Requests | 420 |
| Errors | 0 |
| Median latency | 19 ms |
| Every user's analysis ready | within 9.5 s |
| Slowest request | `POST /api/redistribution/demo` at 9.3 s, when all 15 sessions were created in the same second (each one seeds the map for about 0.24 s under a write lock) |

Before these changes, the 4th import failed with `409`, and every import trained in parallel.

Tests are in [test_concurrency.py](../backend/tests/platform/test_concurrency.py).
