"""Build the synthetic operations fixtures for `POST /api/datasets/{id}/operations`.

Writes valid, invalid, replacement and versioning-sequence payloads to
`docs/fixtures/decisions/operations/`, following the agreed contract in
`docs/API.md` (full replacement, required `expected_version` and `time_slot`).
All payloads refer to keys of `data/demo/restaurant_demo_synthetic.csv`.
Hourly quantities are illustrative: the contract does not reconcile them with
the daily CSV totals. Deterministic, no randomness.

    python scripts/build_operations_fixtures.py
"""

import copy
import json
from datetime import date, timedelta
from pathlib import Path

OUT = Path("docs/fixtures/decisions/operations")
DISH = "dish-11"  # Cartofi prăjiți: has lunch and dinner every day of the demo
START, DAYS = date(2025, 9, 1), 35  # Monday 1 Sep to Sunday 5 Oct, 5 Fridays, all at +03:00
CROSSING_DAY = date(2025, 9, 10)  # one interval 16:00-18:30 crosses the cutoff
CHANGE_DAY = date(2025, 9, 20)  # menu price and weekend closing time change here
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _obs(day, slot, start, end, prepared, sold, discarded=None, donated=None, carried=None):
    return {
        "date": day.isoformat(),
        "dish_id": DISH,
        "time_slot": slot,
        "interval_start": f"{day}T{start}:00+03:00",
        "interval_end": f"{day}T{end}:00+03:00",
        "prepared_qty": prepared,
        "sold_qty": sold,
        "discarded_qty": discarded,
        "donated_qty": donated,
        "carried_over_qty": carried,
    }


def valid_payload() -> dict:
    observations = []
    for offset in range(DAYS):
        day = START + timedelta(days=offset)
        friday = day.weekday() == 4
        late_prepared, late_sold = (26, 20) if friday else (20, 16)
        if offset < 10:  # all destinations confirmed
            lunch_dest, late_dest = (0, 1, 0), (2, 1, 1)
        elif offset < 20:  # lunch confirmed zero, late only discarded known
            lunch_dest, late_dest = (0, 0, 0), (3, None, None)
        else:  # destinations unknown: missing, never zero
            lunch_dest, late_dest = (None, None, None), (None, None, None)
        observations.append(_obs(day, "lunch", "12:00", "15:00", 12, 11, *lunch_dest))
        if day == CROSSING_DAY:
            observations.append(_obs(day, "dinner", "16:00", "18:30", 14, 12))
            observations.append(_obs(day, "dinner", "18:30", "21:00", late_prepared, late_sold, *late_dest))
        else:
            observations.append(_obs(day, "dinner", "16:00", "18:00", 8, 7))
            observations.append(_obs(day, "dinner", "18:00", "21:00", late_prepared, late_sold, *late_dest))
    before_change = (CHANGE_DAY - timedelta(days=1)).isoformat()
    opening = []
    for weekday in WEEKDAYS:
        weekend = weekday in ("Friday", "Saturday")
        opening.append({"weekday": weekday, "opens_at": "11:00", "closes_at": "22:00", "effective_from": START.isoformat(), "effective_to": before_change})
        opening.append({"weekday": weekday, "opens_at": "11:00", "closes_at": "23:00" if weekend else "22:00", "effective_from": CHANGE_DAY.isoformat(), "effective_to": None})
    return {
        "expected_version": 0,
        "hourly_observations": observations,
        "menu_versions": [
            {"dish_id": DISH, "effective_from": START.isoformat(), "effective_to": before_change, "unit_cost_ron": 3.5, "unit_price_ron": 11.0},
            {"dish_id": DISH, "effective_from": CHANGE_DAY.isoformat(), "effective_to": None, "unit_cost_ron": 3.8, "unit_price_ron": 12.0},
        ],
        "opening_hours": opening,
    }


def _late(payload, day):
    return next(o for o in payload["hourly_observations"] if o["date"] == day and o["interval_start"].endswith("T18:00:00+03:00"))


def invalid_cases(valid: dict) -> list[tuple[str, str, bool, dict]]:
    """(name, rule, payload). Each breaks exactly one rule."""
    cases = []

    def case(name, rule, mutate):
        payload = copy.deepcopy(valid)
        mutate(payload)
        cases.append((name, rule, payload))

    case("invalid_overlapping_intervals", "Intervals for the same dish and date must not overlap (they may touch).",
         lambda p: _late(p, "2025-09-02").update(interval_start="2025-09-02T17:30:00+03:00"))
    case("invalid_destinations_exceed_unsold", "discarded + donated + carried_over must not exceed prepared - sold (here 3 + 1 + 1 > 4).",
         lambda p: _late(p, "2025-09-01").update(discarded_qty=3, donated_qty=1, carried_over_qty=1))
    case("invalid_menu_effective_overlap", "Menu versions of one dish must not overlap; the second starts on the day the first ends.",
         lambda p: p["menu_versions"][1].update(effective_from="2025-09-19"))
    case("invalid_opening_hours_effective_overlap", "Opening-hours periods of one weekday must not overlap.",
         lambda p: next(h for h in p["opening_hours"] if h["weekday"] == "Friday" and h["effective_to"] is None).update(effective_from="2025-09-19"))
    case("invalid_unknown_dish", "dish_id must exist in the dataset.",
         lambda p: p["hourly_observations"][0].update(dish_id="dish-99"))
    case("invalid_key_absent_from_dataset", "(date, dish_id, time_slot) must exist in the CSV: dish-05 is served at lunch only.",
         lambda p: p["hourly_observations"].append({**_obs(date(2025, 9, 3), "dinner", "18:00", "20:00", 10, 8), "dish_id": "dish-05"}))
    case("invalid_missing_time_slot", "Every hourly observation must include time_slot (lunch or dinner).",
         lambda p: p["hourly_observations"][0].pop("time_slot"))
    case("invalid_missing_expected_version", "expected_version is required.",
         lambda p: p.pop("expected_version"))
    case("invalid_naive_timestamp", "Timestamps must include an explicit UTC offset.",
         lambda p: p["hourly_observations"][0].update(interval_start="2025-09-01T12:00:00"))
    case("invalid_interval_outside_date", "Intervals must stay inside the observation date.",
         lambda p: _late(p, "2025-09-03").update(interval_end="2025-09-04T00:30:00+03:00"))
    case("invalid_sold_exceeds_prepared", "sold_qty must not exceed prepared_qty.",
         lambda p: p["hourly_observations"][0].update(sold_qty=13))
    return cases


def replacement_payload(valid: dict, expected_version: int) -> dict:
    """A changed snapshot: the last 5 days are dropped and the new price is corrected.
    Under full replacement the dropped days disappear; nothing is appended."""
    payload = copy.deepcopy(valid)
    last_kept = (START + timedelta(days=DAYS - 6)).isoformat()
    payload["hourly_observations"] = [o for o in payload["hourly_observations"] if o["date"] <= last_kept]
    payload["menu_versions"][1]["unit_cost_ron"] = 3.9
    payload["expected_version"] = expected_version
    return payload


def _write(name, payload):
    (OUT / f"{name}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    valid = valid_payload()
    _write("operations_valid", valid)
    _write("operations_replacement_v1", replacement_payload(valid, 1))
    _write("operations_replacement_stale", replacement_payload(valid, 0))
    cases = invalid_cases(valid)
    for name, _, payload in cases:
        _write(name, payload)
    _write(
        "operations_cases",
        {
            "dataset": "data/demo/restaurant_demo_synthetic.csv (POST /api/datasets/demo)",
            "invalid": [
                {"file": f"{name}.json", "expected_status": 422, "rule": rule}
                for name, rule, _ in cases
            ],
            "versioning_sequence": [
                {"step": 1, "file": "operations_valid.json", "expected_status": 202, "operations_version_after": 1, "note": "First import expects version 0."},
                {"step": 2, "file": "operations_valid.json", "expected_status": "success, not 409", "operations_version_after": 1, "note": "Identical retry: returns the current version and does not rerun analysis."},
                {"step": 3, "file": "operations_replacement_stale.json", "expected_status": 409, "operations_version_after": 1, "note": "Changed payload with a stale expected_version; stored snapshot unchanged."},
                {"step": 4, "file": "operations_replacement_v1.json", "expected_status": 202, "operations_version_after": 2, "note": "Full replacement: GET /operations then returns 30 days, not 35, and cost 3.9 from 2025-09-20."},
                {"step": 5, "file": "invalid_overlapping_intervals.json", "expected_status": 422, "operations_version_after": 2, "note": "All-or-nothing: an invalid import leaves version 2 and its results intact (expected_version in the file is irrelevant)."},
            ],
        },
    )
    print(f"wrote {len(cases) + 4} files to {OUT}")


if __name__ == "__main__":
    main()
