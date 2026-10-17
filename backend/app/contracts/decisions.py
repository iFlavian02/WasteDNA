"""Public contracts for recommendations, the what-if simulator and forecasts.

The decisions functions return these domain results directly. The platform
wraps them in HTTP component envelopes and owns transport states such as
queued, running and error.
"""

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
