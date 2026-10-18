"""Customer orders: Order now on the food map, order history and cancelling."""

from datetime import timedelta

from app.redistribution import service
from app.redistribution.repository import Repository
from app.redistribution.schemas import OrderCreate
from redistribution_helpers import NOW

CUSTOMER = "customer-lena-hoffmann"
OFFER = {
    "donor_id": "donor-restaurant-copou",
    "category": "prepared_meals",
    "description": "Stuffed peppers (synthetic)",
    "allergens": [],
    "storage_requirements": ["chilled"],
    "quantity_kg": 2.0,
    "portion_count": 4,
    "price_ron": 12.5,
    "original_price_ron": 30,
    "available_from": "2026-10-17T09:00:00+03:00",
    "pickup_deadline": "2026-10-17T19:00:00+03:00",
}


def order(api, offer_id, portions=1, key="k1", customer=CUSTOMER):
    return api.post(f"/offers/{offer_id}/orders", {"customer_id": customer, "portions": portions, "idempotency_key": key})


def test_order_takes_portions_and_copies_item_price_and_window(api):
    offer = api.post("/offers", OFFER).json()
    assert offer["portions_left"] == 4

    created = order(api, offer["id"], portions=3)
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "placed" and body["portions"] == 3
    assert (body["unit_price_ron"], body["total_price_ron"], body["original_total_ron"]) == (12.5, 37.5, 90)
    assert body["description"] == OFFER["description"] and body["donor_id"] == OFFER["donor_id"]
    assert body["pickup_until"] == offer["pickup_deadline"]
    assert len(body["pickup_code"]) == 4 and set(body["pickup_code"]) <= set(service.PICKUP_CODE_ALPHABET)

    after = api.get(f"/offers/{offer['id']}").json()
    assert after["portions_left"] == 1 and after["status"] == "available" and after["version"] == offer["version"] + 1


def test_cannot_order_more_than_left_or_a_sold_out_offer(api):
    offer = api.post("/offers", OFFER).json()
    too_many = order(api, offer["id"], portions=5)
    assert too_many.status_code == 409 and "Only 4 left" in too_many.json()["error"]["message"]
    assert order(api, offer["id"], portions=4).status_code == 201
    sold_out = order(api, offer["id"], key="k2")
    assert sold_out.status_code == 409 and "sold out" in sold_out.json()["error"]["message"]
    assert order(api, offer["id"], portions=0, key="k3").status_code == 400


def test_whole_offer_without_portions_is_sold_once(api):
    bread = api.offer("bread")
    assert bread["portion_count"] is None and bread["portions_left"] == 1
    first = order(api, bread["id"])
    assert first.status_code == 201 and first.json()["total_price_ron"] == 12 and first.json()["sold_whole"] is True
    assert order(api, bread["id"], key="k2").status_code == 409


def test_replaying_an_order_returns_it_once(api):
    offer = api.post("/offers", OFFER).json()
    first, again = order(api, offer["id"], portions=2), order(api, offer["id"], portions=2)
    assert first.json() == again.json()
    assert api.get(f"/offers/{offer['id']}").json()["portions_left"] == 2
    assert order(api, offer["id"], portions=1).status_code == 409, "same key, different order"


def test_history_is_per_customer_and_newest_first(api, clock):
    offer = api.post("/offers", OFFER).json()
    order(api, offer["id"], key="a")
    clock.now = NOW + timedelta(minutes=5)
    second = order(api, offer["id"], key="b").json()
    order(api, offer["id"], key="c", customer="customer-someone-else")
    history = api.get("/orders", params={"customer_id": CUSTOMER}).json()
    assert [item["id"] for item in history][0] == second["id"] and len(history) == 2
    assert len(api.get("/orders").json()) == 3
    assert len(api.get("/orders", params={"donor_id": "donor-supermarket-pacurari"}).json()) == 0


def test_cancel_returns_portions_until_the_window_ends(api, clock):
    offer = api.post("/offers", OFFER).json()
    placed = order(api, offer["id"], portions=3).json()
    cancelled = api.post(f"/orders/{placed['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled" and cancelled.json()["cancelled_at"]
    assert api.get(f"/offers/{offer['id']}").json()["portions_left"] == 4
    assert api.post(f"/orders/{placed['id']}/cancel").status_code == 409
    assert api.post("/orders/order-missing/cancel").status_code == 404

    late = order(api, offer["id"], key="k2").json()
    clock.now = NOW + timedelta(hours=10)
    assert api.post(f"/orders/{late['id']}/cancel").status_code == 409


def test_cancelling_the_offer_cancels_its_orders_and_orders_block_whole_reservation(api):
    soup = api.offer("prepared_meals", "chilled")
    placed = order(api, soup["id"]).json()
    eligible = api.get(f"/offers/{soup['id']}/matches").json()["eligible"][0]["organization_id"]
    current = api.get(f"/offers/{soup['id']}").json()
    blocked = api.post(f"/offers/{soup['id']}/reservations", {"organization_id": eligible, "offer_version": current["version"], "idempotency_key": "r1"})
    assert blocked.status_code == 409 and "Customers have ordered" in blocked.json()["error"]["message"]
    assert api.post(f"/offers/{soup['id']}/cancel").status_code == 200
    assert api.get("/orders").json()[0] == {**placed, "status": "cancelled", "cancelled_at": api.get("/orders").json()[0]["cancelled_at"]}


def test_last_portion_cannot_be_sold_twice(tmp_path):
    repo = Repository(tmp_path / "db.sqlite3")
    from app.redistribution.demo import create_demo_session

    session_id = create_demo_session(repo, NOW)
    soup = next(offer for offer in service.list_offers(repo, session_id, NOW) if offer.portion_count == 30)
    service.place_order(repo, session_id, soup.id, OrderCreate(customer_id="a", portions=29, idempotency_key="x"), NOW)
    results = []
    for key in ("y", "z"):
        try:
            results.append(service.place_order(repo, session_id, soup.id, OrderCreate(customer_id="b", portions=1, idempotency_key=key), NOW))
        except service.ConflictError:
            results.append(None)
    assert sum(result is not None for result in results) == 1
    assert service.get_offer(repo, session_id, soup.id, NOW).portions_left == 0
