"""Operational observations are strict, persisted, and drive hourly diagnostics."""

from datetime import date, timedelta
from base64 import b64decode
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.analytics.model import deserialize_model_artifacts


HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"
ROOT = Path(__file__).resolve().parents[3]


def _restaurant_csv() -> str:
    return HEADER + "".join(
        f"{date(2025, 1, 1) + timedelta(days=offset)},dish-01,Soup,soup,dinner,20,16,5\n"
        for offset in range(13)
    )


def _payload() -> dict:
    after_sales = [7] * 4 + [8] * 9
    observations = []
    for offset, sold_after in enumerate(after_sales):
        day = date(2025, 1, 1) + timedelta(days=offset)
        observations.extend(
            [
                {
                    "date": day.isoformat(),
                    "dish_id": "dish-01",
                    "interval_start": f"{day}T16:00:00+02:00",
                    "interval_end": f"{day}T17:00:00+02:00",
                    "prepared_qty": 10,
                    "sold_qty": 9,
                    "discarded_qty": None,
                    "donated_qty": None,
                    "carried_over_qty": None,
                },
                {
                    "date": day.isoformat(),
                    "dish_id": "dish-01",
                    "interval_start": f"{day}T18:00:00+02:00",
                    "interval_end": f"{day}T19:00:00+02:00",
                    "prepared_qty": 10,
                    "sold_qty": sold_after,
                    "discarded_qty": 1 if offset == 0 else None,
                    "donated_qty": 1 if offset == 0 else None,
                    "carried_over_qty": None,
                },
            ]
        )
    return {
        "hourly_observations": observations,
        "menu_versions": [
            {
                "dish_id": "dish-01",
                "effective_from": "2025-01-01",
                "effective_to": "2025-01-06",
                "unit_cost_ron": 5,
                "unit_price_ron": 9,
            },
            {
                "dish_id": "dish-01",
                "effective_from": "2025-01-07",
                "effective_to": None,
                "unit_cost_ron": 5.5,
                "unit_price_ron": 10,
            },
        ],
        "opening_hours": [
            {
                "weekday": "Friday",
                "opens_at": "09:00",
                "closes_at": "21:00",
                "effective_from": "2025-01-01",
                "effective_to": "2025-01-09",
            },
            {
                "weekday": "Friday",
                "opens_at": "09:00",
                "closes_at": "22:00",
                "effective_from": "2025-01-10",
                "effective_to": None,
            },
        ],
    }


def test_operations_import_persists_and_adds_supported_after_18_pattern(tmp_path):
    settings = Settings(data_dir=tmp_path)
    client = TestClient(create_app(settings))
    dataset_id = client.post(
        "/api/datasets", files={"file": ("data.csv", _restaurant_csv())}
    ).json()["dataset_id"]
    stored_path = tmp_path / f"{dataset_id}.json"
    identity_before = json.loads(stored_path.read_text(encoding="utf-8"))["cache_identity"]

    response = client.post(f"/api/datasets/{dataset_id}/operations", json=_payload())

    assert response.status_code == 202
    assert response.json()["hourly_observations"] == 26
    patterns = client.get(f"/api/datasets/{dataset_id}/patterns").json()["result"]
    hourly = next(
        item
        for item in patterns["items"]
        if item["factor"] == {"dish_id": "dish-01", "time_slot": "after_18:00"}
    )
    assert hourly["group"]["prepared_portions"] == 130
    assert hourly["group"]["unsold_rate"] == pytest.approx(30 / 130)
    assert hourly["group"]["unsold_over_sales"] == 0.3
    stored = json.loads(stored_path.read_text(encoding="utf-8"))
    assert stored["cache_identity"] != identity_before
    restarted = TestClient(create_app(settings))
    assert restarted.get(f"/api/datasets/{dataset_id}/patterns").json()["result"] == patterns


def test_operations_reject_overlap_impossible_destinations_and_unknown_dish(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post(
        "/api/datasets", files={"file": ("data.csv", _restaurant_csv())}
    ).json()["dataset_id"]
    endpoint = f"/api/datasets/{dataset_id}/operations"

    overlapping = _payload()
    overlapping["hourly_observations"][1]["interval_start"] = "2025-01-01T16:30:00+02:00"
    assert client.post(endpoint, json=overlapping).status_code == 400

    impossible = _payload()
    impossible["hourly_observations"][0]["discarded_qty"] = 2
    assert client.post(endpoint, json=impossible).status_code == 400

    unknown = _payload()
    unknown["hourly_observations"][0]["dish_id"] = "missing"
    response = client.post(endpoint, json=unknown)
    assert response.status_code == 422
    assert "Unknown dish IDs" in response.json()["error"]["message"]


def test_committed_operational_fixture_runs_against_the_full_demo(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post("/api/datasets/demo").json()["dataset_id"]
    payload = json.loads(
        (ROOT / "docs/fixtures/analytics/operations_ready.json").read_text(
            encoding="utf-8"
        )
    )

    response = client.post(f"/api/datasets/{dataset_id}/operations", json=payload)

    assert response.status_code == 202
    patterns = client.get(f"/api/datasets/{dataset_id}/patterns").json()["result"]
    assert any(item["factor"].get("time_slot") == "after_18:00" for item in patterns["items"])
    assert client.get(f"/api/datasets/{dataset_id}/clusters").json()["status"] == "ready"
    stored = json.loads((tmp_path / f"{dataset_id}.json").read_text(encoding="utf-8"))
    artifact = deserialize_model_artifacts(b64decode(stored["private_model_artifact"]))
    assert artifact.pipeline_version
    assert "private_model_artifact" not in client.get(f"/api/datasets/{dataset_id}/analysis").text
