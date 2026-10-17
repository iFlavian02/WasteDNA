"""Real integration: the router as registered by the platform's create_app()
(no test-only include_router), using the platform's own settings and error
handlers. Only the database path and the clock are injected."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.contracts.common import ErrorResponse
from app.main import create_app


def test_router_is_registered_by_the_platform_app(tmp_path):
    db = tmp_path / "db" / "redistribution.sqlite3"
    app = create_app(Settings(redistribution_db_path=db))
    client = TestClient(app)

    session = client.post("/api/redistribution/demo")
    assert session.status_code == 201 and session.json()["is_synthetic"] is True
    headers = {"X-Demo-Session-Id": session.json()["session_id"]}

    offers = client.get("/api/redistribution/offers", headers=headers).json()
    assert db.exists(), "router must use the platform's redistribution_db_path setting"
    bread = next(o for o in offers if o["category"] == "bread")
    matches = client.get(f"/api/redistribution/offers/{bread['id']}/matches", headers=headers).json()
    assert matches["eligible"]

    body = {"organization_id": matches["eligible"][0]["organization_id"], "offer_version": bread["version"], "idempotency_key": "real-1"}
    first = client.post(f"/api/redistribution/offers/{bread['id']}/reservations", headers=headers, json=body)
    assert first.status_code == 201
    assert client.post(f"/api/redistribution/offers/{bread['id']}/reservations", headers=headers, json=body).json() == first.json()
    reservations = client.get("/api/redistribution/reservations?status=reserved", headers=headers).json()
    assert [r["reservation_id"] for r in reservations] == [first.json()["reservation_id"]]
    assert client.get(f"/api/redistribution/offers/{bread['id']}", headers=headers).json()["status"] == "reserved"


def test_missing_session_uses_platform_error_envelope(tmp_path):
    client = TestClient(create_app(Settings(redistribution_db_path=tmp_path / "r.sqlite3")))
    response = client.get("/api/redistribution/offers")
    assert response.status_code == 404
    assert ErrorResponse.model_validate(response.json()).error.code == "NOT_FOUND"


def test_cors_preflight_allows_session_header(tmp_path):
    client = TestClient(create_app(Settings(redistribution_db_path=tmp_path / "r.sqlite3")))
    response = client.options(
        "/api/redistribution/offers",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-demo-session-id"},
    )
    assert response.status_code == 200
    assert "x-demo-session-id" in response.headers["access-control-allow-headers"].lower()
