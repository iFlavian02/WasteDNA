"""Customer prices on offers and the opt-in Iași marketplace demo
(`POST /demo?marketplace=true`), used by the personal account's map."""

import pytest
from pydantic import ValidationError

from app.redistribution.demo import load_marketplace
from app.redistribution.schemas import Offer, OfferCreate
from redistribution_helpers import NOW

PRICED_OFFER = {
    "donor_id": "donor-restaurant-copou",
    "category": "prepared_meals",
    "description": "Stuffed peppers (synthetic)",
    "allergens": [],
    "storage_requirements": ["chilled"],
    "quantity_kg": 2.0,
    "portion_count": 4,
    "price_ron": 12.5,
    "original_price_ron": 30,
    "available_from": "2026-10-17T16:00:00+03:00",
    "pickup_deadline": "2026-10-17T19:00:00+03:00",
}

# Generous box around Iași: every marketplace restaurant must be on the city map.
IASI_LAT, IASI_LON = (47.10, 47.22), (27.50, 27.68)


def test_prices_are_optional_and_validated():
    unpriced = {key: value for key, value in PRICED_OFFER.items() if not key.endswith("price_ron")}
    assert OfferCreate.model_validate(unpriced).price_ron is None
    assert OfferCreate.model_validate({**PRICED_OFFER, "original_price_ron": None}).price_ron == 12.5
    with pytest.raises(ValidationError, match="requires price_ron"):
        OfferCreate.model_validate({**PRICED_OFFER, "price_ron": None})
    with pytest.raises(ValidationError, match="must not exceed"):
        OfferCreate.model_validate({**PRICED_OFFER, "price_ron": 31})
    with pytest.raises(ValidationError):
        OfferCreate.model_validate({**PRICED_OFFER, "price_ron": -1})


def test_offers_stored_before_prices_existed_still_load():
    created = OfferCreate.model_validate(PRICED_OFFER).model_dump(exclude={"price_ron", "original_price_ron"})
    stored = {**created, "id": "offer-old", "location": {"lat": 47.17, "lon": 27.57}, "status": "available", "version": 1, "created_at": NOW}
    assert Offer.model_validate(stored).price_ron is None


def test_priced_offer_round_trips_over_http(api):
    created = api.post("/offers", PRICED_OFFER)
    assert created.status_code == 201
    offer = api.get(f"/offers/{created.json()['id']}").json()
    assert (offer["price_ron"], offer["original_price_ron"]) == (12.5, 30)
    bad = api.post("/offers", {**PRICED_OFFER, "price_ron": 40})
    assert bad.status_code == 400  # request validation error envelope


def test_default_demo_has_no_marketplace(api):
    assert not [donor for donor in api.get("/donors").json() if donor["id"].startswith("donor-iasi-")]


def test_marketplace_demo_adds_live_priced_iasi_restaurants(client):
    session = client.post("/api/redistribution/demo?marketplace=true").json()
    headers = {"X-Demo-Session-Id": session["session_id"]}
    donors = client.get("/api/redistribution/donors", headers=headers).json()
    restaurants = [donor for donor in donors if donor["id"].startswith("donor-iasi-")]
    assert len(restaurants) == 6 and {donor["type"] for donor in restaurants} == {"restaurant"}
    assert all(IASI_LAT[0] < d["location"]["lat"] < IASI_LAT[1] and IASI_LON[0] < d["location"]["lon"] < IASI_LON[1] for d in donors)

    available = client.get("/api/redistribution/offers?status=available", headers=headers).json()
    marketplace = [offer for offer in available if offer["donor_id"].startswith("donor-iasi-")]
    assert len(marketplace) == 9
    assert {offer["donor_id"] for offer in marketplace} == {donor["id"] for donor in restaurants}
    assert all(0 < offer["price_ron"] < offer["original_price_ron"] for offer in marketplace)
    assert all(offer["portion_count"] for offer in marketplace)


def test_marketplace_offers_are_live_whenever_the_demo_starts():
    for hour in (0, 10, 15, 23):
        now = NOW.replace(hour=hour)
        _, offers = load_marketplace(now)
        assert all(offer.available_from <= now < offer.pickup_deadline for offer in offers)
