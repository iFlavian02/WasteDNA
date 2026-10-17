# Operations fixtures (member 4)

Synthetic payloads for `POST /api/datasets/{dataset_id}/operations`, written against the agreed contract in [API.md](../../../API.md#import-operational-observations-optional-m2): full replacement, required `expected_version`, and required `time_slot` on every hourly observation. Every payload refers to keys of `data/demo/restaurant_demo_synthetic.csv`, so import the demo first (`POST /api/datasets/demo`).

Regenerate with `python scripts/build_operations_fixtures.py`. The output is deterministic, and a test checks that the committed files match the script.

## Files

| File | Purpose |
|---|---|
| `operations_valid.json` | The valid snapshot (`expected_version: 0`). |
| `operations_replacement_v1.json` | A changed snapshot for version 1: the last 5 days are removed, and the cost from 2025-09-20 is 3.9 RON. |
| `operations_replacement_stale.json` | The same change, but with stale `expected_version: 0`. |
| `invalid_*.json` | Each one is the valid snapshot with exactly one rule broken. |
| `operations_cases.json` | Machine-readable manifest: the expected status and rule for each invalid file, and the versioning sequence. |

## What the valid snapshot contains

The snapshot covers dish-11 (Cartofi prăjiți) for 35 days, 2025-09-01 to 2025-10-05. That period includes 5 Fridays, and every timestamp is at `+03:00`.

- **Intervals per day:**
  - lunch, 12:00–15:00;
  - dinner, 16:00–18:00;
  - dinner, 18:00–21:00.

  The intervals touch but never overlap.
- **Cutoff crossing:** on 2025-09-10, one dinner interval runs 16:00–18:30. It is kept, but it is excluded from the before/after comparison.
- **Before and after 18:00:**
  - Before 18:00: 35 dates, 692 portions prepared.
  - After 18:00: 35 dates, 730 portions prepared.

  The unsold share is clearly higher after 18:00. Member 2's real `analyze_hourly_patterns` reports `{dish_id: dish-11, time_slot: after_18:00}` at about +10.6 pp.
- **Denominator check:** across all Fridays after 18:00, 130 portions were prepared and 100 sold. The 30 unsold are **30% over sales** but **23.08% of preparation**.
- **Menu change:** the cost goes from 3.5 to 3.8 RON. The first version ends on 2025-09-19 and the next starts on 2025-09-20. These adjacent dates are valid.
- **Opening-hours change:** from 2025-09-20, Friday and Saturday close at 23:00 instead of 22:00.
- **Destinations:**
  - Days 1–10 have every destination confirmed.
  - Days 11–20 have confirmed zeros at lunch, and only `discarded_qty` known after 18:00.
  - The remaining days are all `null`. That means unknown, never zero.
- **Hourly quantities are illustrative.** The contract does not reconcile them with the daily CSV totals.

## Invalid payloads (all should return 422)

The **Today** column says whether the route on `main` 694f3ee already rejects that payload. Those checks were run with `expected_version` and `time_slot` removed, because the current route does not accept them yet. The three "new rule" cases need the agreed contract.

| File | Broken rule | Today |
|---|---|---|
| `invalid_overlapping_intervals` | Intervals overlap: 17:30–21:00 against 16:00–18:00 | rejected |
| `invalid_destinations_exceed_unsold` | Destinations sum to 3 + 1 + 1, more than the 4 unsold | rejected |
| `invalid_menu_effective_overlap` | A menu version starts on the day the previous one ends | rejected |
| `invalid_opening_hours_effective_overlap` | The same boundary error for Friday's opening hours | rejected |
| `invalid_unknown_dish` | `dish-99` is not in the dataset | rejected |
| `invalid_naive_timestamp` | A timestamp has no UTC offset | rejected |
| `invalid_interval_outside_date` | An interval ends after midnight | rejected |
| `invalid_sold_exceeds_prepared` | `sold_qty` is greater than `prepared_qty` | rejected |
| `invalid_key_absent_from_dataset` | The key `dish-05` dinner does not exist: dish-05 is served at lunch only | **new rule** |
| `invalid_missing_time_slot` | An observation has no `time_slot` | **new rule** |
| `invalid_missing_expected_version` | `expected_version` is missing | **new rule** |

## Replacement, not append

Each import replaces the whole snapshot: all three arrays, including empty ones. Records left out of a new snapshot are deleted; they are never merged with the old ones. The versioning sequence in `operations_cases.json`:

1. Import `operations_valid.json`. Expect 202 and version 1.
2. Import the same file again (identical retry). Expect success, not 409. The version stays 1 and analysis does not rerun.
3. Import `operations_replacement_stale.json`. Expect 409, and the stored snapshot does not change.
4. Import `operations_replacement_v1.json`. Expect 202 and version 2. `GET /operations` then returns 30 days instead of 35, with a cost of 3.9 from 2025-09-20.
5. Import any invalid file. Expect 422. Version 2 and its results stay intact.

Tests: `backend/tests/decisions/test_operations_fixtures.py`.
