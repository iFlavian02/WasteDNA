# Analytics handoff

Member 2 analytics functions return strict Pydantic domain results. Member 1
adds the HTTP component envelope and owns queued, running, and error states.
Fixtures in this directory are synthetic examples and must never replace a
failed calculation in normal mode.

## Pattern invocation

Run from the repository root with `backend` on `PYTHONPATH`:

```python
import pandas as pd

from app.analytics import analyze_patterns
from app.contracts.analytics import PatternsResult

rows = pd.read_csv("validated.csv", parse_dates=["date"])
context = pd.read_csv("context.csv", parse_dates=["date"])
result: PatternsResult = analyze_patterns(rows, context)
payload = result.model_dump(mode="json")
```

`rows` uses the validated CSV columns from `docs/API.md`. `context` is unique
by date; it may be empty when no rain or university context is available. The
function does not mutate either DataFrame. Pattern IDs are deterministic for a
factor definition and are the IDs member 4 should retain in recommendation
evidence.

## Model invocation and artifact handoff

`analyze_model` uses only information available before sales: dish, category,
weekday, time slot, planned preparation, and an explicit allowlist of weather,
event, and university context fields. Sales, computed surplus, costs and
generator truth are never prediction features.

```python
from app.analytics import analyze_model, serialize_model_artifacts
from app.contracts.analytics import ModelResult

result: ModelResult = analyze_model(rows, context)
public_payload = result.model_dump(mode="json")

if result.artifacts is not None:
    private_artifact_bytes = serialize_model_artifacts(result.artifacts)
```

The result uses distinct dates for a 60/20/20 train/calibration/test split and
returns `insufficient_data` below 60 eligible dates. The encoder and imputers
are fitted on train only. The baseline is the training median waste rate per
`dish_id + time_slot`, with the global training median for unseen pairs.

The private artifact bundle contains the fitted preprocessor and estimator,
split dates, calibration/test predictions, baseline predictions, the robust
calibration threshold and bounded SHAP evidence. It is deliberately excluded
from `ModelResult.model_dump()` and the API schema. Member 1 may persist the
bytes in the private dataset cache. Deserialization uses joblib/pickle semantics
and therefore must only receive artifacts created by this application, never
uploaded or otherwise untrusted bytes. Artifact format version 1 belongs to
model pipeline `waste-rate-gbr-v1`.

SHAP uses at most 100 training background rows and 200 calibration/test rows.
If explanation computation fails, evaluation and anomalies remain valid while
`explanations.status` becomes `unavailable`; a successful computation with no
reportable factor remains `ready` with an empty list. Positive residual alerts
use a calibration median/MAD threshold with a 5 pp floor and require at least
25 RON of excess unsold cost. These alerts are not causal findings and unsold
portions are not confirmed discarded food.

The deterministic 90-day test table currently reports model MAE 3.2567 pp
versus baseline MAE 2.3333 pp and recovers one planted late anomaly. Reporting
the baseline win is intentional.

The first measurement on member 4's committed 180-day demo was recorded before
requesting any generator changes. With `context_daily.csv`, the model reports
MAE 14.9784 pp versus baseline MAE 16.2351 pp. Of the five truth-file anomalies
in the temporal test period, the detector emits 19 alerts and recovers one
exact `(date, dish_id, time_slot)` key (`2025-11-19`, `dish-11`, `dinner`). The
other 18 alerts do not match planted anomaly keys. The truth file was loaded
only after `analyze_model` returned and was used solely for this comparison.

After member 4 changed the planted multiplier to 3.0x and moved the noisy
`2025-11-12 / dish-14 / dinner` case to `dish-12`, member 2 reran the same
separated verification. The model reports MAE 15.0528 pp versus baseline MAE
16.3256 pp over 36 held-out test days. It emits 23 alerts, recovers all 5/5
planted `(date, dish_id, time_slot)` keys, and retains 18 alerts that do not
match planted truth. The truth file was again loaded only after
`analyze_model` returned and was never a model input.

## Diagnostic frontend handoff

The default export is `frontend/src/features/diagnostics/index.jsx`. Member 1
mounts it at `/diagnostics/*` with `{ api, datasetId, isSynthetic }`. It uses
the shared `api.request` transport and polls the `patterns` and `model`
component endpoints independently until each reaches `ready`,
`insufficient_data`, or `error`; polling also stops on a network error or
unmount.

The page includes comparable pattern cards, visible support, held-out
model-versus-baseline evaluation, SHAP factor rows, a residual-alert timeline,
synthetic labels, and explicit association/disposal limitations. Partial
results stay visible when the other component fails or lacks support. Pure
display helpers are covered by `logic.test.js`; the development-only
`preview/` harness mounts the page against the real backend without entering
the production build.

## Operational import and hourly patterns

`POST /api/datasets/{dataset_id}/operations` validates and stores hourly
observations, effective menu versions, and opening hours, then invalidates and
reruns the persisted analysis once. Dataset rows, matched context and
operational payload all participate in the analysis cache identity. The fitted
model artifact is serialized into the private dataset snapshot and is never
included in public API responses. The committed `operations_ready.json`
fixture contains 13 supported dates on both sides of 18:00, an effective menu
change, an opening-hours change, confirmed destination quantities, and missing
destination fields that remain unknown.

`analyze_hourly_patterns(rows)` reports an `after_18:00` association only when
both the before and after groups have at least 12 dates and 100 prepared
portions. Intervals crossing 18:00 are not split. Pattern cards keep
`unsold/prepared` separate from nullable `unsold/sales`; the fixture totals 130
prepared, 100 sold and 30 unsold after 18:00, producing 23.08% and 30%
respectively.

## Clustering invocation and profile definitions

`cluster_profiles(rows) -> ClustersResult` is the member 2 entry point for
exploratory dish profiles:

```python
from app.analytics import cluster_profiles

clusters = cluster_profiles(rows)
payload = clusters.model_dump(mode="json")
```

Each eligible dish needs at least 30 distinct dates with positive preparation,
and fitting needs at least eight eligible dishes. The four profile fields are:

- `unsold_rate`: total unsold portions divided by total prepared portions;
- `daily_variation`: population standard deviation of the dish's daily
  weighted unsold rate;
- `dinner_share`: dinner preparation divided by total preparation;
- `mean_prepared_portions`: mean total prepared portions per supported day.

The function standardizes those fields, fits deterministic KMeans candidates
for `k=2..4`, rejects partitions containing singleton clusters, and selects the
highest silhouette score (smaller `k` wins an exact tie). Centers are returned
in original units, `support_days` is the minimum member support, and IDs derive
from sorted member dish IDs rather than arbitrary KMeans labels. Constant or
unsupported data returns `insufficient_data`. On the committed 180-day demo,
the current result is ready with two non-singleton clusters (10 and 6 dishes),
minimum support 180 days, and silhouette 0.411.

## Fixture inventory

- `patterns_ready.json` and `patterns_insufficient_data.json` validate as
  `PatternsResult`.
- `model_ready.json` and `model_insufficient_data.json` validate as
  `ModelResult`; the ready fixture contains complete evaluation, explanation,
  and anomaly fields.
- `clusters_ready.json` and `clusters_insufficient_data.json` validate as
  `ClustersResult` and drive the diagnostic clustering UI tests.
- `operations_ready.json` validates as `OperationsImport` and produces a
  supported `after_18:00` diagnostic on the full demo dataset.

An insufficient result contains no fabricated items or evaluation metrics and
always includes a human-readable limitation. A ready model may keep valid
evaluation and anomaly output while marking only explanations as unavailable.
