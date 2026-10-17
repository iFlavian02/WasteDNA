import csv
import hashlib
import importlib.util
from pathlib import Path

import pandas as pd
import pytest
from pydantic import ValidationError

from app.contracts.common import ComponentState
from app.contracts.decisions import RecommendationsResult, SimulationResult, SimulationSelection
from app.decisions import simulate

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "docs" / "fixtures" / "decisions"
MINIMAL_CSV = ROOT / "data" / "demo" / "restaurant_minimal_synthetic.csv"
REQUIRED = ["date", "dish_id", "dish_name", "category", "time_slot", "prepared_qty", "sold_qty", "unit_cost_ron"]


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_synthetic", ROOT / "scripts" / "generate_synthetic.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_minimal_rows():
    """Test-only parsing; member 1's validator is the production parser."""
    rows = pd.read_csv(MINIMAL_CSV, parse_dates=["date"])
    rows["date"] = rows["date"].dt.date
    rows["stockout_confirmed"] = rows["stockout_confirmed"].eq("true")
    return rows


@pytest.mark.parametrize(
    ("model", "name", "state"),
    [
        (RecommendationsResult, "recommendations_ready.json", ComponentState.ready),
        (RecommendationsResult, "recommendations_insufficient_data.json", ComponentState.insufficient_data),
        (SimulationResult, "simulation_ready.json", ComponentState.ready),
        (SimulationResult, "simulation_insufficient_data.json", ComponentState.insufficient_data),
    ],
)
def test_fixtures_validate(model, name, state):
    result = model.model_validate_json((FIXTURES / name).read_text(encoding="utf-8"))
    assert result.status == state


def test_simulation_ready_fixture_matches_simulator_output():
    fixture = SimulationResult.model_validate_json((FIXTURES / "simulation_ready.json").read_text(encoding="utf-8"))
    assert simulate(load_minimal_rows(), fixture.selection) == fixture


def test_recommendations_reject_more_than_three_and_evidence_when_insufficient():
    action = {"id": "a", "title": "t", "description": "d", "effort": "low", "evidence_pattern_ids": ["p"]}
    with pytest.raises(ValidationError):
        RecommendationsResult(status="ready", items=[{**action, "id": str(i)} for i in range(4)])
    with pytest.raises(ValidationError):
        RecommendationsResult(status="insufficient_data", items=[action], limitations=["no patterns"])
    with pytest.raises(ValidationError):
        RecommendationsResult(status="ready", items=[action, action])


def test_simulation_result_rejects_gaps_in_curve():
    data = (FIXTURES / "simulation_ready.json").read_text(encoding="utf-8")
    result = SimulationResult.model_validate_json(data).model_dump()
    del result["curve"][3]
    with pytest.raises(ValidationError):
        SimulationResult.model_validate(result)


def test_selection_rejects_bad_weekday_and_negative_quantity():
    with pytest.raises(ValidationError):
        SimulationSelection(dish_id="dish-01", weekday="Vineri", time_slot="dinner", requested_quantity=1)
    with pytest.raises(ValidationError):
        SimulationSelection(dish_id="dish-01", weekday="Friday", time_slot="dinner", requested_quantity=-1)


def test_minimal_generator_is_deterministic_and_matches_committed_csv(tmp_path):
    generator = load_generator()
    first = generator.write_csv(generator.generate_minimal(), tmp_path / "a.csv")
    second = generator.write_csv(generator.generate_minimal(), tmp_path / "b.csv")
    committed = MINIMAL_CSV.read_bytes().replace(b"\r\n", b"\n")  # tolerate Git autocrlf checkouts
    assert first == second == hashlib.sha256(committed).hexdigest()


@pytest.mark.parametrize("path", [MINIMAL_CSV, ROOT / "data" / "template.csv"])
def test_csv_follows_contract(path):
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames[: len(REQUIRED)] == REQUIRED
        records = list(reader)
    assert records
    keys = {(r["date"], r["dish_id"], r["time_slot"]) for r in records}
    assert len(keys) == len(records)
    per_dish = {}
    for r in records:
        pd.Timestamp(r["date"])
        assert r["time_slot"] in {"lunch", "dinner"}
        prepared, sold = int(r["prepared_qty"]), int(r["sold_qty"])
        assert 0 <= sold <= prepared
        assert float(r["unit_cost_ron"]) > 0
        assert r["stockout_confirmed"] in {"true", "false"}
        per_dish.setdefault(r["dish_id"], set()).add((r["dish_name"], r["category"], r["unit_cost_ron"]))
    assert all(len(values) == 1 for values in per_dish.values())
