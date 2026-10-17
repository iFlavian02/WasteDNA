from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.api.redistribution import get_now, get_repository, router
from app.config import Settings
from app.main import create_app
from app.redistribution.demo import create_demo_session
from app.redistribution.repository import Repository
from redistribution_helpers import NOW


class Clock:
    def __init__(self, now: datetime = NOW):
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "redistribution.sqlite3"


@pytest.fixture
def repo(db_path):
    return Repository(db_path)


@pytest.fixture
def session_id(repo):
    return create_demo_session(repo, NOW)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def client(repo, clock):
    app = create_app(Settings())
    app.include_router(router, prefix="/api/redistribution")
    app.dependency_overrides[get_repository] = lambda: repo
    app.dependency_overrides[get_now] = clock
    return TestClient(app)


@pytest.fixture
def api(client):
    """Client bound to a fresh demo session, with offers indexed by scenario."""
    session = client.post("/api/redistribution/demo").json()
    headers = {"X-Demo-Session-Id": session["session_id"]}

    class Api:
        def get(self, path, **kwargs):
            return client.get("/api/redistribution" + path, headers=headers, **kwargs)

        def post(self, path, json=None):
            return client.post("/api/redistribution" + path, headers=headers, json=json)

        def offer(self, category, storage=None):
            for offer in self.get("/offers").json():
                if offer["category"] == category and (storage is None or storage in offer["storage_requirements"]):
                    return offer
            raise AssertionError(f"No demo offer {category}/{storage}")

    api = Api()
    api.headers = headers
    return api
