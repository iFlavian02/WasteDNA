from datetime import timedelta

import pytest

from app.redistribution import service
from app.redistribution.routing import Candidate, plan_route
from app.redistribution.schemas import RoutePlanRequest
from redistribution_helpers import NOW
from test_matching import make_offer, make_org

START = {"lat": 47.1585, "lon": 27.6014}


def request(ids, capacity=40.0, departure=NOW + timedelta(hours=7)):
    return RoutePlanRequest(
        organization_id="org-a", reservation_ids=ids, vehicle_capacity_kg=capacity,
        departure_at=departure, start_location=START, destination={"lat": 47.16, "lon": 27.60},
    )


def candidates():
    return [
        Candidate("res-1", make_offer("offer-1", location={"lat": 47.17, "lon": 27.57})),
        Candidate("res-2", make_offer("offer-2", location={"lat": 47.15, "lon": 27.62}, quantity_kg=10)),
        Candidate("res-3", make_offer("offer-3", location={"lat": 47.165, "lon": 27.59}, quantity_kg=5)),
    ]


def test_three_pickups_each_once_and_deterministic():
    first = plan_route(request(["res-1", "res-2", "res-3"]), make_org(), candidates(), [])
    second = plan_route(request(["res-1", "res-2", "res-3"]), make_org(), list(reversed(candidates())), [])
    assert first == second
    ids = [stop.reservation_id for stop in first.stops]
    assert sorted(ids) == ["res-1", "res-2", "res-3"] and first.excluded == []
    assert first.total_quantity_kg == 23 and first.is_simulated
    assert first.stops[-1].load_after_kg == 23
    arrivals = [stop.estimated_arrival for stop in first.stops]
    assert arrivals == sorted(arrivals) and first.arrival_at_destination > arrivals[-1]


def test_insufficient_vehicle_excludes_with_reason():
    plan = plan_route(request(["res-1", "res-2", "res-3"], capacity=12), make_org(), candidates(), [])
    assert plan.total_quantity_kg <= 12
    assert any("capacity" in reason for item in plan.excluded for reason in item.reasons)


def test_impossible_deadline():
    late = Candidate("res-9", make_offer("offer-9", pickup_deadline=NOW + timedelta(hours=7, minutes=5), location={"lat": 47.25, "lon": 27.7}))
    plan = plan_route(request(["res-9"]), make_org(), [late], [])
    assert plan.stops == [] and plan.excluded[0].reasons == ["Pickup deadline cannot be met"]
    assert plan.arrival_at_destination is None


def test_closed_organization_at_arrival():
    org = make_org(opening_hours={"saturday": [{"open": "08:00", "close": "12:00"}]})
    plan = plan_route(request(["res-1"]), org, candidates()[:1], [])
    assert plan.excluded[0].reasons == ["Organization is closed at the estimated arrival"]


def test_incompatible_storage_and_missing_duration():
    frozen = Candidate("res-f", make_offer("offer-f", storage_requirements=["frozen"]))
    plan = plan_route(request(["res-f", "res-1"]), make_org(), [frozen, candidates()[0]], [], duration=lambda a, b: None)
    reasons = {item.reservation_id: item.reasons[0] for item in plan.excluded}
    assert reasons == {"res-f": "Incompatible storage: frozen", "res-1": "No travel time available for this stop"}


def test_service_excludes_cancelled_reservations_on_replan(repo, session_id):
    from app.redistribution.schemas import ReservationCreate

    offers = service.list_offers(repo, session_id, NOW)
    bread = next(o for o in offers if o.category == "bread")
    soup = next(o for o in offers if "chilled" in o.storage_requirements)
    ids = []
    for offer, key in ((bread, "a"), (soup, "b")):
        body = ReservationCreate(organization_id="org-foodbank-nord", offer_version=offer.version, idempotency_key=key)
        ids.append(service.reserve(repo, session_id, offer.id, body, NOW).reservation_id)
    body = RoutePlanRequest(
        organization_id="org-foodbank-nord", reservation_ids=ids + ["res-missing"], vehicle_capacity_kg=40,
        departure_at=NOW + timedelta(hours=7, minutes=30), start_location={"lat": 47.173, "lon": 27.574}, destination={"lat": 47.173, "lon": 27.574},
    )
    first = service.plan_pickup_route(repo, session_id, body, NOW)
    assert len(first.stops) == 2 and [e.reservation_id for e in first.excluded] == ["res-missing"]
    service.cancel_offer(repo, session_id, bread.id, NOW)
    replanned = service.plan_pickup_route(repo, session_id, body, NOW)
    assert [stop.offer_id for stop in replanned.stops] == [soup.id]
    assert {"Reservation is cancelled"} <= {r for e in replanned.excluded for r in e.reasons}
    assert replanned.route_id != first.route_id
    statuses = {r.reservation_id: r.status for r in service.list_reservations(repo, session_id, NOW)}
    assert statuses == {ids[0]: "cancelled", ids[1]: "reserved"}


def test_unknown_organization(repo, session_id):
    with pytest.raises(service.NotFoundError):
        service.plan_pickup_route(repo, session_id, request(["res-1"]), NOW)
