"""Public dataset transport envelopes assembled from domain-owned schemas."""

from typing import Any

from pydantic import BaseModel, Field

from app.contracts.common import ComponentState
from app.contracts.analytics import PatternItem, AnomalyItem, ExplanationsResult, ClustersResult
from app.contracts.decisions import RecommendationAction, SimulationResult


class ComponentEnvelope(BaseModel):
    status: ComponentState
    result: Any | None = None
    limitations: list[str] = Field(default_factory=list)


class SimulationEnvelope(BaseModel):
    status: ComponentState
    result: SimulationResult
    limitations: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    dataset_id: str
    source: str
    is_synthetic: bool
    status: str
    components: dict[str, ComponentState]
    summary: dict[str, Any] | None
    patterns: list[PatternItem] | None
    anomalies: list[AnomalyItem] | None
    explanations: ExplanationsResult | None
    recommendations: list[RecommendationAction] | None
    clusters: ClustersResult | None
    limitations: list[str] = Field(default_factory=list)
