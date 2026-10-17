import json
import shutil
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.redistribution import service
from app.redistribution.demo import DEMO_DIR, load_demo
from app.redistribution.repository import Repository
from app.redistribution.schemas import (
    Handover,
    ImpactResult,
    MatchesResult,
    Offer,
    OfferCreate,
    Reservation,
    RoutePlan,
    SurplusLogEntry,
)
from app.contracts.common import ErrorResponse
from app.contracts.decisions import ForecastResult

from redistribution_helpers import NOW

FIXTURES = Path(__file__).resolve().parents[3] / "docs" / "fixtures" / "redistribution"
VALID_OFFER = {
    "donor_id": "donor-restaurant-copou",
    "category": "Bread",
    "allergens": ["Gluten"],
    "storage_requirements": ["ambient"],
    "quantity_kg": 8.0,
    "available_from": "2026-10-17T17:00:00+03:00",
    "pickup_deadline": "2026-10-17T19:00:00+03:00",
    "location": {"lat": 47.1585, "lon": 27.6014},
}


@pytest.mark.parametrize(
    ("filename", "contract"),
    [
        ("offer_created.json", Offer),
        ("offer_expired.json", Offer),
        ("matches_success.json", MatchesResult),
        ("matches_no_match.json", MatchesResult),
        ("matches_unknown_allergens.json", MatchesResult),
        ("reservation_created.json", Reservation),
        ("reservation_conflict_error.json", ErrorResponse),
        ("handover_collected.json", Handover),
        ("impact.json", ImpactResult),
        ("route_plan.json", RoutePlan),
        ("surplus_log_created.json", SurplusLogEntry),
        ("forecasts_demo.json", ForecastResult),
    ],
)
def test_fixtures_validate(filename, contract):
    contract.model_validate_json((FIXTURES / filename).read_text(encoding="utf-8"))


def test_demo_covers_every_donor_type_and_scenario():
    donors, organizations, offers, _ = load_demo(NOW)
    assert {donor.type for donor in donors} == {"restaurant", "supermarket", "household"}
    assert len(organizations) >= 3
    scenarios = {item["scenario"] for item in json.loads((DEMO_DIR / "offers.json").read_text(encoding="utf-8"))}
    assert {"no_match", "unknown_allergens", "expired"} <= scenarios
    assert all("synthetic" in item.name for item in donors + organizations)


def test_offer_normalizes_tags():
    offer = OfferCreate.model_validate(VALID_OFFER)
    assert offer.category == "bread" and offer.allergens == ["gluten"]


@pytest.mark.parametrize(
    "change",
    [
        {"quantity_kg": 0},
        {"quantity_kg": -1},
        {"quantity_kg": float("nan")},
        {"pickup_deadline": "2026-10-17T16:00:00+03:00"},
        {"available_from": "2026-10-17T17:00:00"},
        {"location": {"lat": 95, "lon": 27.6}},
        {"location": {"lat": 47.1, "lon": 200}},
        {"unexpected": True},
    ],
)
def test_invalid_offers_rejected(change):
    with pytest.raises(ValidationError):
        OfferCreate.model_validate({**VALID_OFFER, **change})


def test_unknown_status_rejected():
    offer = json.loads((FIXTURES / "offer_created.json").read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        Offer.model_validate({**offer, "status": "donated"})


def test_allergens_are_required_but_may_be_null():
    without = {key: value for key, value in VALID_OFFER.items() if key != "allergens"}
    with pytest.raises(ValidationError):
        OfferCreate.model_validate(without)
    assert OfferCreate.model_validate({**without, "allergens": None}).allergens is None


def test_records_survive_restart(db_path, session_id):
    before = service.list_offers(Repository(db_path), session_id, NOW)
    reopened = Repository(db_path)
    after = service.list_offers(reopened, session_id, NOW)
    assert [offer.id for offer in after] == [offer.id for offer in before]
    assert [row["to_status"] for row in _transitions(reopened, session_id)][:1] == ["available"]


def test_sessions_are_isolated(repo, session_id):
    other = service.create_session(repo, NOW, [], [], [])
    offer_id = service.list_offers(repo, session_id, NOW)[0].id
    assert service.list_offers(repo, other, NOW) == []
    with pytest.raises(service.NotFoundError):
        service.get_offer(repo, other, offer_id, NOW)
    with pytest.raises(service.NotFoundError):
        service.list_offers(repo, "sess-unknown", NOW)


def test_analytics_cleanup_keeps_donation_records(tmp_path):
    data_dir = tmp_path / "runtime"
    (data_dir / "ds-123").mkdir(parents=True)
    repo = Repository(tmp_path / "redistribution" / "db.sqlite3")
    session_id = service.create_session(repo, NOW, *load_demo(NOW))
    shutil.rmtree(data_dir)
    assert len(service.list_offers(Repository(tmp_path / "redistribution" / "db.sqlite3"), session_id, NOW)) == 5


def test_runtime_directory_is_git_ignored(tmp_path):
    Repository(tmp_path / "store" / "db.sqlite3")
    assert (tmp_path / "store" / ".gitignore").read_text(encoding="utf-8").strip() == "*"


def _transitions(repo, session_id):
    with repo.transaction() as tx:
        return tx.transitions(session_id)
