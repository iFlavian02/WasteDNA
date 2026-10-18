import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"
ROWS = (
    "2026-10-05,a,Soup,soup,lunch,10,6,5\n"
    "2026-10-05,b,Cake,dessert,dinner,8,8,7\n"
    "2026-10-06,a,Soup,soup,lunch,10,9,5\n"
    "2026-10-06,b,Cake,dessert,dinner,8,5,7\n"
    "2026-10-12,a,Soup,soup,dinner,10,8,5\n"
)


@pytest.fixture
def dataset(tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.datasets.run_analysis", lambda *_args: None)
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    created = client.post("/api/datasets", files={"file": ("a.csv", HEADER + ROWS, "text/csv")})
    return client, created.json()["dataset_id"]


def test_breakdown_groups_unsold_production_cost(dataset):
    client, dataset_id = dataset
    body = client.get(f"/api/datasets/{dataset_id}/breakdown").json()
    assert body["period"] == {"from": "2026-10-05", "to": "2026-10-12", "calendar_days": 8}
    assert body["totals"]["unsold_cost_ron"] == 56.0
    assert [item["time_slot"] for item in body["by_time_slot"]] == ["dinner", "lunch"]
    assert body["by_category"][0]["category"] == "dessert"


def test_breakdown_filters_and_validates_period(dataset):
    client, dataset_id = dataset
    week = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "2026-10-05", "to": "2026-10-11"}).json()
    assert week["totals"]["unsold_cost_ron"] == 46.0
    lunch = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"time_slot": "lunch"}).json()
    assert lunch["totals"]["unsold_portions"] == 5
    invalid = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "2026-10-10", "to": "2026-10-01"})
    assert invalid.status_code == 400


def test_breakdown_returns_common_not_found_envelope(dataset):
    client, _dataset_id = dataset
    response = client.get("/api/datasets/ds-00000000000000000000000000000000/breakdown")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
