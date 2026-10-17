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

## Fixture inventory

- `patterns_ready.json` and `patterns_insufficient_data.json` validate as
  `PatternsResult`.
- `model_ready.json` and `model_insufficient_data.json` validate as
  `ModelResult`; the ready fixture contains complete evaluation, explanation,
  and anomaly fields.
- `clusters_ready.json` and `clusters_insufficient_data.json` validate as
  `ClustersResult`. The clustering calculation is a later build step.

An insufficient result contains no fabricated items or evaluation metrics and
always includes a human-readable limitation. A ready model may keep valid
evaluation and anomaly output while marking only explanations as unavailable.
