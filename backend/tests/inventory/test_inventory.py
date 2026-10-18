from collections import defaultdict
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api import inventory as inventory_api
from app.config import Settings
from app.inventory.generator import generate_days, to_csv
from app.inventory.service import INITIAL_DAYS, MAX_DAYS
from app.main import create_app
from app.services.ingestion import parse_csv
from app.services.storage import DatasetStore
from app.services.summary import summarize

TODAY = date(2026, 10, 18)
HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(inventory_api, "local_today", lambda: TODAY)
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def unsold_rate(rows):
    prepared = sum(row["prepared_qty"] for row in rows)
    return (prepared - sum(row["sold_qty"] for row in rows)) / prepared


def test_generator_is_deterministic_per_day_and_extends_without_rewriting_history():
    first = generate_days(5, date(2026, 1, 1), 60)
    longer = generate_days(5, date(2026, 1, 1), 90)
    assert longer[:len(first)] == first
    assert generate_days(6, date(2026, 1, 1), 60) != first
    dates = {row["date"] for row in longer}
    assert "2026-01-01" not in dates, "closed on New Year's Day"
    weekend_menu = [row for row in longer if row["dish_id"] == "dish-07" and date.fromisoformat(row["date"]).weekday() >= 5]
    assert weekend_menu == [], "the daily menu is served on weekdays only"
    assert all(0 <= row["sold_qty"] <= row["prepared_qty"] for row in longer)


def test_generated_history_looks_like_a_small_restaurant_and_parses():
    rows = generate_days(11, date(2026, 3, 1), INITIAL_DAYS)
    summary = summarize(parse_csv(to_csv(rows)))
    days = summary["period"]["calendar_days"]
    assert 150 <= summary["prepared_portions"] / days <= 320
    assert 0.08 <= summary["unsold_rate"] <= 0.25
    assert 4000 <= summary["monthly_equivalent_unsold_cost_ron"] <= 16000
    by_weekday = defaultdict(list)
    for row in rows:
        by_weekday[date.fromisoformat(row["date"]).weekday()].append(row)
    others = [row for weekday, items in by_weekday.items() if weekday not in (0, 4) for row in items]
    assert unsold_rate(by_weekday[0]) > unsold_rate(others) + 0.05, "Mondays are planned like a normal day"
    desserts_dinner = [row for row in rows if row["category"] == "dessert" and row["time_slot"] == "dinner"]
    assert unsold_rate(desserts_dinner) > unsold_rate(rows) + 0.05


def test_connect_creates_once_then_reuses_the_connected_dataset(client):
    created = client.post("/api/inventory/connect")
    assert created.status_code == 202
    body = created.json()
    assert body["source"] == "inventory" and body["is_synthetic"] is True
    assert body["history_to"] == "2026-10-17" and body["history_days"] == INITIAL_DAYS
    assert body["simulated_days"] == 0 and body["max_days"] == MAX_DAYS

    again = client.post("/api/inventory/connect")
    assert again.status_code == 200 and again.json()["dataset_id"] == body["dataset_id"]

    status = client.get(f"/api/datasets/{body['dataset_id']}").json()
    assert status["source"] == "inventory" and status["is_synthetic"] is True
    assert set(status["components"].values()) <= {"ready", "insufficient_data", "error"}
    summary = client.get(f"/api/datasets/{body['dataset_id']}/summary").json()["result"]
    assert summary["period"] == {"from": "2026-07-20", "to": "2026-10-17", "calendar_days": INITIAL_DAYS}


def test_simulate_appends_days_keeps_history_and_reruns_analysis(client):
    dataset_id = client.post("/api/inventory/connect").json()["dataset_id"]
    before = client.get(f"/api/datasets/{dataset_id}/summary").json()["result"]

    response = client.post(f"/api/inventory/{dataset_id}/simulate", json={"days": 30})
    assert response.status_code == 202
    assert response.json()["history_days"] == 120 and response.json()["simulated_days"] == 30
    assert response.json()["history_to"] == "2026-11-16"

    after = client.get(f"/api/datasets/{dataset_id}/summary").json()["result"]
    assert after["period"]["calendar_days"] == 120
    assert after["daily"][:len(before["daily"])] == before["daily"]
    assert after["prepared_portions"] > before["prepared_portions"]
    status = client.get(f"/api/datasets/{dataset_id}").json()
    assert status["components"]["patterns"] in {"ready", "insufficient_data"}
    assert client.get(f"/api/inventory/{dataset_id}").json()["history_days"] == 120


def test_simulate_is_refused_while_analysis_runs_and_for_uploads(client, tmp_path):
    dataset_id = client.post("/api/inventory/connect").json()["dataset_id"]
    store = DatasetStore(Settings(data_dir=tmp_path))
    record = store.get(dataset_id)
    record["components"]["model"] = "running"
    store.update(dataset_id, record)
    running = client.post(f"/api/inventory/{dataset_id}/simulate", json={"days": 30})
    assert running.status_code == 409 and "still running" in running.json()["error"]["message"]

    upload = client.post("/api/datasets", files={"file": ("a.csv", HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,5\n", "text/csv")})
    refused = client.post(f"/api/inventory/{upload.json()['dataset_id']}/simulate", json={"days": 30})
    assert refused.status_code == 409
    assert client.post("/api/inventory/ds-00000000000000000000000000000000/simulate").status_code == 404
    assert client.post(f"/api/inventory/{dataset_id}/simulate", json={"days": 0}).status_code == 400


def test_history_is_capped_at_one_year_and_reset_starts_over(client):
    dataset_id = client.post("/api/inventory/connect").json()["dataset_id"]
    for _ in range(3):
        assert client.post(f"/api/inventory/{dataset_id}/simulate", json={"days": 90}).status_code == 202
    capped = client.post(f"/api/inventory/{dataset_id}/simulate", json={"days": 30})
    assert capped.status_code == 422 and str(MAX_DAYS) in capped.json()["error"]["message"]

    reset = client.post(f"/api/inventory/{dataset_id}/reset")
    assert reset.status_code == 202
    assert reset.json()["dataset_id"] == dataset_id and reset.json()["history_days"] == INITIAL_DAYS
    assert client.get(f"/api/datasets/{dataset_id}/summary").json()["result"]["period"]["calendar_days"] == INITIAL_DAYS
