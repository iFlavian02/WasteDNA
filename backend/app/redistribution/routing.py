"""Feasible pickup route for one organization's reservations.

Deterministic cheapest-insertion heuristic, not an optimizer: candidates are
taken by earliest pickup deadline (then ID) and each is inserted at the
feasible position with the smallest total duration. Travel times come from a
simulated duration function (haversine distance × road factor at a fixed
speed); they are not live traffic estimates. Planning never changes
reservation state; replan after a cancellation or expiry.
"""

import hashlib
import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.redistribution.geo import distance_km, is_open_at, local
from app.redistribution.schemas import ExcludedReservation, Location, Offer, Organization, RoutePlan, RoutePlanRequest, RouteStop

STOP_MINUTES = 10
SIMULATED_SPEED_KMH = 25.0
ROAD_FACTOR = 1.3

DurationFn = Callable[[Location, Location], float | None]


def simulated_minutes(a: Location, b: Location) -> float:
    """Simulated travel time in whole minutes (demo matrix)."""
    return float(math.ceil(distance_km(a, b) * ROAD_FACTOR / SIMULATED_SPEED_KMH * 60))


@dataclass(frozen=True)
class Candidate:
    reservation_id: str
    offer: Offer


@dataclass(frozen=True)
class Schedule:
    stops: list[RouteStop]
    arrival: datetime
    minutes: float


class _Infeasible(Exception):
    def __init__(self, reason: str):
        self.reason = reason


def _simulate(order: list[Candidate], request: RoutePlanRequest, org: Organization, duration: DurationFn) -> Schedule:
    clock, here, load, stops = local(request.departure_at), request.start_location, 0.0, []
    for candidate in order:
        offer = candidate.offer
        travel = duration(here, offer.location)
        if travel is None:
            raise _Infeasible("No travel time available for this stop")
        arrival = max(clock + timedelta(minutes=travel), offer.available_from)
        if arrival > offer.pickup_deadline:
            raise _Infeasible("Pickup deadline cannot be met")
        load += offer.quantity_kg
        if load > request.vehicle_capacity_kg + 1e-9:
            raise _Infeasible("Vehicle capacity exceeded")
        clock = arrival + timedelta(minutes=STOP_MINUTES)
        stops.append(RouteStop(
            reservation_id=candidate.reservation_id, offer_id=offer.id, location=offer.location,
            estimated_arrival=arrival, estimated_departure=clock, quantity_kg=offer.quantity_kg, load_after_kg=round(load, 3),
        ))
        here = offer.location
    travel = duration(here, request.destination)
    if travel is None:
        raise _Infeasible("No travel time available to the destination")
    arrival = clock + timedelta(minutes=travel)
    if any(arrival > c.offer.pickup_deadline for c in order):
        raise _Infeasible("Food would reach the organization after its pickup deadline")
    if not is_open_at(org, arrival):
        raise _Infeasible("Organization is closed at the estimated arrival")
    return Schedule(stops, arrival, (arrival - local(request.departure_at)).total_seconds() / 60)


def plan_route(
    request: RoutePlanRequest,
    org: Organization,
    candidates: list[Candidate],
    rejected: list[ExcludedReservation],
    duration: DurationFn = simulated_minutes,
) -> RoutePlan:
    """`candidates` are active reservations of `org`; `rejected` are requested
    reservations already excluded by the caller (unknown, inactive, other org)."""
    excluded = list(rejected)
    route: list[Candidate] = []
    best: Schedule | None = None
    for candidate in sorted(candidates, key=lambda c: (c.offer.pickup_deadline, c.reservation_id)):
        missing = sorted(set(candidate.offer.storage_requirements) - set(org.storage_capabilities))
        if missing:
            excluded.append(ExcludedReservation(reservation_id=candidate.reservation_id, reasons=[f"Incompatible storage: {', '.join(missing)}"]))
            continue
        options, reasons = [], []
        for position in range(len(route) + 1):
            order = route[:position] + [candidate] + route[position:]
            try:
                options.append((_simulate(order, request, org, duration).minutes, position, order))
            except _Infeasible as problem:
                reasons.append(problem.reason)
        if options:
            _, _, route = min(options, key=lambda option: (option[0], option[1]))
            continue
        try:
            _simulate([candidate], request, org, duration)
            reason = "Does not fit with the stops already planned (time or capacity)"
        except _Infeasible as problem:
            reason = problem.reason
        excluded.append(ExcludedReservation(reservation_id=candidate.reservation_id, reasons=[reason]))
    if route:
        best = _simulate(route, request, org, duration)

    fingerprint = request.model_dump_json() + "|" + ",".join(c.reservation_id for c in route)
    return RoutePlan(
        route_id="route-" + hashlib.sha256(fingerprint.encode()).hexdigest()[:16],
        organization_id=org.id,
        stops=best.stops if best else [],
        arrival_at_destination=best.arrival if best else None,
        total_quantity_kg=round(sum(c.offer.quantity_kg for c in route), 3),
        excluded=sorted(excluded, key=lambda item: item.reservation_id),
        limitations=[
            "Travel times are simulated from straight-line distance; they are not live traffic estimates.",
            "Deterministic insertion heuristic: feasible, not guaranteed optimal.",
            "Planning does not change reservations; replan after a cancellation or expiry.",
        ],
    )
