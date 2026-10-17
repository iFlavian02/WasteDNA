"""Public platform routes and the registered redistribution session boundary."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


CSV = (
    "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"
    "2025-01-01,a,Soup,soup,lunch,10,7,5\n"
    "2025-01-02,b,Main,main,dinner,30,15,10\n"
)


def test_analysis_component_and_simulator_use_uploaded_data(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path / "datasets", redistribution_db_path=tmp_path / "donations.db")))
    uploaded = client.post("/api/datasets", files={"file": ("example.csv", CSV)})
    dataset_id = uploaded.json()["dataset_id"]
    root = f"/api/datasets/{dataset_id}"
    aggregate = client.get(f"{root}/analysis")
    summary = client.get(f"{root}/summary")
    patterns = client.get(f"{root}/patterns")
    assert aggregate.status_code == 200
    assert aggregate.json()["summary"] == summary.json()["result"]
    assert aggregate.json()["components"]["patterns"] == patterns.json()["status"] == "queued"
    assert aggregate.json()["patterns"] is patterns.json()["result"] is None
    assert patterns.status_code == 202
    response = client.post(f"{root}/simulate", json={"dish_id": "a", "weekday": "Wednesday", "time_slot": "lunch", "requested_quantity": 10})
    assert response.status_code == 200
    assert response.json()["status"] == "insufficient_data"
    assert response.json()["result"]["support_days"] == 1
    assert response.json()["result"]["curve"] == []
    assert client.get(f"{root}/unrecognized").status_code == 404


def test_registered_redistribution_sessions_are_isolated_and_persistent(tmp_path):
    settings = Settings(data_dir=tmp_path / "datasets", redistribution_db_path=tmp_path / "donations.db")
    client = TestClient(create_app(settings))
    assert client.get("/api/redistribution/offers").status_code == 404
    first = client.post("/api/redistribution/demo")
    second = client.post("/api/redistribution/demo")
    assert first.status_code == second.status_code == 201
    first_header = {"X-Demo-Session-Id": first.json()["session_id"]}
    second_header = {"X-Demo-Session-Id": second.json()["session_id"]}
    offers = client.get("/api/redistribution/offers", headers=first_header)
    assert offers.status_code == 200
    assert offers.json()
    assert client.get("/api/redistribution/offers", headers=second_header).status_code == 200
    restarted = TestClient(create_app(settings))
    assert restarted.get("/api/redistribution/offers", headers=first_header).json() == offers.json()
    assert restarted.get("/api/redistribution/offers", headers={"X-Demo-Session-Id": "unknown"}).status_code == 404


def test_openapi_includes_registered_contracts(tmp_path):
    schema = create_app(Settings(data_dir=tmp_path / "datasets", redistribution_db_path=tmp_path / "donations.db")).openapi()
    for path in ("/api/datasets/{dataset_id}/analysis", "/api/datasets/{dataset_id}/simulate", "/api/redistribution/demo"):
        assert path in schema["paths"]
    assert schema["paths"]["/api/datasets/{dataset_id}/simulate"]["post"]["requestBody"]
