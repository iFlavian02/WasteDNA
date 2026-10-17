"""Per-donor daily surplus forecasts from confirmed, complete history.

Pure calculation: reads the supplied history only, writes nothing and never
creates offers, reservations or route stops. Only complete observations count;
missing days stay missing and are never treated as zero surplus.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import mean, median
from typing import Iterable

import numpy as np

from app.contracts.common import ComponentState
from app.contracts.decisions import DonorForecast, ForecastPoint, ForecastResult
from app.redistribution.schemas import SurplusObservation

MIN_COMPLETE_DAYS = 60
TRAIN_FRACTION = 0.6
CALIBRATION_FRACTION = 0.2
RECENT_LEVEL_DAYS = 28
INTERVAL_LEVEL = 0.8
BASELINE = "weekday_median"
MODEL = "weekday_profile_recent_level"

PROVENANCE = (
    "Daily totals per donor from complete confirmed surplus observations. Temporal split by date: "
    f"{TRAIN_FRACTION:.0%} train, {CALIBRATION_FRACTION:.0%} calibration (method choice and empirical interval), "
    f"{1 - TRAIN_FRACTION - CALIBRATION_FRACTION:.0%} test (reported MAE). Final forecasts refit on all complete days."
)
LIMITS = [
    "Forecasts are suggestions for planning pickups; they are not offers and cannot be reserved.",
    "Predictions use only history recorded before the forecast period.",
]

Series = list[tuple[date, float]]


def forecast_surplus(
    history: Iterable[SurplusObservation],
    horizon_days: int,
    *,
    generated_at: datetime | None = None,
) -> ForecastResult:
    """Forecast daily surplus per donor for ``horizon_days`` after the latest history date."""
    records = list(history)
    generated_at = generated_at or datetime.now(timezone.utc)
    if not records:
        return ForecastResult(
            status=ComponentState.insufficient_data,
            generated_at=generated_at,
            horizon_days=horizon_days,
            items=[],
            provenance=PROVENANCE,
            limitations=["No surplus history was supplied."],
        )

    start = max(date.fromisoformat(record.date) for record in records) + timedelta(days=1)
    by_donor: dict[str, list[SurplusObservation]] = defaultdict(list)
    for record in records:
        by_donor[record.donor_id].append(record)
    items = [_forecast_donor(donor_id, by_donor[donor_id], start, horizon_days) for donor_id in sorted(by_donor)]

    ready = any(item.status == ComponentState.ready for item in items)
    limitations = list(LIMITS)
    if not ready:
        limitations.insert(0, f"No donor has at least {MIN_COMPLETE_DAYS} days of complete surplus observations.")
    return ForecastResult(
        status=ComponentState.ready if ready else ComponentState.insufficient_data,
        generated_at=generated_at,
        horizon_days=horizon_days,
        items=items,
        provenance=PROVENANCE,
        limitations=limitations,
    )


def _forecast_donor(donor_id: str, records: list[SurplusObservation], start: date, horizon: int) -> DonorForecast:
    donor_type = str(records[0].donor_type) if getattr(records[0], "donor_type", None) else None
    units = {record.unit for record in records}
    unit = sorted(units)[0]
    if len(units) > 1:
        return _insufficient(donor_id, donor_type, unit, 0, 0, f"History mixes units ({', '.join(sorted(units))}); no conversion is assumed.")

    totals: dict[date, float] = defaultdict(float)
    complete: dict[date, bool] = defaultdict(lambda: True)
    for record in records:
        day = date.fromisoformat(record.date)
        totals[day] += record.observed_quantity
        complete[day] = complete[day] and record.is_complete_observation
    series = sorted((day, totals[day]) for day in totals if complete[day])
    excluded = sum(1 for day in totals if not complete[day])

    if len(series) < MIN_COMPLETE_DAYS:
        reason = f"Only {len(series)} days of complete observations (minimum {MIN_COMPLETE_DAYS})."
        if excluded:
            reason += f" {excluded} days with incomplete records (for example offers only) were excluded; offers do not show total surplus."
        return _insufficient(donor_id, donor_type, unit, len(series), excluded, reason)

    train, calibration, test = _split(series)
    method, quantiles = _choose_method(train, calibration)
    fit_eval = train + calibration
    model_mae = _mae(test, _predict(method, fit_eval, [d for d, _ in test]))
    baseline_mae = _mae(test, _predict(BASELINE, fit_eval, [d for d, _ in test]))
    coverage = _coverage(test, _predict(method, fit_eval, [d for d, _ in test]), quantiles)

    future = [start + timedelta(days=offset) for offset in range(horizon)]
    predictions = [
        ForecastPoint(
            predicted_for=day,
            predicted_quantity=round(value, 3),
            lower=round(max(0.0, value + quantiles[0]), 3),
            upper=round(max(0.0, value + quantiles[1]), 3),
        )
        for day, value in zip(future, _predict(method, series, future), strict=True)
    ]
    limitations = []
    if method == BASELINE:
        limitations.append("The weekday median baseline beat the model on calibration days, so the baseline is published.")
    if excluded:
        limitations.append(f"{excluded} days with incomplete records were excluded.")
    return DonorForecast(
        donor_id=donor_id,
        donor_type=donor_type,
        status=ComponentState.ready,
        unit=unit,
        support_days=len(series),
        excluded_incomplete_days=excluded,
        model=method,
        model_mae=round(model_mae, 3),
        baseline_mae=round(baseline_mae, 3),
        test_days=len(test),
        interval_level=INTERVAL_LEVEL,
        interval_coverage_test=round(coverage, 3),
        predictions=predictions,
        limitations=limitations,
    )


def _insufficient(donor_id, donor_type, unit, support, excluded, reason) -> DonorForecast:
    return DonorForecast(
        donor_id=donor_id,
        donor_type=donor_type,
        status=ComponentState.insufficient_data,
        unit=unit,
        support_days=support,
        excluded_incomplete_days=excluded,
        limitations=[reason],
    )


def _split(series: Series) -> tuple[Series, Series, Series]:
    n = len(series)
    train_end = int(n * TRAIN_FRACTION)
    calibration_end = train_end + int(n * CALIBRATION_FRACTION)
    return series[:train_end], series[train_end:calibration_end], series[calibration_end:]


def _choose_method(train: Series, calibration: Series) -> tuple[str, tuple[float, float]]:
    """Pick the method with lower calibration MAE (ties keep the simpler baseline)."""
    days = [d for d, _ in calibration]
    scores = {name: _mae(calibration, _predict(name, train, days)) for name in (BASELINE, MODEL)}
    method = MODEL if scores[MODEL] < scores[BASELINE] else BASELINE
    residuals = [actual - predicted for (_, actual), predicted in zip(calibration, _predict(method, train, days), strict=True)]
    tail = (1 - INTERVAL_LEVEL) / 2
    lower, upper = np.quantile(residuals, [tail, 1 - tail])
    return method, (float(lower), float(upper))


def _predict(method: str, fit: Series, days: list[date]) -> list[float]:
    values = [value for _, value in fit]
    by_weekday: dict[int, list[float]] = defaultdict(list)
    for day, value in fit:
        by_weekday[day.weekday()].append(value)
    if method == BASELINE:
        fallback = median(values)
        return [median(by_weekday[d.weekday()]) if by_weekday[d.weekday()] else fallback for d in days]
    overall = mean(values)
    level = mean(values[-RECENT_LEVEL_DAYS:])
    predictions = []
    for d in days:
        ratio = mean(by_weekday[d.weekday()]) / overall if overall > 0 and by_weekday[d.weekday()] else 1.0
        predictions.append(max(0.0, level * ratio))
    return predictions


def _mae(actual: Series, predicted: list[float]) -> float:
    return float(mean(abs(value - p) for (_, value), p in zip(actual, predicted, strict=True)))


def _coverage(actual: Series, predicted: list[float], quantiles: tuple[float, float]) -> float:
    inside = [
        max(0.0, p + quantiles[0]) <= value <= max(0.0, p + quantiles[1])
        for (_, value), p in zip(actual, predicted, strict=True)
    ]
    return sum(inside) / len(inside)
