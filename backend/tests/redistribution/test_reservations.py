import threading
from datetime import timedelta

import pytest

from app.redistribution import service
from app.redistribution.schemas import HandoverCreate, OfferStatus, ReservationCreate
from redistribution_helpers import NOW


def offer_by(repo, session_id, category, storage):
    return next(o for o in service.list_offers(repo, session_id, NOW) if o.category == category and storage in o.storage_requirements)


def reserve(repo, session_id, offer, org_id, key="k1", now=NOW, version=None):
    body = ReservationCreate(organization_id=org_id, offer_version=version or offer.version, idempotency_key=key)
    return service.reserve(repo, session_id, offer.id, body, now)


def handover(repo, session_id, reservation_id, kg, key="h1", now=NOW + timedelta(hours=8, minutes=30)):
    body = HandoverCreate(received_quantity_kg=kg, received_at=now, idempotency_key=key)
    return service.confirm_handover(repo, session_id, reservation_id, body, now)


@pytest.fixture
def bread(repo, session_id):
    return offer_by(repo, session_id, "bread", "ambient")


def test_reservation_marks_offer_reserved_and_bumps_version(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    offer = service.get_offer(repo, session_id, bread.id, NOW)
    assert reservation.status == "reserved" and offer.status == OfferStatus.reserved and offer.version == 2


def test_two_concurrent_reservations_have_one_winner(repo, session_id, bread):
    barrier, outcomes = threading.Barrier(2), []

    def attempt(org_id, key):
        barrier.wait()
        try:
            outcomes.append(reserve(repo, session_id, bread, org_id, key=key).organization_id)
        except service.ConflictError:
            outcomes.append("409")

    threads = [threading.Thread(target=attempt, args=args) for args in (("org-foodbank-nord", "a"), ("org-shelter-tatarasi", "b"))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(outcomes) == 2 and outcomes.count("409") == 1
    assert len(service.list_reservations(repo, session_id, NOW)) == 1


def test_idempotent_replay_returns_original_and_reuse_conflicts(repo, session_id, bread):
    first = reserve(repo, session_id, bread, "org-foodbank-nord")
    assert reserve(repo, session_id, bread, "org-foodbank-nord") == first
    with pytest.raises(service.ConflictError):
        reserve(repo, session_id, bread, "org-shelter-tatarasi")
    assert len(service.list_reservations(repo, session_id, NOW)) == 1


def test_stale_version_conflicts(repo, session_id, bread):
    with pytest.raises(service.ConflictError, match="version"):
        reserve(repo, session_id, bread, "org-foodbank-nord", version=7)


def test_ineligible_organization_cannot_reserve(repo, session_id, bread):
    with pytest.raises(service.ConflictError, match="no longer eligible"):
        reserve(repo, session_id, bread, "org-canteen-centru")


def test_capacity_counts_other_reservations_on_the_same_day(repo, session_id, bread):
    soup = offer_by(repo, session_id, "prepared_meals", "chilled")
    extra = service.create_offer(repo, session_id, soup_copy(soup, 15.0), NOW)
    reserve(repo, session_id, soup, "org-canteen-centru", key="soup")
    matches = service.find_matches(repo, session_id, extra.id, NOW)
    canteen = next(r for r in matches.rejected if r.organization_id == "org-canteen-centru")
    assert any("Insufficient daily capacity (13 kg left" in reason for reason in canteen.reasons)
    with pytest.raises(service.ConflictError):
        reserve(repo, session_id, extra, "org-canteen-centru", key="extra")


def soup_copy(soup, kg):
    from app.redistribution.schemas import OfferCreate

    return OfferCreate(
        donor_id=soup.donor_id, category=soup.category, allergens=soup.allergens, storage_requirements=soup.storage_requirements,
        quantity_kg=kg, available_from=soup.available_from, pickup_deadline=soup.pickup_deadline,
    )


def test_release_returns_offer_to_available(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    assert service.release(repo, session_id, reservation.reservation_id, NOW).status == "released"
    assert service.get_offer(repo, session_id, bread.id, NOW).status == OfferStatus.available
    with pytest.raises(service.ConflictError):
        service.release(repo, session_id, reservation.reservation_id, NOW)


def test_expiry_releases_capacity(repo, session_id, bread):
    soup = offer_by(repo, session_id, "prepared_meals", "chilled")
    reservation = reserve(repo, session_id, soup, "org-canteen-centru")
    after_deadline = soup.pickup_deadline + timedelta(minutes=1)
    assert service.get_offer(repo, session_id, soup.id, after_deadline).status == OfferStatus.expired
    (expired,) = service.list_reservations(repo, session_id, after_deadline)
    assert expired.reservation_id == reservation.reservation_id and expired.status == "expired"
    with repo.transaction() as tx:
        assert tx.committed_kg(session_id, soup.pickup_deadline.date()) == {}


def test_expired_offer_cannot_be_reserved(repo, session_id):
    expired = next(o for o in service.list_offers(repo, session_id, NOW) if o.status == OfferStatus.expired)
    with pytest.raises(service.ConflictError, match="expired"):
        reserve(repo, session_id, expired, "org-foodbank-nord")


def test_handover_counts_received_kg_once(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    first = handover(repo, session_id, reservation.reservation_id, 7.5)
    assert handover(repo, session_id, reservation.reservation_id, 7.5) == first
    with pytest.raises(service.ConflictError):
        handover(repo, session_id, reservation.reservation_id, 7.5, key="other")
    result = service.impact(repo, session_id, NOW)
    assert result.handed_over_quantity_kg == 7.5 and result.handover_count == 1
    assert result.reserved_quantity_kg == 0
    assert result.destinations[0].organization_id == "org-foodbank-nord"


def test_excessive_handover_quantity_rejected(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    with pytest.raises(service.InvalidDataError, match="cannot exceed"):
        handover(repo, session_id, reservation.reservation_id, 8.5)


def test_handover_requires_active_reservation(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    service.release(repo, session_id, reservation.reservation_id, NOW)
    with pytest.raises(service.ConflictError):
        handover(repo, session_id, reservation.reservation_id, 5)


def test_cancel_rules(repo, session_id, bread):
    reservation = reserve(repo, session_id, bread, "org-foodbank-nord")
    assert service.cancel_offer(repo, session_id, bread.id, NOW).status == OfferStatus.cancelled
    assert service.list_reservations(repo, session_id, NOW)[0].status == "cancelled"
    soup = offer_by(repo, session_id, "prepared_meals", "chilled")
    collected = reserve(repo, session_id, soup, "org-foodbank-nord", key="soup")
    handover(repo, session_id, collected.reservation_id, 12)
    with pytest.raises(service.ConflictError):
        service.cancel_offer(repo, session_id, soup.id, NOW)
    assert reservation.reservation_id != collected.reservation_id


def test_impact_separates_offered_reserved_and_handed_over(repo, session_id, bread):
    reserve(repo, session_id, bread, "org-foodbank-nord")
    result = service.impact(repo, session_id, NOW)
    assert result.offered_quantity_kg == 33.0
    assert result.reserved_quantity_kg == 8.0
    assert result.handed_over_quantity_kg == 0 and result.handover_count == 0
    assert result.is_synthetic


def test_offer_only_days_are_marked_incomplete(repo, session_id):
    history = service.extract_surplus_history(repo, session_id, NOW)
    offer_days = [record for record in history if not record.is_complete_observation]
    assert len(offer_days) == 5
    assert all(record.unit == "kg" and record.date == "2026-10-17" for record in offer_days)
    assert {record.donor_type for record in history} == {"restaurant", "supermarket", "household"}
