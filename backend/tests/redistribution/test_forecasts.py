"""Confirmed surplus log, complete history and the /forecasts endpoint."""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.contracts.common import ErrorResponse
from app.contracts.decisions import ForecastResult
from app.redistribution import service
from app.redistribution.schemas import OfferCreate, SurplusLogCreate
from redistribution_helpers import NOW

TODAY = NOW.date()
RESTAURANT = "donor-restaurant-copou"
HOUSEHOLD = "donor-household-nicolina"


def log(repo, session_id, donor, day, kg):
    return service.log_surplus(repo, session_id, SurplusLogCreate(donor_id=donor, date=day, quantity_kg=kg), NOW)


def test_log_validation():
    with pytest.raises(ValidationError):
        SurplusLogCreate(donor_id=RESTAURANT, date=TODAY, quantity_kg=-1)
    with pytest.raises(ValidationError):
        SurplusLogCreate(donor_id=RESTAURANT, date="not-a-date", quantity_kg=1)
    assert SurplusLogCreate(donor_id=RESTAURANT, date=TODAY, quantity_kg=0).quantity_kg == 0


def test_confirmed_zero_day_and_idempotent_replay(repo, session_id):
    day = TODAY - timedelta(days=200)
    first = log(repo, session_id, RESTAURANT, day, 0)
    assert first.quantity_kg == 0 and first.unit == "kg"
    assert log(repo, session_id, RESTAURANT, day, 0) == first
    assert sum(1 for e in service.list_surplus_log(repo, session_id, NOW, RESTAURANT) if e.date == day) == 1


def test_confirmed_day_is_not_rewritten(repo, session_id):
    day = TODAY - timedelta(days=200)
    log(repo, session_id, RESTAURANT, day, 5)
    with pytest.raises(service.ConflictError, match="already confirmed"):
        log(repo, session_id, RESTAURANT, day, 6)


def test_rejects_future_unknown_donor_and_total_below_offered(repo, session_id):
    with pytest.raises(service.InvalidDataError, match="today or past"):
        log(repo, session_id, RESTAURANT, TODAY + timedelta(days=1), 3)
    with pytest.raises(service.InvalidDataError, match="Unknown donor"):
        log(repo, session_id, "donor-nobody", TODAY, 3)
    offered = sum(o.quantity_kg for o in service.list_offers(repo, session_id, NOW) if o.donor_id == RESTAURANT)
    assert offered > 0
    with pytest.raises(service.InvalidDataError, match="cannot be below"):
        log(repo, session_id, RESTAURANT, TODAY, offered - 0.5)
    assert log(repo, session_id, RESTAURANT, TODAY, offered).quantity_kg == offered


def test_demo_is_seeded_by_default_and_offers_only_on_request(repo, client):
    from app.redistribution.demo import create_demo_session

    assert len(service.list_surplus_log(repo, create_demo_session(repo, NOW), NOW)) == 195
    plain = create_demo_session(repo, NOW, with_surplus_history=False)
    assert service.list_surplus_log(repo, plain, NOW) == []
    seeded = client.post("/api/redistribution/demo").json()["session_id"]
    assert len(service.list_surplus_log(repo, seeded, NOW)) == 195


def test_demo_log_is_deterministic_and_has_confirmed_zero_days(repo, session_id):
    from app.redistribution.demo import create_demo_session

    other = create_demo_session(repo, NOW, with_surplus_history=True)
    mine = [(e.date, e.quantity_kg) for e in service.list_surplus_log(repo, session_id, NOW, RESTAURANT)]
    assert mine == [(e.date, e.quantity_kg) for e in service.list_surplus_log(repo, other, NOW, RESTAURANT)]
    assert len(mine) == 90 and max(day for day, _ in mine) == TODAY - timedelta(days=1)
    assert any(kg == 0 for _, kg in mine), "closed days must be confirmed zeros, not missing"
    counts = {d: len(service.list_surplus_log(repo, session_id, NOW, d)) for d in (RESTAURANT, "donor-supermarket-pacurari", HOUSEHOLD)}
    assert counts == {RESTAURANT: 90, "donor-supermarket-pacurari": 75, HOUSEHOLD: 30}


def test_logged_day_replaces_offers_and_unlogged_offer_days_stay_incomplete(repo, session_id):
    history = service.extract_surplus_history(repo, session_id, NOW)
    complete = [r for r in history if r.is_complete_observation]
    assert len(complete) == 195 and all(r.unit == "kg" for r in complete)
    assert {r.date for r in history if not r.is_complete_observation} == {"2026-10-17"}

    offered = sum(o.quantity_kg for o in service.list_offers(repo, session_id, NOW) if o.donor_id == RESTAURANT)
    log(repo, session_id, RESTAURANT, TODAY, offered + 4)
    after = service.extract_surplus_history(repo, session_id, NOW)
    today = [r for r in after if r.donor_id == RESTAURANT and r.date == "2026-10-17"]
    assert len(today) == 1 and today[0].is_complete_observation and today[0].observed_quantity == offered + 4


def test_history_has_no_record_for_days_without_log_or_offer(repo, session_id):
    dates = {r.date for r in service.extract_surplus_history(repo, session_id, NOW) if r.donor_id == HOUSEHOLD}
    gap = (TODAY - timedelta(days=100)).isoformat()
    assert gap not in dates


# HTTP


def forecasts(api, days=7):
    response = api.get("/forecasts", params={"days": days})
    assert response.status_code == 200, response.text
    return ForecastResult.model_validate(response.json())


def test_forecasts_demo_has_ready_and_insufficient_donors(api):
    result = forecasts(api)
    by_id = {item.donor_id: item for item in result.items}
    assert result.status == "ready" and result.horizon_days == 7
    for donor in (RESTAURANT, "donor-supermarket-pacurari"):
        item = by_id[donor]
        assert item.status == "ready" and item.unit == "kg" and item.support_days >= 60
        assert len(item.predictions) == 7 and item.model_mae is not None and item.baseline_mae is not None
        # member 4's rule: forecasts start the day after the latest history date
        # (today's offers count as history, so the first forecast day is tomorrow).
        assert item.predictions[0].predicted_for == TODAY + timedelta(days=1)
    household = by_id[HOUSEHOLD]
    assert household.status == "insufficient_data" and household.predictions == [] and household.support_days == 30
    assert household.model_mae is None and household.limitations
    assert "not offers" in " ".join(result.limitations)


def test_forecasts_do_not_create_offers_reservations_or_log(api):
    before = (len(api.get("/offers").json()), len(api.get("/reservations").json()), len(api.get("/surplus-log").json()))
    forecasts(api, days=14)
    after = (len(api.get("/offers").json()), len(api.get("/reservations").json()), len(api.get("/surplus-log").json()))
    assert before == after


def test_forecast_days_validation_and_session_required(api, client):
    for days in (0, 61):
        response = api.get("/forecasts", params={"days": days})
        assert response.status_code == 400
        assert ErrorResponse.model_validate(response.json()).error.code == "VALIDATION_ERROR"
    assert client.get("/api/redistribution/forecasts").status_code == 404


def test_donor_without_any_history_is_listed_as_insufficient(client, repo, clock):
    from app.redistribution.demo import load_demo

    donors, orgs, offers, _ = load_demo(NOW)
    empty = service.create_session(repo, NOW, donors, orgs, [], surplus_log=None)
    response = client.get("/api/redistribution/forecasts", headers={"X-Demo-Session-Id": empty})
    result = ForecastResult.model_validate(response.json())
    assert result.status == "insufficient_data" and len(result.items) == 3
    assert all(item.status == "insufficient_data" and item.support_days == 0 for item in result.items)


def test_logging_through_http_enables_a_forecast(client, repo):
    from app.redistribution.demo import load_demo

    donors, orgs, _, _ = load_demo(NOW)
    session = service.create_session(repo, NOW, donors, orgs, [])
    headers = {"X-Demo-Session-Id": session}
    for back in range(1, 61):
        day = TODAY - timedelta(days=back)
        kg = 0 if day.weekday() == 0 else 4 + day.weekday()
        response = client.post("/api/redistribution/surplus-log", headers=headers, json={"donor_id": RESTAURANT, "date": day.isoformat(), "quantity_kg": kg})
        assert response.status_code == 201
    conflict = client.post("/api/redistribution/surplus-log", headers=headers, json={"donor_id": RESTAURANT, "date": (TODAY - timedelta(days=1)).isoformat(), "quantity_kg": 99})
    assert conflict.status_code == 409
    result = ForecastResult.model_validate(client.get("/api/redistribution/forecasts?days=3", headers=headers).json())
    restaurant = next(i for i in result.items if i.donor_id == RESTAURANT)
    assert restaurant.status == "ready" and restaurant.support_days == 60 and len(restaurant.predictions) == 3
