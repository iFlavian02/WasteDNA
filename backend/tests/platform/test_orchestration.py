"""Analysis results belong to their upload and survive reloads and failures."""

from fastapi.testclient import TestClient
import pandas as pd

from app.config import Settings
from app.main import create_app
from app.services import orchestration

HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"


def test_independent_results_are_cached_per_dataset(tmp_path, monkeypatch):
    calls = []
    real_patterns = orchestration.analyze_patterns

    def tracked(rows, context):
        calls.append(rows.iloc[0]["dish_id"])
        return real_patterns(rows, context)

    monkeypatch.setattr(orchestration, "analyze_patterns", tracked)
    settings = Settings(data_dir=tmp_path / "datasets")
    client = TestClient(create_app(settings))
    ids = []
    for dish in ("a", "b"):
        csv = HEADER + f"2025-01-01,{dish},Soup,soup,lunch,10,7,5\n"
        ids.append(client.post("/api/datasets", files={"file": ("data.csv", csv)}).json()["dataset_id"])
    assert calls == ["a", "b"]
    restarted = TestClient(create_app(settings))
    for dataset_id in ids:
        base = f"/api/datasets/{dataset_id}"
        assert restarted.get(base + "/patterns").json()["status"] == "insufficient_data"
        assert restarted.get(base + "/recommendations").json()["result"]["items"][0]["evidence_pattern_ids"] == []
        assert restarted.get(base + "/model").json()["result"]["evaluation"] is None
        assert restarted.get(base + "/analysis").json()["summary"]["prepared_portions"] == 10
    assert calls == ["a", "b"]


def test_failed_analysis_preserves_summary_and_other_components(tmp_path, monkeypatch):
    def broken(rows, context):
        raise RuntimeError("private training error")

    monkeypatch.setattr(orchestration, "analyze_model", broken)
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post("/api/datasets", files={"file": ("data.csv", HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,5\n")}).json()["dataset_id"]
    base = f"/api/datasets/{dataset_id}"
    assert client.get(base + "/summary").json()["result"]["unsold_portions"] == 3
    assert client.get(base + "/patterns").json()["status"] == "insufficient_data"
    failed = client.get(base + "/model").json()
    assert failed["status"] == "error" and failed["result"] is None
    assert "private training error" not in str(failed)
    assert client.get(base + "/analysis").json()["status"] == "partial"


def test_health_and_cors_preflight(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path, cors_origins=["https://wastedna.example"])))
    assert client.get("/api/health").json()["status"] == "ok"
    response = client.options("/api/health", headers={
        "Origin": "https://wastedna.example",
        "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://wastedna.example"


def test_clusters_use_owner_calculation_and_persist_after_restart(tmp_path, monkeypatch):
    from app.contracts.analytics import ClustersResult

    calls = []

    def clustered(rows):
        calls.append(rows.iloc[0]["dish_id"])
        return ClustersResult(status="insufficient_data", limitations=["One dish is insufficient for clustering."])

    monkeypatch.setattr(orchestration, "cluster_profiles", clustered)
    settings = Settings(data_dir=tmp_path)
    client = TestClient(create_app(settings))
    dataset_id = client.post("/api/datasets", files={"file": ("data.csv", HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,5\n")}).json()["dataset_id"]
    assert calls == ["a"]
    restarted = TestClient(create_app(settings))
    cluster = restarted.get(f"/api/datasets/{dataset_id}/clusters").json()
    assert cluster["status"] == "insufficient_data"
    assert cluster["result"]["limitations"] == ["One dish is insufficient for clustering."]
    assert restarted.get(f"/api/datasets/{dataset_id}/analysis").json()["clusters"] == cluster["result"]
    assert calls == ["a"]


def test_cluster_failure_does_not_erase_other_analysis(tmp_path, monkeypatch):
    def broken(_rows):
        raise RuntimeError("private cluster error")

    monkeypatch.setattr(orchestration, "cluster_profiles", broken)
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post("/api/datasets", files={"file": ("data.csv", HEADER + "2025-01-01,a,Soup,soup,lunch,10,7,5\n")}).json()["dataset_id"]
    base = f"/api/datasets/{dataset_id}"
    assert client.get(base + "/summary").json()["status"] == "ready"
    assert client.get(base + "/patterns").json()["status"] == "insufficient_data"
    cluster = client.get(base + "/clusters").json()
    assert cluster["status"] == "error" and cluster["result"] is None
    assert "private cluster error" not in str(cluster)
    assert client.get(base + "/analysis").json()["status"] == "partial"


def test_dockerfile_ships_demo_and_context_for_import():
    from pathlib import Path

    dockerfile = (Path(__file__).resolve().parents[3] / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY data/demo/restaurant_demo_synthetic.csv data/demo/restaurant_demo_synthetic.csv" in dockerfile
    assert "COPY data/context/context_daily.csv data/context/context_daily.csv" in dockerfile


def test_full_demo_exposes_real_cluster_groups(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    dataset_id = client.post("/api/datasets/demo").json()["dataset_id"]
    base = f"/api/datasets/{dataset_id}"
    envelope = client.get(base + "/clusters").json()
    assert envelope["status"] == "ready"
    assert len(envelope["result"]["items"]) >= 2
    assert client.get(base + "/analysis").json()["clusters"] == envelope["result"]


def test_analysis_identity_changes_with_context_and_operations():
    record = {"rows": "[]"}
    dry = pd.DataFrame({"date": [pd.Timestamp("2025-01-01")], "rain_bin": ["dry"]})
    rain = pd.DataFrame({"date": [pd.Timestamp("2025-01-01")], "rain_bin": ["rain"]})

    base = orchestration._analysis_identity(record, dry)
    assert orchestration._analysis_identity(record, rain) != base
    record["operations"] = {"hourly_observations": []}
    assert orchestration._analysis_identity(record, dry) != base
