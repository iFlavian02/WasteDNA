from datetime import datetime, timedelta, timezone
import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.ingestion import InvalidDataset, parse_csv
from app.services.summary import summarize
from app.services.storage import DatasetStore
from app.services import storage

HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"
ROWS = "2025-01-01,a,Soup,soup,lunch,10,7,5\n2025-01-02,a,Soup,soup,lunch,30,15,5\n"


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def test_summary_formula_and_zero_production():
    rows = parse_csv((HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,5\n2025-01-02,b,Main,main,dinner,30,15,10\n").encode())
    result = summarize(rows)
    assert (result["unsold_portions"], result["unsold_cost_ron"], result["unsold_rate"]) == (18, 165, .45)
    assert result["dishes"] == [
        {"dish_id": "a", "dish_name": "Soup", "category": "soup", "time_slots": ["lunch"]},
        {"dish_id": "b", "dish_name": "Main", "category": "main", "time_slots": ["dinner"]},
    ]
    assert summarize(parse_csv((HEADER + "2025-01-01,a,Soup,soup,lunch,0,0,5\n").encode()))["unsold_rate"] is None


def test_snapshot_update_retries_transient_windows_replace_lock(tmp_path, monkeypatch):
    store = DatasetStore(Settings(data_dir=tmp_path))
    content = (HEADER + ROWS).encode()
    rows = parse_csv(content)
    record = store.create(content, rows, summarize(rows), "upload")
    real_replace = storage.os.replace
    attempts = []

    def transient_lock(source, target):
        attempts.append((source, target))
        if len(attempts) < 3:
            raise PermissionError("snapshot is briefly open for reading")
        return real_replace(source, target)

    monkeypatch.setattr(storage.os, "replace", transient_lock)
    record["status"] = "ready"
    store.update(record["dataset_id"], record)
    assert len(attempts) == 3
    assert store.get(record["dataset_id"])["status"] == "ready"


@pytest.mark.parametrize("content,code", [
    (HEADER + ROWS.splitlines()[0] + "\n" + ROWS.splitlines()[0] + "\n", "DUPLICATE_ROW"),
    (HEADER + "2025-01-01,a,Soup,soup,lunch,10,11,5\n", "SOLD_EXCEEDS_PREPARED"),
    (HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,nan\n", "INVALID_MONEY"),
    (HEADER + "2025-01-01,a,Soup,soup,lunch,-1,0,5\n", "INVALID_QUANTITY"),
])
def test_invalid_rows(client, content, code):
    response = client.post("/api/datasets", files={"file": ("rows.csv", content)})
    assert response.status_code == 422
    assert any(item["code"] == code and item["row"] == (3 if code == "DUPLICATE_ROW" else 2) for item in response.json()["error"]["details"])


def test_upload_status_summary_restart_and_expiry(client, tmp_path):
    response = client.post("/api/datasets", files={"file": ("rows.csv", HEADER + ROWS)})
    assert response.status_code == 202
    dataset_id = response.json()["dataset_id"]
    assert response.json()["source"] == "upload"
    assert client.get(f"/api/datasets/{dataset_id}").json()["components"]["summary"] == "ready"
    assert client.get(f"/api/datasets/{dataset_id}/summary").json()["result"]["unsold_portions"] == 18
    restarted = TestClient(create_app(Settings(data_dir=tmp_path)))
    assert restarted.get(f"/api/datasets/{dataset_id}/summary").status_code == 200
    path = tmp_path / f"{dataset_id}.json"
    record = json.loads(path.read_text(encoding="utf-8"))
    record["components"]["patterns"] = "running"
    path.write_text(json.dumps(record), encoding="utf-8")
    after_interruption = TestClient(create_app(Settings(data_dir=tmp_path)))
    assert after_interruption.get(f"/api/datasets/{dataset_id}").json()["components"]["patterns"] == "error"
    record["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    path.write_text(json.dumps(record), encoding="utf-8")
    assert restarted.get(f"/api/datasets/{dataset_id}").status_code == 404


def test_bom_semicolon_size_demo_and_template(client, tmp_path):
    csv = (HEADER + ROWS).replace(",", ";").encode("utf-8-sig")
    assert client.post("/api/datasets", files={"file": ("rows.csv", csv)}).status_code == 202
    demo = client.post("/api/datasets/demo")
    assert demo.status_code == 202
    assert demo.json()["is_synthetic"] is True
    demo_summary = client.get(f"/api/datasets/{demo.json()['dataset_id']}/summary").json()["result"]
    assert len(demo_summary["dishes"]) == 16
    assert demo_summary["period"]["calendar_days"] == 180
    assert client.get("/api/template.csv").status_code == 200
    small = TestClient(create_app(Settings(data_dir=tmp_path / "small", max_upload_bytes=20)))
    assert small.post("/api/datasets", files={"file": ("rows.csv", HEADER + ROWS)}).status_code == 413
