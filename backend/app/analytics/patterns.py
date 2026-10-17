"""Deterministic descriptive pattern analysis with comparable baselines."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any

import numpy as np
import pandas as pd

from app.contracts.analytics import (
    PatternItem,
    PatternMetrics,
    PatternsResult,
    PatternSupport,
)
from app.contracts.common import ComponentState


MIN_SUPPORT_DAYS = 12
MIN_SUPPORT_PORTIONS = 100
MAX_CANDIDATES = 120
MAX_RESULTS = 10
BOOTSTRAP_REPLICATES = 500
BOOTSTRAP_SEED = 42
MAX_TOP_OVERLAP = 0.80

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
_BASE_DIMENSIONS = ("dish_id", "category")
_CONTEXT_DIMENSIONS = ("weekday", "time_slot", "rain_bin", "university_state")


@dataclass(frozen=True)
class _Candidate:
    base_dimension: str
    base_value: Any
    context_dimension: str
    context_value: Any


@dataclass(frozen=True)
class _RankedPattern:
    item: PatternItem
    score: float
    covered_rows: frozenset[tuple[str, str, str]]


def analyze_patterns(rows: pd.DataFrame, context: pd.DataFrame | None) -> PatternsResult:
    """Find supported high-unsold associations in validated restaurant rows.

    A dish candidate is compared only with the same dish in other contexts; a
    category candidate is compared only with the same category.  Inputs are
    copied before preparation and are never mutated.
    """

    frame = _prepare_frame(rows, context)
    if frame.empty:
        return PatternsResult(
            status=ComponentState.insufficient_data,
            items=[],
            limitations=["The dataset has no rows to analyze."],
        )
    candidates = _enumerate_candidates(frame)
    calendar_days = int((frame["date"].max() - frame["date"].min()).days) + 1

    ranked: list[_RankedPattern] = []
    for candidate in candidates:
        evaluated = _evaluate_candidate(frame, candidate, calendar_days)
        if evaluated is not None:
            ranked.append(evaluated)

    if not ranked:
        return PatternsResult(
            status=ComponentState.insufficient_data,
            items=[],
            limitations=[
                "No candidate group and comparable baseline both have at least "
                f"{MIN_SUPPORT_DAYS} days and {MIN_SUPPORT_PORTIONS} prepared portions."
            ],
        )

    ranked.sort(
        key=lambda result: (
            -result.score,
            -(result.item.opportunity_ron_per_30_days or 0.0),
            -result.item.effect_pp,
            0 if "dish_id" in result.item.factor else 1,
            result.item.id,
        )
    )
    selected = _deduplicate_top_results(ranked)

    return PatternsResult(
        status=ComponentState.ready,
        items=[result.item for result in selected],
        limitations=[
            "Unsold portions do not prove that food was discarded.",
            "Patterns are associations in the supplied data and do not establish causation.",
            "Overlapping pattern opportunities must not be summed.",
            "Bootstrap intervals are descriptive 95% intervals from day resampling.",
        ],
    )


def _prepare_frame(rows: pd.DataFrame, context: pd.DataFrame | None) -> pd.DataFrame:
    if not isinstance(rows, pd.DataFrame):
        raise TypeError("rows must be a pandas DataFrame")
    missing = sorted(_REQUIRED_COLUMNS.difference(rows.columns))
    if missing:
        raise ValueError(f"rows is missing required columns: {', '.join(missing)}")
    if rows.empty:
        return _empty_prepared_frame(rows)

    frame = rows.copy(deep=True)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    if frame["date"].isna().any():
        raise ValueError("rows contains missing dates")

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
    frame["_row_key"] = list(
        zip(
            frame["date"].dt.strftime("%Y-%m-%d"),
            frame["dish_id"].astype(str),
            frame["time_slot"].astype(str),
            strict=True,
        )
    )
    return frame.sort_values(
        ["date", "dish_id", "time_slot"], kind="mergesort"
    ).reset_index(drop=True)


def _empty_prepared_frame(rows: pd.DataFrame) -> pd.DataFrame:
    frame = rows.copy(deep=True)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["weekday"] = pd.Series(dtype="object")
    frame["_unsold_qty"] = pd.Series(dtype="float64")
    frame["_row_key"] = pd.Series(dtype="object")
    return frame


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

    join_columns = [
        column
        for column in ("rain_bin", "university_state")
        if column in context_frame.columns and column not in frame.columns
    ]
    if not join_columns:
        return frame
    return frame.merge(
        context_frame[["date", *join_columns]],
        on="date",
        how="left",
        validate="many_to_one",
        sort=False,
    )


def _enumerate_candidates(frame: pd.DataFrame) -> list[_Candidate]:
    families: list[list[_Candidate]] = []
    for base_dimension in _BASE_DIMENSIONS:
        base_values = _stable_values(frame[base_dimension])
        for context_dimension in _CONTEXT_DIMENSIONS:
            if context_dimension not in frame.columns:
                continue
            candidates_by_base: list[list[_Candidate]] = []
            for base_value in base_values:
                base_rows = frame[frame[base_dimension] == base_value]
                context_values = _stable_values(base_rows[context_dimension])
                context_values.sort(
                    key=lambda value: (
                        -_selection_unsold_rate(
                            base_rows[base_rows[context_dimension] == value]
                        ),
                        type(value).__name__,
                        str(value),
                    )
                )
                candidates_by_base.append(
                    [
                        _Candidate(
                            base_dimension=base_dimension,
                            base_value=base_value,
                            context_dimension=context_dimension,
                            context_value=context_value,
                        )
                        for context_value in context_values
                    ]
                )
            families.append(_round_robin(candidates_by_base))
    return _round_robin(families)[:MAX_CANDIDATES]


def _round_robin(groups: list[list[_Candidate]]) -> list[_Candidate]:
    """Interleave ordered groups without making output depend on row order."""

    output: list[_Candidate] = []
    for position in range(max((len(group) for group in groups), default=0)):
        output.extend(group[position] for group in groups if position < len(group))
    return output


def _selection_unsold_rate(frame: pd.DataFrame) -> float:
    """Cheap deterministic priority used before the bounded bootstrap search."""

    prepared = float(frame["prepared_qty"].sum())
    if prepared <= 0:
        return -1.0
    return float(frame["_unsold_qty"].sum()) / prepared


def _stable_values(series: pd.Series) -> list[Any]:
    values = {_python_scalar(value) for value in series.dropna().unique()}
    return sorted(values, key=lambda value: (type(value).__name__, str(value)))


def _python_scalar(value: Any) -> Any:
    return value.item() if isinstance(value, np.generic) else value


def _evaluate_candidate(
    frame: pd.DataFrame,
    candidate: _Candidate,
    calendar_days: int,
) -> _RankedPattern | None:
    base_mask = frame[candidate.base_dimension] == candidate.base_value
    context_series = frame[candidate.context_dimension]
    group_mask = base_mask & (context_series == candidate.context_value)
    baseline_mask = base_mask & context_series.notna() & (
        context_series != candidate.context_value
    )
    group = frame.loc[group_mask]
    baseline = frame.loc[baseline_mask]

    if not _has_support(group) or not _has_support(baseline):
        return None

    group_rate = _weighted_unsold_rate(group)
    baseline_rate = _weighted_unsold_rate(baseline)
    effect_rate = group_rate - baseline_rate
    if effect_rate <= 0:
        return None

    effects = _bootstrap_effects(group, baseline, candidate)
    if effects.size:
        lower, upper = np.percentile(effects, [2.5, 97.5]) * 100
        effect_ci_pp: tuple[float, float] | None = (
            _rounded(lower),
            _rounded(upper),
        )
        positive_fraction = float(np.mean(effects > 0))
    else:
        effect_ci_pp = None
        positive_fraction = 1.0

    opportunity = max(0.0, effect_rate) * float(
        (group["prepared_qty"] * group["unit_cost_ron"]).sum()
    )
    opportunity = opportunity / calendar_days * 30
    factor = {
        candidate.base_dimension: candidate.base_value,
        candidate.context_dimension: candidate.context_value,
    }
    pattern_id = _pattern_id(factor)
    item = PatternItem(
        id=pattern_id,
        title=_pattern_title(candidate),
        factor=factor,
        group=PatternMetrics(
            unsold_rate=_rounded(group_rate),
            prepared_portions=_rounded(group["prepared_qty"].sum()),
        ),
        baseline=PatternMetrics(
            unsold_rate=_rounded(baseline_rate),
            prepared_portions=_rounded(baseline["prepared_qty"].sum()),
        ),
        effect_pp=_rounded(effect_rate * 100),
        relative_effect=(
            None
            if baseline_rate == 0
            else _rounded(effect_rate / baseline_rate)
        ),
        support=PatternSupport(
            rows=len(group),
            days=int(group["date"].nunique()),
        ),
        interpretation=(
            "Association in the supplied records against the same "
            f"{candidate.base_dimension.replace('_', ' ')} in other "
            f"{candidate.context_dimension.replace('_', ' ')} values; "
            "this does not establish causation."
        ),
        effect_ci_pp=effect_ci_pp,
        opportunity_ron_per_30_days=_rounded(opportunity),
    )
    return _RankedPattern(
        item=item,
        score=opportunity * positive_fraction,
        covered_rows=frozenset(group["_row_key"]),
    )


def _has_support(frame: pd.DataFrame) -> bool:
    return bool(
        frame["date"].nunique() >= MIN_SUPPORT_DAYS
        and frame["prepared_qty"].sum() >= MIN_SUPPORT_PORTIONS
    )


def _weighted_unsold_rate(frame: pd.DataFrame) -> float:
    prepared = float(frame["prepared_qty"].sum())
    if prepared <= 0:
        raise ValueError("supported pattern groups must have positive preparation")
    return float(frame["_unsold_qty"].sum()) / prepared


def _bootstrap_effects(
    group: pd.DataFrame,
    baseline: pd.DataFrame,
    candidate: _Candidate,
) -> np.ndarray:
    group_daily = _daily_totals(group)
    baseline_daily = _daily_totals(baseline)
    seed_material = json.dumps(
        {
            "seed": BOOTSTRAP_SEED,
            "base_dimension": candidate.base_dimension,
            "base_value": candidate.base_value,
            "context_dimension": candidate.context_dimension,
            "context_value": candidate.context_value,
        },
        sort_keys=True,
        ensure_ascii=True,
        default=str,
    ).encode("utf-8")
    candidate_seed = int.from_bytes(sha256(seed_material).digest()[:8], "big")
    rng = np.random.default_rng(candidate_seed)
    group_prepared = group_daily["prepared_qty"].to_numpy(dtype=float)
    group_unsold = group_daily["_unsold_qty"].to_numpy(dtype=float)
    baseline_prepared = baseline_daily["prepared_qty"].to_numpy(dtype=float)
    baseline_unsold = baseline_daily["_unsold_qty"].to_numpy(dtype=float)
    group_indices = rng.integers(
        0,
        len(group_daily),
        size=(BOOTSTRAP_REPLICATES, len(group_daily)),
    )
    baseline_indices = rng.integers(
        0,
        len(baseline_daily),
        size=(BOOTSTRAP_REPLICATES, len(baseline_daily)),
    )
    sampled_group_prepared = group_prepared[group_indices].sum(axis=1)
    sampled_baseline_prepared = baseline_prepared[baseline_indices].sum(axis=1)
    valid = (sampled_group_prepared > 0) & (sampled_baseline_prepared > 0)
    group_rates = (
        group_unsold[group_indices].sum(axis=1)[valid]
        / sampled_group_prepared[valid]
    )
    baseline_rates = (
        baseline_unsold[baseline_indices].sum(axis=1)[valid]
        / sampled_baseline_prepared[valid]
    )
    return np.asarray(group_rates - baseline_rates, dtype=float)


def _daily_totals(frame: pd.DataFrame) -> pd.DataFrame:
    return (
        frame.groupby("date", sort=True, as_index=False)[
            ["prepared_qty", "_unsold_qty"]
        ]
        .sum()
        .sort_values("date", kind="mergesort")
        .reset_index(drop=True)
    )


def _pattern_id(factor: dict[str, Any]) -> str:
    canonical = json.dumps(
        factor, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str
    ).encode("utf-8")
    return f"pattern-{sha256(canonical).hexdigest()[:16]}"


def _pattern_title(candidate: _Candidate) -> str:
    base_label = candidate.base_dimension.replace("_", " ")
    context_label = candidate.context_dimension.replace("_", " ")
    return (
        f"Higher unsold share for {base_label} {candidate.base_value} "
        f"when {context_label} is {candidate.context_value}"
    )


def _rounded(value: float | int) -> float:
    return round(float(value), 10)


def _deduplicate_top_results(
    ranked: list[_RankedPattern],
) -> list[_RankedPattern]:
    top: list[_RankedPattern] = []
    deferred: list[_RankedPattern] = []
    for result in ranked:
        if len(top) < 3 and not any(
            _coverage_overlap(result.covered_rows, chosen.covered_rows)
            > MAX_TOP_OVERLAP
            for chosen in top
        ):
            top.append(result)
        else:
            deferred.append(result)

    if len(top) < 3:
        return top
    return (top + deferred)[:MAX_RESULTS]


def _coverage_overlap(
    left: frozenset[tuple[str, str, str]],
    right: frozenset[tuple[str, str, str]],
) -> float:
    smaller_size = min(len(left), len(right))
    if smaller_size == 0:
        return 0.0
    return len(left.intersection(right)) / smaller_size
