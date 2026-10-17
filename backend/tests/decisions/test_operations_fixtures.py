"""Member 4's operations fixtures follow the agreed contract and member 1's validator.

The route on `main` predates `expected_version` and `time_slot`; those two
fields are stripped before calling it, and the two new rules are checked with a
small reference check here until member 1 adds them.
"""

import importlib.util
import json
from datetime import time
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.contracts.operations import OperationsImport
from app.main import create_app
from app.services.operations import InvalidOperations, validate_for_dataset

ROOT = Path(__file__).resolve().parents[3]
OPS = ROOT / "docs" / "fixtures" / "decisions" / "operations"
DEMO_CSV = ROOT / "data" / "demo" / "restaurant_demo_synthetic.csv"
CASES = json.loads((OPS / "operations_cases.json").read_text(encoding="utf-8"))
CUTOFF = time(18, 0)


def load(name):
    return json.loads((OPS / name).read_text(encoding="utf-8"))


def legacy(payload):
    """The shape the route on `main` accepts today."""
    out = {k: v for k, v in payload.items() if k != "expected_version"}
    out["hourly_observations"] = [{k: v for k, v in o.items() if k != "time_slot"} for o in payload["hourly_observations"]]
    return out


@pytest.fixture(scope="module")
def demo_rows():
    return pd.read_csv(DEMO_CSV)


def new_contract_errors(payload, rows):
    """Reference check for the two rules the route does not enforce yet."""
    errors = []
    if not isinstance(payload.get("expected_version"), int) or payload["expected_version"] < 0:
        errors.append("expected_version")
    keys = set(zip(rows["date"], rows["dish_id"], rows["time_slot"]))
    for o in payload["hourly_observations"]:
        if o.get("time_slot") not in ("lunch", "dinner"):
            errors.append("time_slot")
        elif (o["date"], o["dish_id"], o["time_slot"]) not in keys:
            errors.append("key")
    return errors


def current_route_rejects(payload, rows):
    try:
        validate_for_dataset(OperationsImport.model_validate(legacy(payload)), rows)
    except (ValidationError, InvalidOperations):
        return True
    return False


def test_fixtures_are_regenerated_from_the_script(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("build_operations_fixtures", ROOT / "scripts" / "build_operations_fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "OUT", tmp_path)
    module.main()
    for path in tmp_path.iterdir():
        assert path.read_text(encoding="utf-8") == (OPS / path.name).read_text(encoding="utf-8"), path.name


@pytest.mark.parametrize("name", ["operations_valid.json", "operations_replacement_v1.json", "operations_replacement_stale.json"])
def test_valid_payloads_pass_current_validator_and_new_rules(name, demo_rows):
    payload = load(name)
    assert not current_route_rejects(payload, demo_rows)
    assert new_contract_errors(payload, demo_rows) == []


def test_valid_payload_covers_member_2_requirements():
    payload = load("operations_valid.json")
    sides = {"before": {"dates": set(), "prepared": 0, "sold": 0}, "after": {"dates": set(), "prepared": 0, "sold": 0}}
    crossing = 0
    friday_after = [0, 0]
    for o in payload["hourly_observations"]:
        start, end = time.fromisoformat(o["interval_start"][11:19]), time.fromisoformat(o["interval_end"][11:19])
        side = "before" if end <= CUTOFF else "after" if start >= CUTOFF else None
        if side is None:
            crossing += 1
            continue
        sides[side]["dates"].add(o["date"])
        sides[side]["prepared"] += o["prepared_qty"]
        sides[side]["sold"] += o["sold_qty"]
        if side == "after" and pd.Timestamp(o["date"]).day_name() == "Friday":
            friday_after[0] += o["prepared_qty"]
            friday_after[1] += o["sold_qty"]
    for side in sides.values():
        assert len(side["dates"]) >= 12 and side["prepared"] >= 100
    rate = {k: 1 - v["sold"] / v["prepared"] for k, v in sides.items()}
    assert rate["after"] - rate["before"] > 0.05
    assert crossing == 1
    # 30 unsold: 30% over sales, 23.08% of preparation.
    assert friday_after == [130, 100]
    assert round(30 / 100 * 100, 2) == 30.0 and round(30 / 130 * 100, 2) == 23.08
    assert len({m["unit_cost_ron"] for m in payload["menu_versions"]}) == 2
    assert {h["closes_at"] for h in payload["opening_hours"] if h["weekday"] == "Friday"} == {"22:00", "23:00"}
    destinations = [o.get("discarded_qty") for o in payload["hourly_observations"]]
    assert 0 in destinations and None in destinations and any(d and d > 0 for d in destinations)


@pytest.mark.parametrize("case", CASES["invalid"], ids=lambda c: c["file"])
def test_each_invalid_payload_breaks_its_rule(case, demo_rows):
    payload = load(case["file"])
    rejected_now = current_route_rejects(payload, demo_rows)
    assert rejected_now == case["enforced_by_route_on_main"]
    if not rejected_now:
        assert new_contract_errors(payload, demo_rows), case["file"]


def test_replacement_drops_records_instead_of_appending():
    valid, replacement = load("operations_valid.json"), load("operations_replacement_v1.json")
    assert replacement["expected_version"] == 1 and load("operations_replacement_stale.json")["expected_version"] == 0
    assert len({o["date"] for o in valid["hourly_observations"]}) == 35
    assert len({o["date"] for o in replacement["hourly_observations"]}) == 30
    assert replacement["menu_versions"][1]["unit_cost_ron"] == 3.9


def test_valid_payload_is_accepted_by_the_real_route(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post("/api/datasets/demo").json()["dataset_id"]
    response = client.post(f"/api/datasets/{dataset_id}/operations", json=legacy(load("operations_valid.json")))
    assert response.status_code == 202, response.text
    assert response.json()["hourly_observations"] == 105


def test_member_2_hourly_analysis_finds_the_after_18_pattern(demo_rows):
    from app.analytics import analyze_hourly_patterns
    from app.services.operations import build_hourly_analysis_rows

    payload = OperationsImport.model_validate(legacy(load("operations_valid.json")))
    result = analyze_hourly_patterns(build_hourly_analysis_rows(payload, demo_rows))
    assert result.status.value == "ready"
    assert [item.factor for item in result.items] == [{"dish_id": "dish-11", "time_slot": "after_18:00"}]
    assert result.items[0].effect_pp > 5
