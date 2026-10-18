import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"
ROWS = (
    "2026-10-05,a,Soup,soup,lunch,10,6,5\n"     # Monday: 4 unsold, 20 RON
    "2026-10-05,b,Cake,dessert,dinner,8,8,7\n"  # Monday: none
    "2026-10-06,a,Soup,soup,lunch,10,9,5\n"     # Tuesday: 1 unsold, 5 RON
    "2026-10-06,b,Cake,dessert,dinner,8,5,7\n"  # Tuesday: 3 unsold, 21 RON
    "2026-10-12,a,Soup,soup,dinner,10,8,5\n"    # next Monday: 2 unsold, 10 RON
)


@pytest.fixture
def dataset(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    created = client.post("/api/datasets", files={"file": ("a.csv", HEADER + ROWS, "text/csv")})
    return client, created.json()["dataset_id"]


def test_whole_history_by_default(dataset):
    client, dataset_id = dataset
    body = client.get(f"/api/datasets/{dataset_id}/breakdown").json()
    assert body["period"] == {"from": "2026-10-05", "to": "2026-10-12", "calendar_days": 8}
    assert body["available"] == {"from": "2026-10-05", "to": "2026-10-12"}
    assert body["options"] == {"categories": ["dessert", "soup"], "time_slots": ["lunch", "dinner"]}
    assert body["totals"] == {"prepared_portions": 46, "sold_portions": 36, "unsold_portions": 10, "unsold_cost_ron": 56.0, "unsold_rate": 10 / 46, "days_with_data": 3}
    assert body["daily"][0] == {"date": "2026-10-05", "prepared_portions": 18, "sold_portions": 14, "unsold_portions": 4, "unsold_cost_ron": 20.0}
    monday = body["by_weekday"][0]
    assert monday == {"weekday": "Monday", "days": 2, "unsold_portions_per_day": 3.0, "unsold_cost_ron_per_day": 15.0}
    assert body["by_weekday"][2]["days"] == 0 and body["by_weekday"][2]["unsold_cost_ron_per_day"] is None
    assert [item["time_slot"] for item in body["by_time_slot"]] == ["dinner", "lunch"]
    assert body["top_dishes"][0]["dish_id"] == "a" and body["top_dishes"][0]["unsold_cost_ron"] == 35.0
    assert body["latest_batches"] == [{"date": "2026-10-12", "dish_id": "a", "dish_name": "Soup", "category": "soup", "time_slot": "dinner", "unsold_portions": 2, "unsold_cost_ron": 10.0}]


def test_period_category_and_service_filters(dataset):
    client, dataset_id = dataset
    week = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "2026-10-05", "to": "2026-10-11"}).json()
    assert week["totals"]["unsold_cost_ron"] == 46.0 and week["period"]["calendar_days"] == 7
    dessert = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"category": "dessert"}).json()
    assert dessert["totals"]["unsold_portions"] == 3 and dessert["filters"]["category"] == "dessert"
    lunch = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"time_slot": "lunch"}).json()
    assert lunch["totals"]["unsold_portions"] == 5
    assert lunch["options"]["categories"] == ["dessert", "soup"], "options always describe the whole dataset"
    empty = client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "2027-01-01", "to": "2027-01-31"}).json()
    assert empty["totals"]["unsold_rate"] is None and empty["daily"] == [] and empty["latest_batches"] == []


def test_invalid_requests(dataset):
    client, dataset_id = dataset
    assert client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "2026-10-10", "to": "2026-10-01"}).status_code == 400
    assert client.get(f"/api/datasets/{dataset_id}/breakdown", params={"time_slot": "brunch"}).status_code == 400
    assert client.get(f"/api/datasets/{dataset_id}/breakdown", params={"from": "10/05/2026"}).status_code == 400
    missing = client.get("/api/datasets/ds-00000000000000000000000000000000/breakdown")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "NOT_FOUND"
