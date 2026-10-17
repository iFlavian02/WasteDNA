"""Strict contracts for optional operational observations."""

from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


NonEmptyString = Annotated[str, Field(min_length=1)]
NonNegativeInt = Annotated[int, Field(ge=0)]
PositiveMoney = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Weekday = Literal[
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


class OperationsContract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class HourlyObservation(OperationsContract):
    date: date
    dish_id: NonEmptyString
    interval_start: datetime
    interval_end: datetime
    prepared_qty: NonNegativeInt
    sold_qty: NonNegativeInt
    discarded_qty: NonNegativeInt | None = None
    donated_qty: NonNegativeInt | None = None
    carried_over_qty: NonNegativeInt | None = None

    @model_validator(mode="after")
    def validate_observation(self) -> "HourlyObservation":
        if self.interval_start.utcoffset() is None or self.interval_end.utcoffset() is None:
            raise ValueError("interval timestamps must include a UTC offset")
        if self.interval_end <= self.interval_start:
            raise ValueError("interval_end must be after interval_start")
        if self.interval_start.date() != self.date or self.interval_end.date() != self.date:
            raise ValueError("interval timestamps must stay inside the observation date")
        if self.sold_qty > self.prepared_qty:
            raise ValueError("sold_qty must not exceed prepared_qty")
        known_destinations = [
            value
            for value in (
                self.discarded_qty,
                self.donated_qty,
                self.carried_over_qty,
            )
            if value is not None
        ]
        if sum(known_destinations) > self.prepared_qty - self.sold_qty:
            raise ValueError("destination quantities must not exceed unsold portions")
        return self


class MenuVersion(OperationsContract):
    dish_id: NonEmptyString
    effective_from: date
    effective_to: date | None = None
    unit_cost_ron: PositiveMoney
    unit_price_ron: PositiveMoney

    @model_validator(mode="after")
    def validate_dates(self) -> "MenuVersion":
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        return self


class OpeningHours(OperationsContract):
    weekday: Weekday
    opens_at: time
    closes_at: time
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def validate_hours(self) -> "OpeningHours":
        if self.closes_at <= self.opens_at:
            raise ValueError("closes_at must be after opens_at")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        return self


class OperationsImport(OperationsContract):
    hourly_observations: Annotated[list[HourlyObservation], Field(max_length=20_000)]
    menu_versions: Annotated[list[MenuVersion], Field(max_length=1_000)] = Field(default_factory=list)
    opening_hours: Annotated[list[OpeningHours], Field(max_length=1_000)] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_non_overlapping_records(self) -> "OperationsImport":
        grouped: dict[tuple[date, str], list[HourlyObservation]] = {}
        for row in self.hourly_observations:
            grouped.setdefault((row.date, row.dish_id), []).append(row)
        for rows in grouped.values():
            ordered = sorted(rows, key=lambda row: row.interval_start)
            if any(current.interval_start < previous.interval_end for previous, current in zip(ordered, ordered[1:])):
                raise ValueError("hourly intervals must not overlap for the same dish and date")
        self._reject_effective_overlap(self.menu_versions, lambda row: row.dish_id, "menu versions")
        self._reject_effective_overlap(self.opening_hours, lambda row: row.weekday, "opening hours")
        return self

    @staticmethod
    def _reject_effective_overlap(rows, key, label: str) -> None:
        grouped = {}
        for row in rows:
            grouped.setdefault(key(row), []).append(row)
        for values in grouped.values():
            ordered = sorted(values, key=lambda row: row.effective_from)
            for previous, current in zip(ordered, ordered[1:]):
                if previous.effective_to is None or current.effective_from <= previous.effective_to:
                    raise ValueError(f"{label} effective periods must not overlap")


class OperationsImportResponse(OperationsContract):
    dataset_id: NonEmptyString
    status: Literal["processing"]
    hourly_observations: NonNegativeInt
    menu_versions: NonNegativeInt
    opening_hours: NonNegativeInt
