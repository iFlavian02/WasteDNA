"""Checks for the context snapshot and the full synthetic demo dataset."""

import hashlib
import importlib.util
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

from app.analytics import analyze_model, analyze_patterns
from app.decisions import build_recommendations

ROOT = Path(__file__).resolve().parents[3]
CONTEXT_DIR = ROOT / "data" / "context"
DEMO_CSV = ROOT / "data" / "demo" / "restaurant_demo_synthetic.csv"
TRUTH = ROOT / "data" / "demo" / "truth" / "restaurant_demo_truth.json"
DEMAND = ROOT / "data" / "demo" / "truth" / "restaurant_demo_latent_demand.csv"


def load_script(name):
    sys.path.insert(0, str(ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def context():
    return load_script("prepare_dataset").load_context(CONTEXT_DIR)


@pytest.fixture(scope="module")
def demo():
    return pd.read_csv(DEMO_CSV, parse_dates=["date"])


def normalized_sha(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def test_context_matches_committed_file_and_has_unique_dates(context):
    committed = pd.read_csv(CONTEXT_DIR / "context_daily.csv")
    assert len(context) == len(committed) == 180
    assert context["date"].is_unique
    assert list(context["date"].astype(str)) == list(committed["date"])


def test_missing_weather_stays_missing():
    prepare = load_script("prepare_dataset")
    weather = pd.DataFrame({"date": ["2025-06-01", "2025-06-02"], "temperature_mean_c": [20.0, None], "precipitation_mm": [3.0, None]})
    calendar = {"university": [{"from": "2025-06-01", "to": "2025-06-01", "state": "term", "period": "exams"}], "events": []}
    context = prepare.build_context(weather, calendar)
    assert context.loc[0, "rain_bin"] == "rain"
    assert pd.isna(context.loc[1, "rain_bin"])  # not an invented dry day
    assert pd.isna(context.loc[1, "university_state"])  # outside a verified interval


def test_calendar_uses_verified_sources(context):
    calendar = json.loads((CONTEXT_DIR / "calendar_iasi.json").read_text(encoding="utf-8"))
    sources = {s["id"]: s for s in json.loads((CONTEXT_DIR / "sources.json").read_text(encoding="utf-8"))["sources"]}
    for entry in calendar["university"] + calendar["events"]:
        source = sources[entry["source_id"]]
        assert source["url"].startswith("https://") and source["accessed_at"]
    assert sources["weather_iasi"]["is_synthetic"] is False
    labels = dict(zip(context["date"].astype(str), context["university_state"]))
    assert labels["2025-06-29"] == "term" and labels["2025-06-30"] == "break"
    assert labels["2025-09-28"] == "break" and labels["2025-09-29"] == "term"
    events = context.set_index(context["date"].astype(str))["event_id"]
    assert events.notna().sum() == 8 and events["2025-10-14"] == "parascheva_pilgrimage_2025"


def test_demo_generation_is_deterministic(context, tmp_path):
    generator = load_script("generate_synthetic")
    paths = {"csv": tmp_path / "a.csv", "demand": tmp_path / "d.csv", "truth": tmp_path / "t.json"}
    first = generator.write_demo(context, paths)
    second = generator.write_demo(context, {**paths, "csv": tmp_path / "b.csv"})
    assert first == second == normalized_sha(DEMO_CSV)


def test_demo_rows_are_valid(demo):
    expected_dates = {date(2025, 6, 1) + timedelta(days=i) for i in range(180)}
    assert set(demo["date"].dt.date) == expected_dates
    assert demo["dish_id"].nunique() == 16
    assert set(demo["time_slot"]) == {"lunch", "dinner"}
    assert not demo.duplicated(["date", "dish_id", "time_slot"]).any()
    assert (demo["sold_qty"] >= 0).all() and (demo["sold_qty"] <= demo["prepared_qty"]).all()
    assert (demo["unit_cost_ron"] > 0).all()
    assert demo.groupby("dish_id")[["dish_name", "category", "unit_cost_ron"]].nunique().eq(1).all().all()


def test_truth_is_separate_from_model_inputs(demo):
    assert "latent_demand" not in demo.columns
    demand = pd.read_csv(DEMAND)
    assert len(demand) == len(demo)
    truth = json.loads(TRUTH.read_text(encoding="utf-8"))
    assert truth["is_synthetic"] is True and truth["seed"] == 42
    assert all(a["date"] >= truth["test_period_from"] for a in truth["anomalies"])
    assert len(truth["anomalies"]) == 5
    assert all(a["prepared_multiplier"] == 3.0 for a in truth["anomalies"])


def test_member_2_model_recovers_every_planted_anomaly(context):
    """Member 2's real residual detector finds all five planted batches.
    Truth is read only after the model has run and is never model input."""
    from app.services.ingestion import parse_csv

    rows = parse_csv(DEMO_CSV.read_bytes())
    result = analyze_model(rows, context.assign(date=pd.to_datetime(context["date"])))
    alerts = {(a.date.isoformat(), a.dish_id, a.time_slot) for a in result.anomalies}
    truth = json.loads(TRUTH.read_text(encoding="utf-8"))
    planted = {(a["date"], a["dish_id"], a["time_slot"]) for a in truth["anomalies"]}
    assert planted <= alerts


def test_context_join_keeps_row_count(demo, context):
    ctx = context.assign(date=pd.to_datetime(context["date"]))
    joined = demo.merge(ctx, on="date", how="left", validate="many_to_one")
    assert len(joined) == len(demo)
    assert joined["rain_bin"].notna().all()


@pytest.mark.parametrize(
    "factor",
    [
        {"category": "main", "weekday": "Friday"},
        {"category": "dessert", "rain_bin": "rain"},
        {"dish_id": "dish-05", "university_state": "break"},
    ],
)
def test_planted_effects_have_enough_support(demo, context, factor):
    ctx = context.assign(date=pd.to_datetime(context["date"]))
    frame = demo.merge(ctx, on="date").assign(weekday=lambda f: f["date"].dt.day_name())
    (base_key, base_value), (ctx_key, ctx_value) = factor.items()
    same_base = frame[frame[base_key] == base_value]
    group = same_base[same_base[ctx_key] == ctx_value]
    baseline = same_base[same_base[ctx_key] != ctx_value]
    for part in (group, baseline):
        assert part["date"].nunique() >= 12 and part["prepared_qty"].sum() >= 100


def test_member_2_patterns_and_recommendations_recover_planted_effects(demo):
    context = pd.read_csv(CONTEXT_DIR / "context_daily.csv", parse_dates=["date"])
    patterns = analyze_patterns(demo, context)
    planted = [effect["factor"] for effect in json.loads(TRUTH.read_text(encoding="utf-8"))["effects"]]
    top = [item.factor for item in patterns.items[:4]]
    assert all(factor in top for factor in planted)
    actions = build_recommendations(patterns)
    evidence = {item.id: item.factor for item in patterns.items}
    assert sorted(map(str, planted)) == sorted(str(evidence[a.evidence_pattern_ids[0]]) for a in actions.items)
