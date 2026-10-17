from datetime import timedelta

from app.redistribution.matching import evaluate, match_offer, offer_urgency_key
from app.redistribution.schemas import EligibleMatch, Offer, Organization, RejectedMatch
from redistribution_helpers import NOW

HOURS = {day: [{"open": "08:00", "close": "21:00"}] for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")}


def make_org(org_id="org-a", **changes) -> Organization:
    fields = {
        "id": org_id,
        "name": f"Org {org_id}",
        "accepted_categories": ["bread", "prepared_meals"],
        "excluded_allergens": [],
        "storage_capabilities": ["ambient", "chilled"],
        "daily_capacity_kg": 20,
        "opening_hours": HOURS,
        "max_pickup_radius_km": 5,
        "location": {"lat": 47.1600, "lon": 27.6000},
    }
    return Organization.model_validate({**fields, **changes})


def make_offer(offer_id="offer-a", **changes) -> Offer:
    fields = {
        "id": offer_id,
        "donor_id": "donor-a",
        "category": "bread",
        "description": "",
        "allergens": ["gluten"],
        "storage_requirements": ["ambient"],
        "quantity_kg": 8.0,
        "portion_count": None,
        "available_from": NOW + timedelta(hours=7),
        "pickup_deadline": NOW + timedelta(hours=9),
        "location": {"lat": 47.1585, "lon": 27.6014},
        "status": "available",
        "version": 1,
        "created_at": NOW,
    }
    return Offer.model_validate({**fields, **changes})


def test_compatible_organization_is_eligible_with_reasons():
    result = evaluate(make_offer(), make_org(), NOW, 0)
    assert isinstance(result, EligibleMatch)
    assert result.capacity_available_kg == 20
    assert "Accepts bread" in result.reasons
    assert result.pickup_window.from_ == make_offer().available_from


def test_nearby_incompatible_charity_is_excluded_with_every_reason():
    nearby = make_org("org-near", accepted_categories=["dairy"], excluded_allergens=["gluten"], storage_capabilities=["chilled"])
    result = match_offer(make_offer(), [nearby, make_org("org-far", location={"lat": 47.17, "lon": 27.62})], NOW, {})
    assert [m.organization_id for m in result.eligible] == ["org-far"]
    (rejected,) = result.rejected
    assert rejected.organization_id == "org-near"
    assert len(rejected.reasons) == 3
    assert any("gluten" in reason for reason in rejected.reasons)


def test_unknown_allergens_block_automatic_matching():
    result = evaluate(make_offer(allergens=None), make_org(), NOW, 0)
    assert isinstance(result, RejectedMatch)
    assert result.reasons == ["Allergens unknown: automatic matching blocked until the donor declares them"]


def test_distance_capacity_and_time_rules():
    assert isinstance(evaluate(make_offer(), make_org(max_pickup_radius_km=0.1), NOW, 0), RejectedMatch)
    assert isinstance(evaluate(make_offer(), make_org(), NOW, 12.5), RejectedMatch)
    assert isinstance(evaluate(make_offer(), make_org(), NOW, 12.0), EligibleMatch)
    closed = {"saturday": [{"open": "08:00", "close": "12:00"}]}
    assert "Not open during the pickup window" in evaluate(make_offer(), make_org(opening_hours=closed), NOW, 0).reasons
    late = NOW + timedelta(hours=10)
    assert "Pickup deadline has passed" in evaluate(make_offer(), make_org(), late, 0).reasons


def test_window_starts_now_when_offer_already_available():
    offer = make_offer(available_from=NOW - timedelta(hours=1))
    assert evaluate(offer, make_org(), NOW, 0).pickup_window.from_ == NOW


def test_ranking_by_distance_then_id_is_stable():
    orgs = [make_org("org-b"), make_org("org-a"), make_org("org-c", location={"lat": 47.17, "lon": 27.61})]
    result = match_offer(make_offer(), orgs, NOW, {})
    assert [m.organization_id for m in result.eligible] == ["org-a", "org-b", "org-c"]


def test_no_match_is_an_empty_result():
    result = match_offer(make_offer(category="alcohol"), [make_org()], NOW, {})
    assert result.eligible == [] and len(result.rejected) == 1


def test_urgency_orders_offers_by_earliest_deadline():
    soon = make_offer("offer-z", pickup_deadline=NOW + timedelta(hours=8))
    later = make_offer("offer-a")
    assert sorted([later, soon], key=offer_urgency_key) == [soon, later]
