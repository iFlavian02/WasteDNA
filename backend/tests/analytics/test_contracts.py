import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.contracts.analytics import (
    ClustersResult,
    ExplanationAvailability,
    ModelResult,
    PatternsResult,
)


FIXTURE_DIR = Path(__file__).resolve().parents[3] / "docs" / "fixtures" / "analytics"


@pytest.mark.parametrize(
    ("filename", "contract"),
    [
        ("patterns_ready.json", PatternsResult),
        ("patterns_insufficient_data.json", PatternsResult),
        ("model_ready.json", ModelResult),
        ("model_insufficient_data.json", ModelResult),
        ("clusters_ready.json", ClustersResult),
        ("clusters_insufficient_data.json", ClustersResult),
    ],
)
def test_analytics_fixtures_validate(filename, contract):
    payload = (FIXTURE_DIR / filename).read_text(encoding="utf-8")

    result = contract.model_validate_json(payload)

    assert result.model_dump(mode="json") == json.loads(payload)


def test_ready_fixture_has_complete_explanation_and_anomaly_fields():
    result = ModelResult.model_validate_json(
        (FIXTURE_DIR / "model_ready.json").read_text(encoding="utf-8")
    )

    assert result.explanations.status == ExplanationAvailability.ready
    assert result.explanations.factors[0].method == "SHAP"
    assert result.evaluation is not None
    assert result.evaluation.train_days == 108
    assert result.anomalies[0].excess_unsold_portions == pytest.approx(10.5)


def test_insufficient_model_cannot_publish_fabricated_metrics():
    payload = json.loads(
        (FIXTURE_DIR / "model_insufficient_data.json").read_text(encoding="utf-8")
    )
    payload["evaluation"] = {
        "split": "temporal",
        "train_days": 1,
        "calibration_days": 1,
        "test_days": 1,
        "mae_model_pp": 0,
        "mae_baseline_pp": 0,
    }

    with pytest.raises(ValidationError, match="must not contain evaluation metrics"):
        ModelResult.model_validate(payload)


def test_ready_model_can_mark_only_explanations_unavailable():
    payload = json.loads((FIXTURE_DIR / "model_ready.json").read_text(encoding="utf-8"))
    payload["explanations"] = {
        "status": "unavailable",
        "target": "unsold_portions / prepared_portions",
        "factors": [],
    }

    result = ModelResult.model_validate(payload)

    assert result.status == "ready"
    assert result.evaluation is not None
    assert result.explanations.status == ExplanationAvailability.unavailable


def test_transport_only_state_is_rejected_by_domain_contract():
    payload = json.loads((FIXTURE_DIR / "patterns_ready.json").read_text(encoding="utf-8"))
    payload["status"] = "running"

    with pytest.raises(ValidationError):
        PatternsResult.model_validate(payload)


def test_cluster_member_count_must_match_unique_member_ids():
    payload = json.loads((FIXTURE_DIR / "clusters_ready.json").read_text(encoding="utf-8"))
    payload["items"][0]["member_count"] = 3

    with pytest.raises(ValidationError, match="must match member_dish_ids"):
        ClustersResult.model_validate(payload)
