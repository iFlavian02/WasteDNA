"""Redistribution use cases. HTTP-free: callers pass the repository, the
session ID and the current time, and receive Pydantic contracts or a
`RedistributionError` subclass that the API layer maps to a status code.

State machine (offer): available â†’ reserved â†’ collected; available/reserved â†’
expired at the pickup deadline; available/reserved â†’ cancelled; a released
reservation returns the offer to available only before its deadline. Every
call first expires offers whose deadline has passed, so no read returns an
expired offer as available.
"""

import hashlib
import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from app.redistribution.geo import BUCHAREST, local, service_date
from app.redistribution.matching import evaluate, match_offer, offer_urgency_key
from app.redistribution.repository import Repository, Tx
from app.redistribution.routing import Candidate, DurationFn, plan_route, simulated_minutes
from app.redistribution.schemas import (
    DestinationImpact,
    Donor,
    EligibleMatch,
    ExcludedReservation,
    RoutePlan,
    RoutePlanRequest,
    Handover,
    HandoverCreate,
    ImpactResult,
    MatchesResult,
    Offer,
    OfferCreate,
    OfferStatus,
    Organization,
    Reservation,
    ReservationCreate,
    ReservationStatus,
    SurplusLogCreate,
    SurplusLogEntry,
    SurplusObservation,
)

CLOCK_SKEW = timedelta(minutes=5)


class RedistributionError(Exception):
    """Base error with a safe, user-facing message."""


class NotFoundError(RedistributionError):
    pass


class ConflictError(RedistributionError):
    pass


class InvalidDataError(RedistributionError):
    pass


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:16]}"


def _request_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _require_session(tx: Tx, session_id: str) -> bool:
    is_synthetic = tx.session_is_synthetic(session_id)
    if is_synthetic is None:
        raise NotFoundError("Unknown or missing demo session.")
    return is_synthetic


def _require_offer(tx: Tx, session_id: str, offer_id: str) -> Offer:
    offer = tx.offer(session_id, offer_id)
    if offer is None:
        raise NotFoundError("Offer not found.")
    return offer


def _transition_offer(tx: Tx, session_id: str, offer: Offer, status: OfferStatus, now: datetime) -> Offer:
    updated = offer.model_copy(update={"status": status, "version": offer.version + 1})
    tx.save_offer(session_id, updated)
    tx.record_transition(session_id, "offer", offer.id, offer.status, status, now)
    return updated


def _transition_reservation(tx: Tx, session_id: str, row, status: ReservationStatus, now: datetime) -> None:
    tx.set_reservation_status(session_id, row["id"], status)
    tx.record_transition(session_id, "reservation", row["id"], row["status"], status, now)


def _reservation_model(row, status: str | None = None) -> Reservation:
    return Reservation(
        reservation_id=row["id"],
        offer_id=row["offer_id"],
        organization_id=row["organization_id"],
        status=status or row["status"],
        reserved_at=local(datetime.fromisoformat(row["reserved_at"])),
    )


def expire_due(tx: Tx, session_id: str, now: datetime) -> None:
    """Expire available/reserved offers at or after their pickup deadline and
    release the capacity held by their reservations."""
    for offer in tx.offers(session_id, ("available", "reserved")):
        if now >= offer.pickup_deadline:
            reservation = tx.active_reservation_for_offer(session_id, offer.id)
            if reservation is not None:
                _transition_reservation(tx, session_id, reservation, ReservationStatus.expired, now)
            _transition_offer(tx, session_id, offer, OfferStatus.expired, now)


@contextmanager
def _session(repo: Repository, session_id: str, now: datetime) -> Iterator[Tx]:
    """Transaction preamble shared by all session operations: session check
    and expiry sweep. An error rolls back the whole transaction."""
    with repo.transaction() as tx:
        _require_session(tx, session_id)
        expire_due(tx, session_id, now)
        yield tx


# Sessions and directories


def create_session(
    repo: Repository,
    now: datetime,
    donors: list[Donor],
    organizations: list[Organization],
    offers: list[OfferCreate],
    surplus_log: list[tuple[str, date, float]] | None = None,
    is_synthetic: bool = True,
) -> str:
    """Create a session with its directories, seed offers and seed confirmed
    surplus days `(donor_id, day, kg)`. Seeds are for the synthetic demo."""
    session_id = new_id("sess")
    with repo.transaction() as tx:
        tx.create_session(session_id, is_synthetic, now)
        for donor in donors:
            tx.add_donor(session_id, donor)
        for org in organizations:
            tx.add_organization(session_id, org)
        for donor_id, day, quantity_kg in surplus_log or []:
            tx.insert_surplus_log(session_id, donor_id, day, quantity_kg, now)
    for body in offers:
        create_offer(repo, session_id, body, now, allow_past=True)
    return session_id


def list_donors(repo: Repository, session_id: str, now: datetime) -> list[Donor]:
    with _session(repo, session_id, now) as tx:
        return tx.donors(session_id)


def list_organizations(repo: Repository, session_id: str, now: datetime) -> list[Organization]:
    with _session(repo, session_id, now) as tx:
        return tx.organizations(session_id)


# Offers


def create_offer(repo: Repository, session_id: str, body: OfferCreate, now: datetime, allow_past: bool = False) -> Offer:
    """Validate and store a donor-confirmed offer. `allow_past` is only used
    to seed demo history (for example an already expired offer)."""
    if not allow_past and body.pickup_deadline <= now:
        raise InvalidDataError("pickup_deadline must be in the future.")
    with _session(repo, session_id, now) as tx:
        donor = tx.donor(session_id, body.donor_id)
        if donor is None:
            raise InvalidDataError("Unknown donor_id for this session.")
        offer = Offer(
            id=new_id("offer"),
            **body.model_dump(exclude={"location", "available_from", "pickup_deadline"}),
            available_from=local(body.available_from),
            pickup_deadline=local(body.pickup_deadline),
            location=body.location or donor.location,
            status=OfferStatus.available,
            version=1,
            created_at=local(now),
        )
        tx.insert_offer(session_id, offer)
        tx.record_transition(session_id, "offer", offer.id, None, offer.status, now)
        expire_due(tx, session_id, now)
        return tx.offer(session_id, offer.id)


def list_offers(repo: Repository, session_id: str, now: datetime, status: OfferStatus | None = None, category: str | None = None, available_before: datetime | None = None) -> list[Offer]:
    """Offers sorted by urgency (earliest pickup deadline, then ID)."""
    with _session(repo, session_id, now) as tx:
        offers = tx.offers(session_id, (status,) if status else None)
    if category:
        offers = [offer for offer in offers if offer.category == category.lower()]
    if available_before:
        offers = [offer for offer in offers if offer.available_from <= available_before]
    return sorted(offers, key=offer_urgency_key)


def get_offer(repo: Repository, session_id: str, offer_id: str, now: datetime) -> Offer:
    with _session(repo, session_id, now) as tx:
        return _require_offer(tx, session_id, offer_id)


def find_matches(repo: Repository, session_id: str, offer_id: str, now: datetime) -> MatchesResult:
    with _session(repo, session_id, now) as tx:
        offer = _require_offer(tx, session_id, offer_id)
        if offer.status != OfferStatus.available:
            raise ConflictError(f"Offer is {offer.status}; only available offers can be matched.")
        committed = tx.committed_kg(session_id, service_date(offer.pickup_deadline), exclude_offer_id=offer.id)
        return match_offer(offer, tx.organizations(session_id), now, committed)


def cancel_offer(repo: Repository, session_id: str, offer_id: str, now: datetime) -> Offer:
    with _session(repo, session_id, now) as tx:
        offer = _require_offer(tx, session_id, offer_id)
        if offer.status not in (OfferStatus.available, OfferStatus.reserved):
            raise ConflictError(f"Offer is {offer.status} and cannot be cancelled.")
        reservation = tx.active_reservation_for_offer(session_id, offer.id)
        if reservation is not None:
            _transition_reservation(tx, session_id, reservation, ReservationStatus.cancelled, now)
        return _transition_offer(tx, session_id, offer, OfferStatus.cancelled, now)


# Reservations


def reserve(repo: Repository, session_id: str, offer_id: str, body: ReservationCreate, now: datetime) -> Reservation:
    """Reserve the full offer for one organization, atomically.

    Replaying the same idempotency key with the same request returns the
    original reservation; reusing it for a different request is a conflict."""
    request_hash = _request_hash({"offer_id": offer_id, **body.model_dump(exclude={"idempotency_key"})})
    with _session(repo, session_id, now) as tx:
        previous = tx.idempotent_response(session_id, "reserve", body.idempotency_key)
        if previous is not None:
            if previous[0] != request_hash:
                raise ConflictError("idempotency_key was already used for a different reservation request.")
            return Reservation.model_validate(previous[1])

        offer = _require_offer(tx, session_id, offer_id)
        org = tx.organization(session_id, body.organization_id)
        if org is None:
            raise NotFoundError("Organization not found.")
        if offer.status != OfferStatus.available:
            raise ConflictError(f"Offer is {offer.status} and cannot be reserved.")
        if offer.version != body.offer_version:
            raise ConflictError(f"Offer version is {offer.version}; reload the offer and retry.")
        day = service_date(offer.pickup_deadline)
        committed = tx.committed_kg(session_id, day, exclude_offer_id=offer.id).get(org.id, 0.0)
        outcome = evaluate(offer, org, now, committed)
        if not isinstance(outcome, EligibleMatch):
            raise ConflictError("Organization is no longer eligible: " + "; ".join(outcome.reasons))

        reservation = Reservation(
            reservation_id=new_id("res"),
            offer_id=offer.id,
            organization_id=org.id,
            status=ReservationStatus.reserved,
            reserved_at=local(now),
        )
        tx.insert_reservation(session_id, reservation, offer.quantity_kg, day)
        tx.record_transition(session_id, "reservation", reservation.reservation_id, None, reservation.status, now)
        _transition_offer(tx, session_id, offer, OfferStatus.reserved, now)
        tx.remember_response(session_id, "reserve", body.idempotency_key, request_hash, reservation.model_dump(mode="json"))
        return reservation


def list_reservations(repo: Repository, session_id: str, now: datetime, status: ReservationStatus | None = None) -> list[Reservation]:
    with _session(repo, session_id, now) as tx:
        return [_reservation_model(row) for row in tx.reservations(session_id, status)]


def release(repo: Repository, session_id: str, reservation_id: str, now: datetime) -> Reservation:
    with _session(repo, session_id, now) as tx:
        row = tx.reservation(session_id, reservation_id)
        if row is None:
            raise NotFoundError("Reservation not found.")
        if row["status"] != ReservationStatus.reserved:
            raise ConflictError(f"Reservation is {row['status']} and cannot be released.")
        _transition_reservation(tx, session_id, row, ReservationStatus.released, now)
        _transition_offer(tx, session_id, _require_offer(tx, session_id, row["offer_id"]), OfferStatus.available, now)
        return _reservation_model(row, ReservationStatus.released)


def confirm_handover(repo: Repository, session_id: str, reservation_id: str, body: HandoverCreate, now: datetime) -> Handover:
    """Record the quantity actually received. Impact counts it once."""
    with _session(repo, session_id, now) as tx:
        row = tx.reservation(session_id, reservation_id)
        if row is None:
            raise NotFoundError("Reservation not found.")
        existing = tx.handover(session_id, reservation_id)
        if existing is not None:
            same = (
                existing["idempotency_key"] == body.idempotency_key
                and existing["received_quantity_kg"] == body.received_quantity_kg
                and datetime.fromisoformat(existing["received_at"]) == body.received_at
            )
            if not same:
                raise ConflictError("This reservation already has a confirmed handover.")
            return _handover_model(existing)
        if row["status"] != ReservationStatus.reserved:
            raise ConflictError(f"Reservation is {row['status']}; handover is not possible.")

        offer = _require_offer(tx, session_id, row["offer_id"])
        if body.received_quantity_kg > offer.quantity_kg + 1e-9:
            raise InvalidDataError(f"received_quantity_kg cannot exceed the offered {offer.quantity_kg:g} kg.")
        if body.received_at > now + CLOCK_SKEW:
            raise InvalidDataError("received_at cannot be in the future.")
        if body.received_at > offer.pickup_deadline or body.received_at < datetime.fromisoformat(row["reserved_at"]) - CLOCK_SKEW:
            raise InvalidDataError("received_at must be between the reservation time and the pickup deadline.")

        values = {
            "reservation_id": reservation_id,
            "offer_id": offer.id,
            "organization_id": row["organization_id"],
            "offered_quantity_kg": offer.quantity_kg,
            "received_quantity_kg": body.received_quantity_kg,
            "received_at": local(body.received_at).isoformat(),
            "service_date": service_date(offer.pickup_deadline).isoformat(),
            "idempotency_key": body.idempotency_key,
        }
        tx.insert_handover(session_id, values)
        _transition_reservation(tx, session_id, row, ReservationStatus.collected, now)
        _transition_offer(tx, session_id, offer, OfferStatus.collected, now)
        return _handover_model(values)


def _handover_model(values) -> Handover:
    return Handover(
        reservation_id=values["reservation_id"],
        offer_id=values["offer_id"],
        organization_id=values["organization_id"],
        offered_quantity_kg=values["offered_quantity_kg"],
        received_quantity_kg=values["received_quantity_kg"],
        received_at=local(datetime.fromisoformat(values["received_at"])),
    )


# Routes


def plan_pickup_route(repo: Repository, session_id: str, request: RoutePlanRequest, now: datetime, duration: DurationFn = simulated_minutes) -> RoutePlan:
    """Plan a route over the requested reservations of one organization.
    Unknown, inactive or other-organization reservations are listed as excluded."""
    with _session(repo, session_id, now) as tx:
        org = tx.organization(session_id, request.organization_id)
        if org is None:
            raise NotFoundError("Organization not found.")
        candidates, rejected = [], []
        for reservation_id in dict.fromkeys(request.reservation_ids):
            row = tx.reservation(session_id, reservation_id)
            if row is None:
                rejected.append(ExcludedReservation(reservation_id=reservation_id, reasons=["Reservation not found"]))
            elif row["organization_id"] != org.id:
                rejected.append(ExcludedReservation(reservation_id=reservation_id, reasons=["Reserved by another organization"]))
            elif row["status"] != ReservationStatus.reserved:
                rejected.append(ExcludedReservation(reservation_id=reservation_id, reasons=[f"Reservation is {row['status']}"]))
            else:
                candidates.append(Candidate(reservation_id, _require_offer(tx, session_id, row["offer_id"])))
    return plan_route(request, org, candidates, rejected, duration)


# Impact and history


def impact(repo: Repository, session_id: str, now: datetime, date_from: date | None = None, date_to: date | None = None) -> ImpactResult:
    """Offered, reserved and handed-over kg kept separate. Only confirmed
    handovers count as impact, once per reservation. The optional period
    filters by the offer's local pickup-deadline date."""

    def in_period(day: date) -> bool:
        return (date_from is None or day >= date_from) and (date_to is None or day <= date_to)

    with _session(repo, session_id, now) as tx:
        is_synthetic = tx.session_is_synthetic(session_id)
        offers = [offer for offer in tx.offers(session_id) if in_period(service_date(offer.pickup_deadline))]
        handovers = [row for row in tx.handovers(session_id) if in_period(date.fromisoformat(row["service_date"]))]

    destinations: dict[str, DestinationImpact] = {}
    for row in handovers:
        current = destinations.get(row["organization_id"]) or DestinationImpact(organization_id=row["organization_id"], handed_over_quantity_kg=0, handover_count=0)
        destinations[row["organization_id"]] = current.model_copy(
            update={"handed_over_quantity_kg": round(current.handed_over_quantity_kg + row["received_quantity_kg"], 3), "handover_count": current.handover_count + 1}
        )
    limitations = ["Impact counts only quantities confirmed as received; offered and reserved amounts are not impact."]
    if is_synthetic:
        limitations.append("Demo session: donors, organizations and quantities are synthetic.")
    return ImpactResult(
        is_synthetic=bool(is_synthetic),
        offered_quantity_kg=round(sum(o.quantity_kg for o in offers if o.status != OfferStatus.cancelled), 3),
        reserved_quantity_kg=round(sum(o.quantity_kg for o in offers if o.status == OfferStatus.reserved), 3),
        handed_over_quantity_kg=round(sum(row["received_quantity_kg"] for row in handovers), 3),
        handover_count=len(handovers),
        destinations=sorted(destinations.values(), key=lambda item: item.organization_id),
        limitations=limitations,
    )


def _log_model(row) -> SurplusLogEntry:
    return SurplusLogEntry(
        donor_id=row["donor_id"],
        date=date.fromisoformat(row["day"]),
        quantity_kg=row["quantity_kg"],
        recorded_at=local(datetime.fromisoformat(row["recorded_at"])),
    )


def log_surplus(repo: Repository, session_id: str, body: SurplusLogCreate, now: datetime) -> SurplusLogEntry:
    """Record the donor's confirmed total surplus for one day (0 = confirmed zero).

    Replaying the same quantity returns the existing entry. A different
    quantity for an already confirmed day is a conflict: confirmed history is
    not silently rewritten. The total cannot be below what was already offered
    that day, and future days cannot be confirmed."""
    with _session(repo, session_id, now) as tx:
        if tx.donor(session_id, body.donor_id) is None:
            raise InvalidDataError("Unknown donor_id for this session.")
        if body.date > service_date(now):
            raise InvalidDataError("Surplus can only be confirmed for today or past days.")
        existing = tx.surplus_log_entry(session_id, body.donor_id, body.date)
        if existing is not None:
            if abs(existing["quantity_kg"] - body.quantity_kg) > 1e-9:
                raise ConflictError(f"Surplus for {body.date} is already confirmed as {existing['quantity_kg']:g} kg.")
            return _log_model(existing)
        offered = sum(
            offer.quantity_kg
            for offer in tx.offers(session_id)
            if offer.donor_id == body.donor_id and offer.status != OfferStatus.cancelled and service_date(offer.available_from) == body.date
        )
        if offered > body.quantity_kg + 1e-9:
            raise InvalidDataError(f"Total surplus ({body.quantity_kg:g} kg) cannot be below the {offered:g} kg already offered that day.")
        tx.insert_surplus_log(session_id, body.donor_id, body.date, body.quantity_kg, now)
        return _log_model(tx.surplus_log_entry(session_id, body.donor_id, body.date))


def list_surplus_log(repo: Repository, session_id: str, now: datetime, donor_id: str | None = None) -> list[SurplusLogEntry]:
    with _session(repo, session_id, now) as tx:
        return [_log_model(row) for row in tx.surplus_log(session_id, donor_id)]


def extract_surplus_history(repo: Repository, session_id: str, now: datetime) -> list[SurplusObservation]:
    """History for member 4's `forecast_surplus`.

    - A day with a confirmed surplus log entry gives one complete record
      (including confirmed zero days). It replaces offers of that day, which
      are part of the logged total.
    - A day with offers but no log entry gives incomplete records: offers do
      not prove total surplus, and the forecast excludes those days.
    - Days with neither are absent, never zero."""
    with _session(repo, session_id, now) as tx:
        donors = {donor.id: donor for donor in tx.donors(session_id)}
        offers = [offer for offer in tx.offers(session_id) if offer.status != OfferStatus.cancelled]
        logged = [_log_model(row) for row in tx.surplus_log(session_id)]
    confirmed_days = {(entry.donor_id, entry.date.isoformat()) for entry in logged}
    records = [
        SurplusObservation(
            donor_id=entry.donor_id,
            donor_type=donors[entry.donor_id].type,
            date=entry.date.isoformat(),
            interval_start=datetime.combine(entry.date, time.min, BUCHAREST),
            interval_end=datetime.combine(entry.date + timedelta(days=1), time.min, BUCHAREST),
            observed_quantity=entry.quantity_kg,
            is_complete_observation=True,
        )
        for entry in logged
    ]
    records += [
        SurplusObservation(
            donor_id=offer.donor_id,
            donor_type=donors[offer.donor_id].type,
            date=service_date(offer.available_from).isoformat(),
            interval_start=offer.available_from,
            interval_end=offer.pickup_deadline,
            observed_quantity=offer.quantity_kg,
        )
        for offer in sorted(offers, key=lambda o: (o.donor_id, o.available_from, o.id))
        if (offer.donor_id, service_date(offer.available_from).isoformat()) not in confirmed_days
    ]
    return sorted(records, key=lambda r: (r.donor_id, r.date, r.interval_start))
