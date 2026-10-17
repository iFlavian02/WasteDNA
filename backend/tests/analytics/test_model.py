from __future__ import annotations

from copy import deepcopy
from datetime import date

import numpy as np
import pandas as pd
import pytest

import app.analytics.model as model_module
from app.analytics.model import (
    MAX_SHAP_BACKGROUND_ROWS,
    MAX_SHAP_EXPLANATION_ROWS,
    analyze_model,
    deserialize_model_artifacts,
    serialize_model_artifacts,
)
from app.contracts.analytics import ExplanationAvailability


def _model_rows(
    *,
    days: int = 90,
    anomaly: bool = True,
    unknown_test_dish: bool = True,
) -> pd.DataFrame:
    records: list[dict] = []
    for day_number, timestamp in enumerate(
        pd.date_range("2025-01-01", periods=days)
    ):
        for dish_id, category, unit_cost in (
            ("dish-01", "soup", 5.0),
            ("dish-02", "main", 8.0),
        ):
            for time_slot in ("lunch", "dinner"):
                unsold = 2 if dish_id == "dish-01" else 3
                unsold += 2 if time_slot == "dinner" else 0
                unsold += 1 if timestamp.dayofweek == 4 else 0
                if anomaly and day_number == 85 and dish_id == "dish-01" and time_slot == "dinner":
                    unsold = 16
                records.append(
                    {
                        "date": timestamp.date(),
                        "dish_id": dish_id,
                        "dish_name": dish_id,
                        "category": category,
                        "time_slot": time_slot,
                        "prepared_qty": 20,
                        "sold_qty": 20 - unsold,
                        "unit_cost_ron": unit_cost,
                        "surplus": 999,
                        "unsold_rate": 0.99,
                        "latent_D": 999,
                        "generator_truth": "must-not-be-used",
                    }
                )
        if unknown_test_dish and day_number >= 72:
            records.append(
                {
                    "date": timestamp.date(),
                    "dish_id": "dish-new",
                    "dish_name": "Late dish",
                    "category": "late-category",
                    "time_slot": "lunch",
                    "prepared_qty": 20,
                    "sold_qty": 15,
                    "unit_cost_ron": 6.0,
                    "surplus": 999,
                    "unsold_rate": 0.99,
                    "latent_D": 999,
                    "generator_truth": "must-not-be-used",
                }
            )
    return pd.DataFrame(records)


def _context(days: int = 90) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.date_range("2025-01-01", periods=days).date,
            "rain_bin": ["dry", "rain"] * (days // 2) + ["dry"] * (days % 2),
            "temperature_mean_c": [10.0 + day % 10 for day in range(days)],
            "generator_truth": ["ignored"] * days,
        }
    )


@pytest.fixture(scope="module")
def fitted_result():
    rows = _model_rows()
    context = _context()
    original_rows = deepcopy(rows)
    original_context = deepcopy(context)

    result = analyze_model(rows, context)

    pd.testing.assert_frame_equal(rows, original_rows)
    pd.testing.assert_frame_equal(context, original_context)
    return result


def test_temporal_partitions_are_disjoint_and_ordered(fitted_result):
    artifacts = fitted_result.artifacts
    train = set(artifacts.train_dates)
    calibration = set(artifacts.calibration_dates)
    test = set(artifacts.test_dates)

    assert len(train) == 54
    assert len(calibration) == 18
    assert len(test) == 18
    assert train.isdisjoint(calibration)
    assert train.isdisjoint(test)
    assert calibration.isdisjoint(test)
    assert max(train) < min(calibration) < max(calibration) < min(test)


def test_features_exclude_post_sale_values_and_fit_categories_on_train_only(
    fitted_result,
):
    artifacts = fitted_result.artifacts
    forbidden = {
        "sold_qty",
        "surplus",
        "unsold_rate",
        "unit_cost_ron",
        "latent_D",
        "generator_truth",
    }
    assert forbidden.isdisjoint(artifacts.feature_columns)

    encoder = artifacts.preprocessor.named_transformers_["categorical"].named_steps[
        "onehot"
    ]
    dish_categories = set(encoder.categories_[0])
    assert "dish-new" not in dish_categories
    assert np.isfinite(artifacts.test_model_predictions).all()


def test_stored_predictions_reproduce_public_metrics(fitted_result):
    artifacts = fitted_result.artifacts
    model_mae = np.mean(
        np.abs(artifacts.test_actual_rates - artifacts.test_model_predictions)
    ) * 100
    baseline_mae = np.mean(
        np.abs(artifacts.test_actual_rates - artifacts.test_baseline_predictions)
    ) * 100

    assert fitted_result.evaluation.mae_model_pp == pytest.approx(model_mae)
    assert fitted_result.evaluation.mae_baseline_pp == pytest.approx(baseline_mae)


def test_shap_is_bounded_and_additive(fitted_result):
    shap_artifacts = fitted_result.artifacts.shap

    assert shap_artifacts is not None
    assert shap_artifacts.background_rows <= MAX_SHAP_BACKGROUND_ROWS
    assert len(shap_artifacts.explained_row_keys) <= MAX_SHAP_EXPLANATION_ROWS
    reconstructed = shap_artifacts.values.sum(axis=1) + shap_artifacts.base_values
    np.testing.assert_allclose(
        reconstructed,
        shap_artifacts.model_predictions,
        atol=1e-5,
    )
    assert fitted_result.explanations.status == ExplanationAvailability.ready
    assert all(factor.method == "SHAP" for factor in fitted_result.explanations.factors)


def test_anomaly_recovery_has_no_false_alarms_on_stable_rows(monkeypatch):
    def fail_explanations(**kwargs):
        raise RuntimeError("skip SHAP for focused anomaly test")

    monkeypatch.setattr(model_module, "_compute_shap_explanations", fail_explanations)
    clean = analyze_model(_model_rows(anomaly=False), _context())
    planted = analyze_model(_model_rows(anomaly=True), _context())

    assert clean.anomalies == []
    assert [(item.date, item.dish_id, item.time_slot) for item in planted.anomalies] == [
        (date(2025, 3, 27), "dish-01", "dinner")
    ]


def test_explanation_failure_preserves_evaluation_and_anomalies(monkeypatch):
    def fail_explanations(**kwargs):
        raise RuntimeError("simulated SHAP failure")

    monkeypatch.setattr(model_module, "_compute_shap_explanations", fail_explanations)

    result = analyze_model(_model_rows(), _context())

    assert result.status == "ready"
    assert result.evaluation is not None
    assert result.anomalies
    assert result.explanations.status == ExplanationAvailability.unavailable
    assert result.explanations.factors == []
    assert result.artifacts.shap is None
    assert any("explanations are unavailable" in text for text in result.limitations)


def test_artifacts_round_trip_without_entering_public_payload(fitted_result):
    payload = serialize_model_artifacts(fitted_result.artifacts)
    restored = deserialize_model_artifacts(payload)

    assert restored.pipeline_version == fitted_result.artifacts.pipeline_version
    assert restored.feature_columns == fitted_result.artifacts.feature_columns
    np.testing.assert_allclose(
        restored.test_model_predictions,
        fitted_result.artifacts.test_model_predictions,
    )
    assert "artifacts" not in fitted_result.model_dump(mode="json")


def test_fewer_than_sixty_days_is_insufficient_data():
    result = analyze_model(
        _model_rows(days=59, anomaly=False, unknown_test_dish=False),
        _context(days=59),
    )

    assert result.status == "insufficient_data"
    assert result.evaluation is None
    assert result.anomalies == []
    assert result.explanations.status == ExplanationAvailability.unavailable
    assert result.artifacts is None
