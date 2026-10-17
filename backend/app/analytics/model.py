"""Temporally evaluated waste-rate model, explanations, and anomalies."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
from io import BytesIO
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from app.contracts.analytics import (
    AnomalyItem,
    ExplanationAvailability,
    ExplanationFactor,
    ExplanationMethod,
    ExplanationsResult,
    ModelEvaluation,
    ModelResult,
)
from app.contracts.common import ComponentState


MODEL_PIPELINE_VERSION = "waste-rate-gbr-v1"
ARTIFACT_FORMAT_VERSION = 1
MIN_MODEL_DAYS = 60
MAX_SHAP_BACKGROUND_ROWS = 100
MAX_SHAP_EXPLANATION_ROWS = 200
ANOMALY_MAD_MULTIPLIER = 3.5
MIN_ANOMALY_RATE_PP = 5.0
MIN_ANOMALY_COST_RON = 25.0

_TARGET = "unsold_portions / prepared_portions"
_REQUIRED_COLUMNS = {
    "date",
    "dish_id",
    "dish_name",
    "category",
    "time_slot",
    "prepared_qty",
    "sold_qty",
    "unit_cost_ron",
}
_BASE_CATEGORICAL_FEATURES = ("dish_id", "category", "weekday", "time_slot")
_CONTEXT_CATEGORICAL_FEATURES = (
    "rain_bin",
    "event",
    "event_name",
    "event_type",
    "university_state",
)
_CONTEXT_NUMERIC_FEATURES = (
    "temperature_mean_c",
    "temperature_min_c",
    "temperature_max_c",
    "precipitation_mm",
)
_FORBIDDEN_FEATURES = {
    "sold_qty",
    "surplus",
    "unsold_qty",
    "unsold_portions",
    "unsold_rate",
    "cost_surplus",
    "unit_cost_ron",
    "unit_price_ron",
    "stockout_confirmed",
    "latent_D",
    "latent_demand",
    "generator_truth",
}


@dataclass(frozen=True)
class ShapArtifacts:
    """Bounded internal evidence used to verify SHAP additivity."""

    values: np.ndarray
    base_values: np.ndarray
    model_predictions: np.ndarray
    transformed_feature_names: tuple[str, ...]
    explained_row_keys: tuple[str, ...]
    background_rows: int


@dataclass(frozen=True)
class ModelArtifacts:
    """Internal model bundle persisted by Member 1, never returned by the API."""

    pipeline_version: str
    feature_columns: tuple[str, ...]
    categorical_columns: tuple[str, ...]
    numeric_columns: tuple[str, ...]
    train_dates: tuple[date, ...]
    calibration_dates: tuple[date, ...]
    test_dates: tuple[date, ...]
    calibration_actual_rates: np.ndarray
    calibration_model_predictions: np.ndarray
    test_actual_rates: np.ndarray
    test_model_predictions: np.ndarray
    test_baseline_predictions: np.ndarray
    calibration_residual_center: float
    calibration_residual_mad: float
    anomaly_threshold_rate: float
    baseline_by_dish_slot: dict[tuple[str, str], float]
    baseline_global_rate: float
    preprocessor: ColumnTransformer
    estimator: GradientBoostingRegressor
    shap: ShapArtifacts | None


@dataclass(frozen=True)
class _TemporalSplit:
    train_dates: tuple[pd.Timestamp, ...]
    calibration_dates: tuple[pd.Timestamp, ...]
    test_dates: tuple[pd.Timestamp, ...]


def analyze_model(rows: pd.DataFrame, context: pd.DataFrame | None) -> ModelResult:
    """Fit and evaluate a waste-rate model using a strict temporal split.

    The function performs no caching or file access and does not mutate either
    input. Member 1 owns invocation, persistence, and execution state.
    """

    frame = _prepare_frame(rows, context)
    eligible = frame.loc[frame["prepared_qty"] > 0].copy()
    unique_dates = tuple(
        pd.Timestamp(value) for value in sorted(eligible["date"].unique())
    )
    if len(unique_dates) < MIN_MODEL_DAYS:
        return ModelResult(
            status=ComponentState.insufficient_data,
            evaluation=None,
            explanations=ExplanationsResult(
                status=ExplanationAvailability.unavailable,
                target=_TARGET,
                factors=[],
            ),
            anomalies=[],
            limitations=[
                f"Model evaluation requires at least {MIN_MODEL_DAYS} distinct dates "
                "with positive preparation."
            ],
        )

    split = _temporal_split(unique_dates)
    categorical_columns, numeric_columns = _feature_columns(eligible)
    feature_columns = (*categorical_columns, *numeric_columns)
    if _FORBIDDEN_FEATURES.intersection(feature_columns):
        raise AssertionError("forbidden post-sale feature selected")

    train = eligible[eligible["date"].isin(split.train_dates)].copy()
    calibration = eligible[eligible["date"].isin(split.calibration_dates)].copy()
    test = eligible[eligible["date"].isin(split.test_dates)].copy()
    target_train = train["_target_rate"].to_numpy(dtype=float)
    target_calibration = calibration["_target_rate"].to_numpy(dtype=float)
    target_test = test["_target_rate"].to_numpy(dtype=float)

    preprocessor = _build_preprocessor(categorical_columns, numeric_columns)
    transformed_train = preprocessor.fit_transform(train.loc[:, feature_columns])
    estimator = GradientBoostingRegressor(
        n_estimators=80,
        learning_rate=0.05,
        max_depth=2,
        min_samples_leaf=4,
        loss="huber",
        random_state=42,
    )
    estimator.fit(transformed_train, target_train)

    transformed_calibration = preprocessor.transform(
        calibration.loc[:, feature_columns]
    )
    transformed_test = preprocessor.transform(test.loc[:, feature_columns])
    calibration_predictions = np.clip(
        estimator.predict(transformed_calibration), 0.0, 1.0
    )
    test_predictions = np.clip(estimator.predict(transformed_test), 0.0, 1.0)
    baseline_by_key, baseline_global = _fit_baseline(train)
    test_baseline_predictions = _baseline_predictions(
        test, baseline_by_key, baseline_global
    )

    residual_center, residual_mad, anomaly_threshold = _calibration_threshold(
        target_calibration - calibration_predictions
    )
    anomalies = _find_anomalies(
        test,
        test_predictions,
        anomaly_threshold,
        support_days=len(split.calibration_dates),
    )

    shap_artifacts: ShapArtifacts | None = None
    explanation_limitations: list[str] = []
    try:
        explanations, shap_artifacts = _compute_shap_explanations(
            train=train,
            calibration=calibration,
            test=test,
            feature_columns=feature_columns,
            categorical_columns=categorical_columns,
            numeric_columns=numeric_columns,
            preprocessor=preprocessor,
            estimator=estimator,
        )
    except Exception:
        explanations = ExplanationsResult(
            status=ExplanationAvailability.unavailable,
            target=_TARGET,
            factors=[],
        )
        explanation_limitations.append(
            "Model evaluation remains valid, but explanations are unavailable "
            "because the explanation calculation failed."
        )

    evaluation = ModelEvaluation(
        split="temporal",
        train_days=len(split.train_dates),
        calibration_days=len(split.calibration_dates),
        test_days=len(split.test_dates),
        mae_model_pp=_rounded(
            mean_absolute_error(target_test, test_predictions) * 100
        ),
        mae_baseline_pp=_rounded(
            mean_absolute_error(target_test, test_baseline_predictions) * 100
        ),
    )
    artifacts = ModelArtifacts(
        pipeline_version=MODEL_PIPELINE_VERSION,
        feature_columns=feature_columns,
        categorical_columns=categorical_columns,
        numeric_columns=numeric_columns,
        train_dates=tuple(timestamp.date() for timestamp in split.train_dates),
        calibration_dates=tuple(
            timestamp.date() for timestamp in split.calibration_dates
        ),
        test_dates=tuple(timestamp.date() for timestamp in split.test_dates),
        calibration_actual_rates=target_calibration,
        calibration_model_predictions=calibration_predictions,
        test_actual_rates=target_test,
        test_model_predictions=test_predictions,
        test_baseline_predictions=test_baseline_predictions,
        calibration_residual_center=residual_center,
        calibration_residual_mad=residual_mad,
        anomaly_threshold_rate=anomaly_threshold,
        baseline_by_dish_slot=baseline_by_key,
        baseline_global_rate=baseline_global,
        preprocessor=preprocessor,
        estimator=estimator,
        shap=shap_artifacts,
    )
    result = ModelResult(
        status=ComponentState.ready,
        evaluation=evaluation,
        explanations=explanations,
        anomalies=anomalies,
        limitations=[
            "Evaluation uses held-out later dates; model inputs exclude sales, "
            "surplus, costs, and generator truth.",
            "When available, SHAP values describe model associations and do not "
            "establish causation.",
            "Unsold portions do not prove that food was discarded.",
            f"Residual anomalies require at least {MIN_ANOMALY_COST_RON:.0f} RON "
            "of excess unsold cost and a calibration-derived rate threshold.",
            *explanation_limitations,
        ],
    )
    return result.attach_artifacts(artifacts)


def serialize_model_artifacts(artifacts: ModelArtifacts) -> bytes:
    """Serialize trusted internal artifacts for Member 1's private cache."""

    stream = BytesIO()
    joblib.dump(
        {"format_version": ARTIFACT_FORMAT_VERSION, "artifacts": artifacts},
        stream,
        compress=3,
    )
    return stream.getvalue()


def deserialize_model_artifacts(payload: bytes) -> ModelArtifacts:
    """Load artifacts produced locally by :func:`serialize_model_artifacts`.

    Joblib uses pickle semantics. Member 1 must load only bytes created by this
    application, never user-uploaded or otherwise untrusted artifact bytes.
    """

    stored = joblib.load(BytesIO(payload))
    if (
        not isinstance(stored, dict)
        or stored.get("format_version") != ARTIFACT_FORMAT_VERSION
    ):
        raise ValueError("unsupported model artifact format")
    artifacts = stored.get("artifacts")
    if not isinstance(artifacts, ModelArtifacts):
        raise ValueError("invalid model artifact payload")
    return artifacts


def _prepare_frame(rows: pd.DataFrame, context: pd.DataFrame | None) -> pd.DataFrame:
    if not isinstance(rows, pd.DataFrame):
        raise TypeError("rows must be a pandas DataFrame")
    missing = sorted(_REQUIRED_COLUMNS.difference(rows.columns))
    if missing:
        raise ValueError(f"rows is missing required columns: {', '.join(missing)}")

    frame = rows.copy(deep=True)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    for column in ("prepared_qty", "sold_qty", "unit_cost_ron"):
        if not pd.api.types.is_numeric_dtype(frame[column]):
            raise ValueError(f"rows column {column} must be numeric")
        if not np.isfinite(frame[column].to_numpy(dtype=float)).all():
            raise ValueError(f"rows column {column} must contain finite values")
    if (frame["prepared_qty"] < 0).any() or (frame["sold_qty"] < 0).any():
        raise ValueError("prepared_qty and sold_qty must be non-negative")
    if (frame["sold_qty"] > frame["prepared_qty"]).any():
        raise ValueError("sold_qty must not exceed prepared_qty")
    if (frame["unit_cost_ron"] <= 0).any():
        raise ValueError("unit_cost_ron must be greater than zero")

    frame["weekday"] = frame["date"].dt.day_name()
    frame = _join_context(frame, context)
    frame["_unsold_qty"] = frame["prepared_qty"] - frame["sold_qty"]
    frame["_target_rate"] = np.where(
        frame["prepared_qty"] > 0,
        frame["_unsold_qty"] / frame["prepared_qty"],
        np.nan,
    )
    frame["_row_key"] = (
        frame["date"].dt.strftime("%Y-%m-%d")
        + "|"
        + frame["dish_id"].astype(str)
        + "|"
        + frame["time_slot"].astype(str)
    )
    return frame.sort_values(
        ["date", "dish_id", "time_slot"], kind="mergesort"
    ).reset_index(drop=True)


def _join_context(
    frame: pd.DataFrame, context: pd.DataFrame | None
) -> pd.DataFrame:
    if context is None or context.empty:
        return frame
    if not isinstance(context, pd.DataFrame):
        raise TypeError("context must be a pandas DataFrame or None")
    if "date" not in context.columns:
        raise ValueError("context is missing required column: date")
    context_frame = context.copy(deep=True)
    context_frame["date"] = pd.to_datetime(
        context_frame["date"], errors="raise"
    ).dt.normalize()
    if context_frame["date"].duplicated().any():
        raise ValueError("context dates must be unique")
    allowed = set(_CONTEXT_CATEGORICAL_FEATURES + _CONTEXT_NUMERIC_FEATURES)
    join_columns = sorted(
        column
        for column in allowed
        if column in context_frame.columns and column not in frame.columns
    )
    if not join_columns:
        return frame
    return frame.merge(
        context_frame[["date", *join_columns]],
        on="date",
        how="left",
        sort=False,
        validate="many_to_one",
    )


def _temporal_split(unique_dates: tuple[pd.Timestamp, ...]) -> _TemporalSplit:
    count = len(unique_dates)
    train_end = int(count * 0.60)
    calibration_end = train_end + int(count * 0.20)
    return _TemporalSplit(
        train_dates=unique_dates[:train_end],
        calibration_dates=unique_dates[train_end:calibration_end],
        test_dates=unique_dates[calibration_end:],
    )


def _feature_columns(frame: pd.DataFrame) -> tuple[tuple[str, ...], tuple[str, ...]]:
    categorical = tuple(
        column
        for column in (*_BASE_CATEGORICAL_FEATURES, *_CONTEXT_CATEGORICAL_FEATURES)
        if column in frame.columns
    )
    numeric = (
        "prepared_qty",
        *(
            column
            for column in _CONTEXT_NUMERIC_FEATURES
            if column in frame.columns
        ),
    )
    return categorical, numeric


def _build_preprocessor(
    categorical_columns: tuple[str, ...],
    numeric_columns: tuple[str, ...],
) -> ColumnTransformer:
    categorical = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(strategy="most_frequent", keep_empty_features=True),
            ),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    numeric = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(strategy="median", keep_empty_features=True),
            )
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("categorical", categorical, list(categorical_columns)),
            ("numeric", numeric, list(numeric_columns)),
        ],
        remainder="drop",
        sparse_threshold=0,
    )


def _fit_baseline(
    train: pd.DataFrame,
) -> tuple[dict[tuple[str, str], float], float]:
    grouped = train.groupby(["dish_id", "time_slot"], sort=True)[
        "_target_rate"
    ].median()
    by_key = {
        (str(dish_id), str(time_slot)): float(value)
        for (dish_id, time_slot), value in grouped.items()
    }
    return by_key, float(train["_target_rate"].median())


def _baseline_predictions(
    frame: pd.DataFrame,
    by_key: dict[tuple[str, str], float],
    global_rate: float,
) -> np.ndarray:
    return np.asarray(
        [
            by_key.get((str(row.dish_id), str(row.time_slot)), global_rate)
            for row in frame.itertuples(index=False)
        ],
        dtype=float,
    )


def _calibration_threshold(residuals: np.ndarray) -> tuple[float, float, float]:
    center = float(np.median(residuals))
    mad = float(np.median(np.abs(residuals - center)))
    robust_threshold = center + ANOMALY_MAD_MULTIPLIER * 1.4826 * mad
    threshold = max(MIN_ANOMALY_RATE_PP / 100, robust_threshold)
    return center, mad, float(threshold)


def _find_anomalies(
    test: pd.DataFrame,
    predictions: np.ndarray,
    threshold_rate: float,
    support_days: int,
) -> list[AnomalyItem]:
    anomalies: list[AnomalyItem] = []
    for (_, row), predicted_rate in zip(test.iterrows(), predictions, strict=True):
        observed_unsold = float(row["_unsold_qty"])
        expected_unsold = float(predicted_rate) * float(row["prepared_qty"])
        excess_unsold = max(observed_unsold - expected_unsold, 0.0)
        excess_cost = excess_unsold * float(row["unit_cost_ron"])
        residual_rate = float(row["_target_rate"]) - float(predicted_rate)
        if residual_rate <= threshold_rate or excess_cost < MIN_ANOMALY_COST_RON:
            continue
        stable_key = (
            f"{row['date'].date().isoformat()}|{row['dish_id']}|{row['time_slot']}"
        )
        anomaly_id = f"anomaly-{sha256(stable_key.encode()).hexdigest()[:16]}"
        expected_public = _rounded(expected_unsold, digits=6)
        excess_public = _rounded(observed_unsold - expected_public, digits=6)
        anomalies.append(
            AnomalyItem(
                id=anomaly_id,
                date=row["date"].date(),
                dish_id=str(row["dish_id"]),
                time_slot=str(row["time_slot"]),
                observed_unsold_portions=observed_unsold,
                expected_unsold_portions=expected_public,
                excess_unsold_portions=excess_public,
                excess_cost_ron=_rounded(
                    excess_public * float(row["unit_cost_ron"]), digits=2
                ),
                support_days=support_days,
                interpretation=(
                    "Observed unsold portions exceeded the calibration-derived "
                    "residual threshold; this is an alert, not proof of a cause."
                ),
            )
        )
    return sorted(anomalies, key=lambda item: (item.date, item.id))


def _compute_shap_explanations(
    *,
    train: pd.DataFrame,
    calibration: pd.DataFrame,
    test: pd.DataFrame,
    feature_columns: tuple[str, ...],
    categorical_columns: tuple[str, ...],
    numeric_columns: tuple[str, ...],
    preprocessor: ColumnTransformer,
    estimator: GradientBoostingRegressor,
) -> tuple[ExplanationsResult, ShapArtifacts]:
    background = _bounded_rows(train, MAX_SHAP_BACKGROUND_ROWS)
    explain_frame = _bounded_rows(
        pd.concat([calibration, test], ignore_index=True),
        MAX_SHAP_EXPLANATION_ROWS,
    )
    transformed_background = preprocessor.transform(
        background.loc[:, feature_columns]
    )
    transformed_explain = preprocessor.transform(
        explain_frame.loc[:, feature_columns]
    )
    explainer = shap.TreeExplainer(
        estimator,
        data=transformed_background,
        feature_perturbation="interventional",
    )
    values = np.asarray(
        explainer.shap_values(transformed_explain, check_additivity=True),
        dtype=float,
    )
    if values.ndim == 1:
        values = values.reshape(1, -1)
    expected_value = float(np.asarray(explainer.expected_value).reshape(-1)[0])
    base_values = np.full(len(values), expected_value, dtype=float)
    raw_predictions = estimator.predict(transformed_explain)
    if not np.allclose(values.sum(axis=1) + base_values, raw_predictions, atol=1e-5):
        raise RuntimeError("SHAP values failed the additivity check")

    transformed_names = _transformed_feature_names(
        preprocessor, categorical_columns, numeric_columns
    )
    magnitudes = np.mean(np.abs(values), axis=0) * 100
    ordered = sorted(
        range(len(transformed_names)),
        key=lambda index: (-magnitudes[index], transformed_names[index]),
    )
    factors = [
        ExplanationFactor(
            name=transformed_names[index],
            mean_contribution_pp=_rounded(min(float(magnitudes[index]), 100.0)),
            support_rows=len(explain_frame),
            method=ExplanationMethod.shap,
        )
        for index in ordered[:10]
        if magnitudes[index] > 1e-12
    ]
    artifacts = ShapArtifacts(
        values=values,
        base_values=base_values,
        model_predictions=raw_predictions,
        transformed_feature_names=transformed_names,
        explained_row_keys=tuple(explain_frame["_row_key"].astype(str)),
        background_rows=len(background),
    )
    return (
        ExplanationsResult(
            status=ExplanationAvailability.ready,
            target=_TARGET,
            factors=factors,
        ),
        artifacts,
    )


def _bounded_rows(frame: pd.DataFrame, maximum: int) -> pd.DataFrame:
    if len(frame) <= maximum:
        return frame.copy()
    positions = np.linspace(0, len(frame) - 1, maximum, dtype=int)
    return frame.iloc[positions].copy()


def _transformed_feature_names(
    preprocessor: ColumnTransformer,
    categorical_columns: tuple[str, ...],
    numeric_columns: tuple[str, ...],
) -> tuple[str, ...]:
    encoder = preprocessor.named_transformers_["categorical"].named_steps["onehot"]
    categorical_names = [
        f"{column}={category}"
        for column, categories in zip(
            categorical_columns, encoder.categories_, strict=True
        )
        for category in categories
    ]
    return tuple([*categorical_names, *numeric_columns])


def _rounded(value: float, digits: int = 10) -> float:
    return round(float(value), digits)
