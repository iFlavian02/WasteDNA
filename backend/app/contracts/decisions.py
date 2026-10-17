"""Public contracts for recommendations, the what-if simulator and forecasts.

The decisions functions return these domain results directly. The platform
wraps them in HTTP component envelopes and owns transport states such as
queued, running and error.
"""

from datetime import date, datetime
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.contracts.common import ComponentState


DomainStatus: TypeAlias = Literal[
    ComponentState.ready,
    ComponentState.insufficient_data,
]
NonEmptyString: TypeAlias = Annotated[str, Field(min_length=1)]
NonNegativeFloat: TypeAlias = Annotated[float, Field(ge=0)]
NonNegativeInt: TypeAlias = Annotated[int, Field(ge=0)]
Rate: TypeAlias = Annotated[float, Field(ge=0, le=1)]
Weekday: TypeAlias = Literal["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TimeSlot: TypeAlias = Literal["lunch", "dinner"]


class DecisionsContract(BaseModel):
    """Strict base model used by all public decisions contracts."""

    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
        str_strip_whitespace=True,
    )


# Recommendations


class RecommendationAction(DecisionsContract):
    """One deterministic action linked to supplied pattern evidence."""

    id: NonEmptyString
    title: NonEmptyString
    description: NonEmptyString
    effort: Literal["low", "medium", "high"]
    evidence_pattern_ids: list[NonEmptyString]
    opportunity_ron_per_30_days: NonNegativeFloat | None = None


class RecommendationsResult(DecisionsContract):
    """Result of ``build_recommendations``. Opportunities must not be summed."""

    status: DomainStatus
    items: list[RecommendationAction] = Field(max_length=3)
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "RecommendationsResult":
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("recommendation ids must be unique")
        if self.status == ComponentState.insufficient_data:
            if any(item.evidence_pattern_ids or item.opportunity_ron_per_30_days is not None for item in self.items):
                raise ValueError("insufficient_data actions have no evidence and null opportunity")
            if not self.limitations:
                raise ValueError("insufficient_data requires a reason in limitations")
        return self


# Simulator


class SimulationSelection(DecisionsContract):
    """Simulator request: one dish, weekday, service and planned quantity."""

    dish_id: NonEmptyString
    weekday: Weekday
    time_slot: TimeSlot
    requested_quantity: NonNegativeInt


class CurvePoint(DecisionsContract):
    """Empirical outcome for one integer production quantity, per service."""

    quantity: NonNegativeInt
    waste_proxy_portions: NonNegativeFloat
    shortage_lower_bound_portions: NonNegativeFloat
    risk_lower_bound: Rate
    production_cost_change_ron_per_service: float


class SimulationResult(DecisionsContract):
    """Result of ``simulate``. The curve is per service, never per month."""

    status: DomainStatus
    selection: SimulationSelection
    support_days: NonNegativeInt
    basis: Literal["dish_weekday_slot", "dish_slot", "none"]
    baseline_quantity: NonNegativeInt | None
    unit_cost_ron: Annotated[float, Field(gt=0)] | None
    selected_point: CurvePoint | None
    curve: list[CurvePoint]
    censored_demand: bool
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_shape(self) -> "SimulationResult":
        if self.status == ComponentState.insufficient_data:
            if (
                self.basis != "none"
                or self.baseline_quantity is not None
                or self.unit_cost_ron is not None
                or self.selected_point is not None
                or self.curve
            ):
                raise ValueError("insufficient_data uses basis 'none', null values and an empty curve")
            if not self.limitations:
                raise ValueError("insufficient_data requires a reason in limitations")
            return self

        if self.basis == "none" or self.baseline_quantity is None or self.unit_cost_ron is None or self.selected_point is None:
            raise ValueError("ready results require basis, baseline_quantity, unit_cost_ron and selected_point")
        if [point.quantity for point in self.curve] != list(range(len(self.curve))):
            raise ValueError("curve must contain every integer quantity from 0 in order")
        top = len(self.curve) - 1
        if self.selection.requested_quantity > top or self.baseline_quantity > top:
            raise ValueError("curve must include requested_quantity and baseline_quantity")
        if self.curve[self.selection.requested_quantity] != self.selected_point:
            raise ValueError("selected_point must equal the curve point at requested_quantity")
        return self


# Surplus forecasts (M2)


class ForecastPoint(DecisionsContract):
    """Predicted surplus for one donor on one future day, in the donor's unit."""

    predicted_for: date
    predicted_quantity: NonNegativeFloat
    lower: NonNegativeFloat | None = None
    upper: NonNegativeFloat | None = None

    @model_validator(mode="after")
    def validate_interval(self) -> "ForecastPoint":
        if (self.lower is None) != (self.upper is None):
            raise ValueError("lower and upper must both be set or both be null")
        if self.lower is not None and self.lower > self.upper:
            raise ValueError("lower must not exceed upper")
        return self


class DonorForecast(DecisionsContract):
    """Forecast, evaluation and provenance for one donor."""

    donor_id: NonEmptyString
    donor_type: NonEmptyString | None = None
    status: DomainStatus
    unit: Literal["kg", "portions"]
    support_days: NonNegativeInt
    excluded_incomplete_days: NonNegativeInt = 0
    model: NonEmptyString | None = None
    baseline: Literal["weekday_median"] = "weekday_median"
    model_mae: NonNegativeFloat | None = None
    baseline_mae: NonNegativeFloat | None = None
    test_days: NonNegativeInt | None = None
    interval_level: Rate | None = None
    interval_coverage_test: Rate | None = None
    predictions: list[ForecastPoint] = Field(default_factory=list)
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_state(self) -> "DonorForecast":
        if self.status == ComponentState.insufficient_data:
            if self.predictions or self.model is not None or self.model_mae is not None or self.baseline_mae is not None:
                raise ValueError("insufficient_data donors have no predictions, model or metrics")
            if not self.limitations:
                raise ValueError("insufficient_data donors require a reason in limitations")
        elif self.model is None or self.model_mae is None or self.baseline_mae is None or not self.predictions:
            raise ValueError("ready donors require model, metrics and predictions")
        return self


class ForecastResult(DecisionsContract):
    """Result of ``forecast_surplus``. Suggestions for coordination, never offers."""

    status: DomainStatus
    generated_at: datetime
    horizon_days: Annotated[int, Field(ge=1, le=60)]
    items: list[DonorForecast] = Field(default_factory=list)
    provenance: NonEmptyString
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "ForecastResult":
        any_ready = any(item.status == ComponentState.ready for item in self.items)
        if (self.status == ComponentState.ready) != any_ready:
            raise ValueError("status is ready exactly when at least one donor forecast is ready")
        if self.status == ComponentState.insufficient_data and not self.limitations:
            raise ValueError("insufficient_data requires a reason in limitations")
        for item in self.items:
            if item.status == ComponentState.ready and len(item.predictions) != self.horizon_days:
                raise ValueError("ready donors have one prediction per horizon day")
        return self
