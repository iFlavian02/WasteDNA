"""End-to-end HTTP flow: offer → match → reserve → handover → impact, built on
the platform app factory with this router included (as member 1 will do)."""

from datetime import timedelta

from app.contracts.common import ErrorResponse
from redistribution_helpers import NOW

NEW_OFFER = {
    "donor_id": "donor-household-nicolina",
    "category": "produce",
    "description": "Apples from the garden (synthetic)",
    "allergens": [],
    "storage_requirements": ["ambient"],
    "quantity_kg": 4.0,
    "portion_count": None,
    "available_from": "2026-10-17T16:00:00+03:00",
    "pickup_deadline": "2026-10-17T19:00:00+03:00",
}


def error_code(response):
    return ErrorResponse.model_validate(response.json()).error.code


def test_full_flow_for_every_donor_type(api, clock):
    session = api.headers["X-Demo-Session-Id"]
    assert session.startswith("sess-")
    assert {d["type"] for d in api.get("/donors").json()} == {"restaurant", "supermarket", "household"}
    assert len(api.get("/organizations").json()) == 4

    household = api.post("/offers", NEW_OFFER)
    assert household.status_code == 201
    created = household.json()
    assert created["status"] == "available" and created["version"] == 1
    assert created["location"] == {"lat": 47.145, "lon": 27.59}

    for offer in (created, api.offer("bread"), api.offer("prepared_meals", "chilled")):
        matches = api.get(f"/offers/{offer['id']}/matches").json()
        assert matches["eligible"], offer["category"]
        org_id = matches["eligible"][0]["organization_id"]
        body = {"organization_id": org_id, "offer_version": offer["version"], "idempotency_key": f"r-{offer['id']}"}
        reservation = api.post(f"/offers/{offer['id']}/reservations", body)
        assert reservation.status_code == 201
        replay = api.post(f"/offers/{offer['id']}/reservations", body)
        assert replay.status_code == 201 and replay.json() == reservation.json()
        handover = {"received_quantity_kg": offer["quantity_kg"] - 0.5, "received_at": "2026-10-17T18:45:00+03:00", "idempotency_key": f"h-{offer['id']}"}
        clock.now = NOW + timedelta(hours=8, minutes=50)
        rid = reservation.json()["reservation_id"]
        assert api.post(f"/reservations/{rid}/handover", handover).status_code == 201
        assert api.post(f"/reservations/{rid}/handover", handover).status_code == 201
        clock.now = NOW

    impact = api.get("/impact").json()
    assert impact["handover_count"] == 3
    assert impact["handed_over_quantity_kg"] == 3.5 + 7.5 + 11.5
    assert impact["reserved_quantity_kg"] == 0
    assert api.get("/impact", params={"from": "2026-10-18"}).json()["handover_count"] == 0


def test_no_match_and_unknown_allergens_are_successful_empty_results(api):
    frozen = api.offer("prepared_meals", "frozen")
    cake = api.offer("bakery")
    for offer in (frozen, cake):
        response = api.get(f"/offers/{offer['id']}/matches")
        assert response.status_code == 200 and response.json()["eligible"] == []


def test_conflicts_and_errors_use_common_envelope(api, client):
    bread = api.offer("bread")
    first = {"organization_id": "org-foodbank-nord", "offer_version": 1, "idempotency_key": "one"}
    second = {"organization_id": "org-shelter-tatarasi", "offer_version": 1, "idempotency_key": "two"}
    assert api.post(f"/offers/{bread['id']}/reservations", first).status_code == 201
    conflict = api.post(f"/offers/{bread['id']}/reservations", second)
    assert conflict.status_code == 409 and error_code(conflict) == "CONFLICT"

    expired = next(o for o in api.get("/offers").json() if o["status"] == "expired")
    assert api.get(f"/offers/{expired['id']}/matches").status_code == 409

    invalid = api.post("/offers", {**NEW_OFFER, "quantity_kg": 0})
    assert invalid.status_code == 400 and error_code(invalid) == "VALIDATION_ERROR"
    unknown_donor = api.post("/offers", {**NEW_OFFER, "donor_id": "donor-nobody"})
    assert unknown_donor.status_code == 422 and error_code(unknown_donor) == "INVALID_DATA"
    assert api.get("/offers/offer-missing").status_code == 404

    no_session = client.get("/api/redistribution/offers")
    assert no_session.status_code == 404 and error_code(no_session) == "NOT_FOUND"
    wrong_session = client.get("/api/redistribution/offers", headers={"X-Demo-Session-Id": "sess-nope"})
    assert wrong_session.status_code == 404


def test_offer_filters_and_urgency_order(api):
    offers = api.get("/offers").json()
    deadlines = [offer["pickup_deadline"] for offer in offers]
    assert deadlines == sorted(deadlines)
    assert {o["status"] for o in api.get("/offers", params={"status": "expired"}).json()} == {"expired"}
    assert [o["category"] for o in api.get("/offers", params={"category": "bread"}).json()] == ["bread"]
    assert len(api.get("/offers", params={"available_before": "2026-10-17T16:30:00+03:00"}).json()) == 2


def test_release_cancel_and_route_endpoints(api):
    bread = api.offer("bread")
    reservation = api.post(f"/offers/{bread['id']}/reservations", {"organization_id": "org-foodbank-nord", "offer_version": 1, "idempotency_key": "x"}).json()
    plan = api.post("/routes/plan", {
        "organization_id": "org-foodbank-nord", "reservation_ids": [reservation["reservation_id"]], "vehicle_capacity_kg": 20,
        "departure_at": "2026-10-17T17:00:00+03:00", "start_location": {"lat": 47.173, "lon": 27.574}, "destination": {"lat": 47.173, "lon": 27.574},
    })
    assert plan.status_code == 200 and len(plan.json()["stops"]) == 1 and plan.json()["is_simulated"] is True
    released = api.post(f"/reservations/{reservation['reservation_id']}/release")
    assert released.status_code == 200 and released.json()["status"] == "released"
    assert api.post(f"/reservations/{reservation['reservation_id']}/release").status_code == 409
    cancelled = api.post(f"/offers/{bread['id']}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert api.post(f"/offers/{bread['id']}/cancel").status_code == 409
    assert [r["status"] for r in api.get("/reservations").json()] == ["released"]
