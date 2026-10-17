"""Public contracts for surplus redistribution (offers, matching, reservations,
handover, impact and pickup routes).

Field names follow the "Surplus redistribution (M2)" section of docs/API.md.
Weights are kilograms. Timestamps carry an explicit offset and are returned in
Europe/Bucharest time.
"""

from datetime import datetime, time
from enum import StrEnum
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

NonEmptyString: TypeAlias = Annotated[str, Field(min_length=1, max_length=200)]
PositiveKg: TypeAlias = Annotated[float, Field(gt=0, le=100_000)]
NonNegativeKg: TypeAlias = Annotated[float, Field(ge=0)]
Weekday: TypeAlias = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

WEEKDAYS: tuple[str, ...] = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


class RedistributionContract(BaseModel):
    """Strict base model shared by every redistribution contract."""

    model_config = ConfigDict(allow_inf_nan=False, extra="forbid", str_strip_whitespace=True)


def _require_offset(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamp must include a timezone offset")
    return value


class Location(RedistributionContract):
    lat: Annotated[float, Field(ge=-90, le=90)]
    lon: Annotated[float, Field(ge=-180, le=180)]


class DonorType(StrEnum):
    restaurant = "restaurant"
    supermarket = "supermarket"
    household = "household"


class Donor(RedistributionContract):
    id: NonEmptyString
    type: DonorType
    name: NonEmptyString
    location: Location


class TimeWindow(RedistributionContract):
    """A local (Europe/Bucharest) opening interval within one day."""

    open: time
    close: time

    @model_validator(mode="after")
    def _ordered(self) -> "TimeWindow":
        if self.open >= self.close:
            raise ValueError("open must be before close")
        return self


class Organization(RedistributionContract):
    id: NonEmptyString
    name: NonEmptyString
    accepted_categories: list[NonEmptyString]
    excluded_allergens: list[NonEmptyString] = Field(default_factory=list)
    storage_capabilities: list[NonEmptyString]
    daily_capacity_kg: PositiveKg
    opening_hours: dict[Weekday, list[TimeWindow]]
    max_pickup_radius_km: Annotated[float, Field(gt=0)]
    location: Location


class OfferStatus(StrEnum):
    available = "available"
    reserved = "reserved"
    collected = "collected"
    expired = "expired"
    cancelled = "cancelled"


class OfferCreate(RedistributionContract):
    """Request body for POST /offers. `allergens: null` means unknown and
    blocks automatic matching. `location` defaults to the donor's location."""

    donor_id: NonEmptyString
    category: NonEmptyString
    description: Annotated[str, Field(max_length=500)] = ""
    allergens: list[NonEmptyString] | None
    storage_requirements: list[NonEmptyString] = Field(default_factory=list)
    quantity_kg: PositiveKg
    portion_count: Annotated[int, Field(gt=0)] | None = None
    available_from: datetime
    pickup_deadline: datetime
    location: Location | None = None

    _offsets = field_validator("available_from", "pickup_deadline")(_require_offset)

    @field_validator("category")
    @classmethod
    def _lower_category(cls, value: str) -> str:
        return value.lower()

    @field_validator("allergens", "storage_requirements")
    @classmethod
    def _normalize_tags(cls, values: list[str] | None) -> list[str] | None:
        return None if values is None else sorted({value.lower() for value in values})

    @model_validator(mode="after")
    def _window(self) -> "OfferCreate":
        if self.available_from >= self.pickup_deadline:
            raise ValueError("available_from must precede pickup_deadline")
        return self


class Offer(RedistributionContract):
    id: NonEmptyString
    donor_id: NonEmptyString
    category: NonEmptyString
    description: str
    allergens: list[str] | None
    storage_requirements: list[str]
    quantity_kg: PositiveKg
    portion_count: int | None
    available_from: datetime
    pickup_deadline: datetime
    location: Location
    status: OfferStatus
    version: Annotated[int, Field(ge=1)]
    created_at: datetime


class PickupWindow(RedistributionContract):
    from_: datetime = Field(alias="from")
    to: datetime

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class EligibleMatch(RedistributionContract):
    organization_id: NonEmptyString
    distance_km: NonNegativeKg
    capacity_available_kg: NonNegativeKg
    pickup_window: PickupWindow
    reasons: list[str]


class RejectedMatch(RedistributionContract):
    organization_id: NonEmptyString
    reasons: list[str] = Field(min_length=1)


class MatchesResult(RedistributionContract):
    offer_id: NonEmptyString
    method: Literal["rule_based_filters"] = "rule_based_filters"
    eligible: list[EligibleMatch]
    rejected: list[RejectedMatch]


class ReservationStatus(StrEnum):
    reserved = "reserved"
    released = "released"
    cancelled = "cancelled"
    expired = "expired"
    collected = "collected"


class ReservationCreate(RedistributionContract):
    organization_id: NonEmptyString
    offer_version: Annotated[int, Field(ge=1)]
    idempotency_key: Annotated[str, Field(min_length=1, max_length=200)]


class Reservation(RedistributionContract):
    reservation_id: NonEmptyString
    offer_id: NonEmptyString
    organization_id: NonEmptyString
    status: ReservationStatus
    reserved_at: datetime


class HandoverCreate(RedistributionContract):
    received_quantity_kg: PositiveKg
    received_at: datetime
    idempotency_key: Annotated[str, Field(min_length=1, max_length=200)]

    _offset = field_validator("received_at")(_require_offset)


class Handover(RedistributionContract):
    reservation_id: NonEmptyString
    offer_id: NonEmptyString
    organization_id: NonEmptyString
    status: Literal[ReservationStatus.collected] = ReservationStatus.collected
    offered_quantity_kg: PositiveKg
    received_quantity_kg: PositiveKg
    received_at: datetime


class DestinationImpact(RedistributionContract):
    organization_id: NonEmptyString
    handed_over_quantity_kg: NonNegativeKg
    handover_count: Annotated[int, Field(ge=0)]


class ImpactResult(RedistributionContract):
    """Only confirmed handovers count as impact, once per reservation."""

    is_synthetic: bool
    offered_quantity_kg: NonNegativeKg
    reserved_quantity_kg: NonNegativeKg
    handed_over_quantity_kg: NonNegativeKg
    handover_count: Annotated[int, Field(ge=0)]
    destinations: list[DestinationImpact]
    limitations: list[str]


class SessionCreated(RedistributionContract):
    session_id: NonEmptyString
    is_synthetic: bool


class RoutePlanRequest(RedistributionContract):
    organization_id: NonEmptyString
    reservation_ids: list[NonEmptyString] = Field(min_length=1, max_length=25)
    vehicle_capacity_kg: PositiveKg
    departure_at: datetime
    start_location: Location
    destination: Location

    _offset = field_validator("departure_at")(_require_offset)


class RouteStop(RedistributionContract):
    reservation_id: NonEmptyString
    offer_id: NonEmptyString
    location: Location
    estimated_arrival: datetime
    estimated_departure: datetime
    quantity_kg: PositiveKg
    load_after_kg: NonNegativeKg


class ExcludedReservation(RedistributionContract):
    reservation_id: NonEmptyString
    reasons: list[str] = Field(min_length=1)


class RoutePlan(RedistributionContract):
    route_id: NonEmptyString
    organization_id: NonEmptyString
    is_simulated: Literal[True] = True
    method: Literal["deterministic_cheapest_insertion"] = "deterministic_cheapest_insertion"
    stops: list[RouteStop]
    arrival_at_destination: datetime | None
    total_quantity_kg: NonNegativeKg
    excluded: list[ExcludedReservation]
    limitations: list[str]


class SurplusObservation(RedistributionContract):
    """Proposed history record for member 4's forecast_surplus (not yet agreed).

    Built from donor-confirmed offers. Offers do not prove the donor's total
    surplus, so `is_complete_observation` is always False here and days without
    offers are absent, never zero."""

    donor_id: NonEmptyString
    donor_type: DonorType
    date: str
    interval_start: datetime
    interval_end: datetime
    observed_quantity: NonNegativeKg
    unit: Literal["kg"] = "kg"
    is_complete_observation: bool = False
