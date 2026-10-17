"""Public contracts for descriptive and model-based waste diagnostics.

The analytics functions return these domain results directly.  The platform is
responsible for wrapping them in HTTP component envelopes and for transport
states such as queued, running, and error.
"""

from datetime import date
from enum import StrEnum
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator

from app.contracts.common import ComponentState


DomainStatus: TypeAlias = Literal[
    ComponentState.ready,
    ComponentState.insufficient_data,
]
NonEmptyString: TypeAlias = Annotated[str, Field(min_length=1)]
NonNegativeFloat: TypeAlias = Annotated[float, Field(ge=0)]
Rate: TypeAlias = Annotated[float, Field(ge=0, le=1)]
PercentagePoints: TypeAlias = Annotated[float, Field(ge=-100, le=100)]
PositiveCount: TypeAlias = Annotated[int, Field(ge=1)]
JsonScalar: TypeAlias = str | int | float | bool


class AnalyticsContract(BaseModel):
    """Strict base model used by all public analytics contracts."""

    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
        str_strip_whitespace=True,
    )


class PatternMetrics(AnalyticsContract):
    """Weighted metrics for a pattern group or its comparable baseline."""

    unsold_rate: Rate
    prepared_portions: NonNegativeFloat
    unsold_over_sales: NonNegativeFloat | None = None


class PatternSupport(AnalyticsContract):
    """Visible support behind a reported pattern."""

    rows: PositiveCount
    days: PositiveCount


class PatternItem(AnalyticsContract):
    """One supported association discovered by the pattern analysis."""

    id: NonEmptyString
    title: NonEmptyString
    factor: dict[NonEmptyString, JsonScalar]
    group: PatternMetrics
    baseline: PatternMetrics
    effect_pp: PercentagePoints
    relative_effect: float | None
    support: PatternSupport
    interpretation: NonEmptyString
    effect_ci_pp: tuple[PercentagePoints, PercentagePoints] | None = None
    opportunity_ron_per_30_days: NonNegativeFloat | None = None

    @model_validator(mode="after")
    def validate_pattern(self) -> "PatternItem":
        if not self.factor:
            raise ValueError("factor must contain at least one condition")
        if self.effect_ci_pp is not None and self.effect_ci_pp[0] > self.effect_ci_pp[1]:
            raise ValueError("effect_ci_pp lower bound must not exceed upper bound")
        return self


class PatternsResult(AnalyticsContract):
    """Result of ``analyze_patterns``."""

    status: DomainStatus
    items: list[PatternItem] = Field(default_factory=list)
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_state(self) -> "PatternsResult":
        if self.status == ComponentState.insufficient_data:
            if self.items:
                raise ValueError("insufficient_data patterns must not contain items")
            if not self.limitations:
                raise ValueError("insufficient_data patterns require a limitation")
        return self


class ModelEvaluation(AnalyticsContract):
    """Held-out temporal evaluation reported in percentage points."""

    split: Literal["temporal"]
    train_days: PositiveCount
    calibration_days: PositiveCount
    test_days: PositiveCount
    mae_model_pp: Annotated[float, Field(ge=0, le=100)]
    mae_baseline_pp: Annotated[float, Field(ge=0, le=100)]


class ExplanationMethod(StrEnum):
    """Methods that may produce public global explanation factors."""

    shap = "SHAP"
    permutation_importance = "permutation_importance"


class ExplanationAvailability(StrEnum):
    """Whether explanation computation completed, independent of findings."""

    ready = "ready"
    unavailable = "unavailable"


class ExplanationFactor(AnalyticsContract):
    """One globally aggregated model explanation factor."""

    name: NonEmptyString
    mean_contribution_pp: PercentagePoints
    support_rows: PositiveCount
    method: ExplanationMethod


class ExplanationsResult(AnalyticsContract):
    """Explanation payload nested in a model result.

    ``ready`` with no factors means the method ran and found nothing reportable;
    ``unavailable`` means explanation computation did not produce a valid output.
    The containing model result can remain ready in the latter case.
    """

    status: ExplanationAvailability
    target: NonEmptyString
    factors: list[ExplanationFactor] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_availability(self) -> "ExplanationsResult":
        if self.status == ExplanationAvailability.unavailable and self.factors:
            raise ValueError("unavailable explanations must not contain factors")
        return self


class AnomalyItem(AnalyticsContract):
    """A positive residual anomaly on a supported restaurant observation."""

    id: NonEmptyString
    date: date
    dish_id: NonEmptyString
    time_slot: NonEmptyString
    observed_unsold_portions: NonNegativeFloat
    expected_unsold_portions: NonNegativeFloat
    excess_unsold_portions: NonNegativeFloat
    excess_cost_ron: NonNegativeFloat
    support_days: PositiveCount
    interpretation: NonEmptyString

    @model_validator(mode="after")
    def validate_excess(self) -> "AnomalyItem":
        residual = max(
            self.observed_unsold_portions - self.expected_unsold_portions,
            0.0,
        )
        if abs(self.excess_unsold_portions - residual) > 1e-6:
            raise ValueError(
                "excess_unsold_portions must equal the positive observed-minus-expected residual"
            )
        return self


class ModelResult(AnalyticsContract):
    """Result of ``analyze_model`` with evaluation and optional findings."""

    _artifacts: Any = PrivateAttr(default=None)

    status: DomainStatus
    evaluation: ModelEvaluation | None
    explanations: ExplanationsResult
    anomalies: list[AnomalyItem] = Field(default_factory=list)
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @property
    def artifacts(self) -> Any:
        """Internal fitted artifacts; excluded from every public serialization."""

        return self._artifacts

    def attach_artifacts(self, artifacts: Any) -> "ModelResult":
        """Attach a fitted artifact bundle without changing the API payload."""

        self._artifacts = artifacts
        return self

    @model_validator(mode="after")
    def validate_state(self) -> "ModelResult":
        if self.status == ComponentState.insufficient_data:
            if self.evaluation is not None:
                raise ValueError("insufficient_data model must not contain evaluation metrics")
            if self.explanations.status != ExplanationAvailability.unavailable:
                raise ValueError("insufficient_data model explanations must be unavailable")
            if self.anomalies:
                raise ValueError("insufficient_data model must not contain anomalies")
            if not self.limitations:
                raise ValueError("insufficient_data model requires a limitation")
        elif self.evaluation is None:
            raise ValueError("ready model requires evaluation metrics")
        return self


class ClusterCenter(AnalyticsContract):
    """Cluster center transformed back to interpretable source units."""

    unsold_rate: Rate
    daily_variation: NonNegativeFloat
    dinner_share: Rate
    mean_prepared_portions: NonNegativeFloat


class ClusterItem(AnalyticsContract):
    """One non-singleton group of similar dish profiles."""

    id: NonEmptyString
    label: NonEmptyString
    member_dish_ids: Annotated[list[NonEmptyString], Field(min_length=2)]
    member_count: Annotated[int, Field(ge=2)]
    support_days: PositiveCount
    center: ClusterCenter

    @model_validator(mode="after")
    def validate_members(self) -> "ClusterItem":
        if len(set(self.member_dish_ids)) != len(self.member_dish_ids):
            raise ValueError("member_dish_ids must be unique")
        if self.member_count != len(self.member_dish_ids):
            raise ValueError("member_count must match member_dish_ids")
        return self


class ClustersResult(AnalyticsContract):
    """Result of ``cluster_profiles``."""

    status: DomainStatus
    items: list[ClusterItem] = Field(default_factory=list)
    limitations: list[NonEmptyString] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_state(self) -> "ClustersResult":
        if self.status == ComponentState.insufficient_data:
            if self.items:
                raise ValueError("insufficient_data clusters must not contain items")
            if not self.limitations:
                raise ValueError("insufficient_data clusters require a limitation")
        return self
