from fastapi.testclient import TestClient

from app.config import Settings
from app.contracts.common import ComponentState, ErrorResponse
from app.main import create_app


def test_health_imports_analysis_dependencies():
    response = TestClient(create_app(Settings())).get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert all(response.json()["versions"].get(name) for name in ("pandas", "scikit-learn", "shap"))


def test_common_contract_and_missing_route():
    assert set(ComponentState) == {"queued", "running", "ready", "insufficient_data", "error"}
    response = TestClient(create_app(Settings())).get("/missing")
    assert response.status_code == 404
    assert ErrorResponse.model_validate(response.json()).error.code == "NOT_FOUND"


def test_fixture_mode_is_opt_in(monkeypatch):
    from app.config import get_settings

    monkeypatch.delenv("APP_MODE", raising=False)
    get_settings.cache_clear()
    assert get_settings().app_mode == "normal"
    monkeypatch.setenv("APP_MODE", "fixtures")
    get_settings.cache_clear()
    assert get_settings().app_mode == "fixtures"
    get_settings.cache_clear()
