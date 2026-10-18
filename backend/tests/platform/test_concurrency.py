"""Many demo users at once: queued analyses, eviction, demo reuse, no lost writes."""

import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services import orchestration
from app.services.analysis_queue import AnalysisQueue
from app.services.storage import DatasetStore

HEADER = "date,dish_id,dish_name,category,time_slot,prepared_qty,sold_qty,unit_cost_ron\n"


def csv(dish: str) -> str:
    return HEADER + f"2025-01-01,{dish},Soup,soup,lunch,10,7,5\n"


def fake_analysis(store, dataset_id):
    with store.lock(dataset_id):
        record = store.get(dataset_id)
        record["components"] = {name: "ready" for name in record["components"]}
        record["results"] = {"patterns": {"marker": dataset_id}}
        record["status"] = "ready"
        store.update(dataset_id, record)


def test_queue_runs_jobs_in_order_and_reports_positions():
    queue = AnalysisQueue(workers=1)
    release, started, order = threading.Event(), threading.Event(), []

    def job(name):
        order.append(name)
        if name == "a":
            started.set()
            release.wait(5)

    threads = [threading.Thread(target=queue.run, args=(job, "a"), kwargs={"dataset_id": "a"})]
    threads[0].start()
    assert started.wait(5)
    for name in ("b", "c"):
        thread = threading.Thread(target=queue.run, args=(job, name), kwargs={"dataset_id": name})
        thread.start()
        threads.append(thread)
        while queue.position(name) is None:
            pass
    queue.run(job, "b", dataset_id="b")  # already waiting: returns at once, not queued twice
    assert queue.position("a") == {"state": "running", "position": 0, "ahead": 0, "waiting": 2}
    assert queue.position("b") == {"state": "waiting", "position": 1, "ahead": 1, "waiting": 2}
    assert queue.position("c") == {"state": "waiting", "position": 2, "ahead": 2, "waiting": 2}
    release.set()
    for thread in threads:
        thread.join(5)
    assert order == ["a", "b", "c"]
    assert queue.position("c") is None


def test_ten_simultaneous_uploads_all_finish_one_analysis_at_a_time(tmp_path, monkeypatch):
    active, peak, lock = [0], [0], threading.Lock()

    def tracked(store, dataset_id):
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        try:
            fake_analysis(store, dataset_id)
        finally:
            with lock:
                active[0] -= 1

    monkeypatch.setattr("app.api.datasets.run_analysis", tracked)
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    with ThreadPoolExecutor(10) as pool:
        responses = list(pool.map(lambda i: client.post("/api/datasets", files={"file": ("d.csv", csv(f"d{i}"))}), range(10)))
    assert [response.status_code for response in responses] == [202] * 10
    for response in responses:
        status = client.get(f"/api/datasets/{response.json()['dataset_id']}").json()
        assert status["status"] == "ready" and status["queue"] is None
    assert peak[0] == 1


def test_full_queue_answers_busy_before_saving(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path, max_queued_analyses=1)))
    client.app.state.analysis_queue._waiting.append("ds-someone-else")
    response = client.post("/api/datasets", files={"file": ("d.csv", csv("a"))})
    assert response.status_code == 503 and response.json()["error"]["code"] == "BUSY"
    assert list(tmp_path.glob("ds-*.json")) == []


def test_oldest_finished_dataset_is_evicted_instead_of_refusing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.datasets.run_analysis", fake_analysis)
    client = TestClient(create_app(Settings(data_dir=tmp_path, max_datasets=2)))
    ids = [client.post("/api/datasets", files={"file": ("d.csv", csv(dish))}).json()["dataset_id"] for dish in "abc"]
    assert client.get(f"/api/datasets/{ids[0]}").status_code == 404
    assert all(client.get(f"/api/datasets/{dataset_id}").status_code == 200 for dataset_id in ids[1:])


def test_later_demo_imports_reuse_the_finished_demo_analysis(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr("app.api.datasets.run_analysis", lambda store, dataset_id: (calls.append(dataset_id), fake_analysis(store, dataset_id)))
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    first = client.post("/api/datasets/demo").json()
    second = client.post("/api/datasets/demo").json()
    assert calls == [first["dataset_id"]]
    assert second["status"] == "ready" and second["dataset_id"] != first["dataset_id"]
    patterns = client.get(f"/api/datasets/{second['dataset_id']}/patterns").json()
    assert patterns["status"] == "ready" and patterns["result"] == {"marker": first["dataset_id"]}


def test_analysis_superseded_by_new_operations_does_not_overwrite_them(tmp_path, monkeypatch):
    store = DatasetStore(Settings(data_dir=tmp_path))
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    monkeypatch.setattr("app.api.datasets.run_analysis", lambda *_args: None)
    dataset_id = client.post("/api/datasets", files={"file": ("d.csv", csv("a"))}).json()["dataset_id"]
    real_patterns = orchestration.analyze_patterns

    def import_during_analysis(rows, context):
        with store.lock(dataset_id):
            record = store.get(dataset_id)
            record["operations"] = {"newer": True}
            record["operations_version"] = 1
            store.update(dataset_id, record)
        return real_patterns(rows, context)

    monkeypatch.setattr(orchestration, "analyze_patterns", import_during_analysis)
    orchestration.run_analysis(store, dataset_id)
    record = store.get(dataset_id)
    assert record["operations"] == {"newer": True} and record["operations_version"] == 1
    assert "patterns" not in record.get("results", {})
