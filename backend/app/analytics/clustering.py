"""Deterministic exploratory clustering of per-dish waste profiles."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from app.contracts.analytics import ClusterCenter, ClusterItem, ClustersResult
from app.contracts.common import ComponentState


MIN_CLUSTER_DAYS = 30
MIN_CLUSTER_DISHES = 8
MIN_K = 2
MAX_K = 4
CLUSTER_SEED = 42
_FEATURES = (
    "unsold_rate",
    "daily_variation",
    "dinner_share",
    "mean_prepared_portions",
)
_REQUIRED_COLUMNS = {
    "date",
    "dish_id",
    "time_slot",
    "prepared_qty",
    "sold_qty",
}
_INSUFFICIENT = (
    "Clustering requires at least 30 days and 8 eligible dishes with "
    "non-constant profiles and no accepted singleton clusters."
)


def cluster_profiles(rows: pd.DataFrame) -> ClustersResult:
    """Group supported dish profiles with standardized deterministic KMeans.

    Profiles contain weighted unsold rate, population variation of daily
    unsold rates, dinner share of preparation, and mean daily preparation.
    Cluster centers are reported back in those original units. Inputs are not
    mutated and labels describe similarity only, never a cause.
    """

    frame = _prepare_rows(rows)
    profiles = _dish_profiles(frame)
    if len(profiles) < MIN_CLUSTER_DISHES:
        return _insufficient()

    matrix = profiles.loc[:, _FEATURES].to_numpy(dtype=float)
    if np.all(np.ptp(matrix, axis=0) <= np.finfo(float).eps):
        return _insufficient()

    standardized = StandardScaler().fit_transform(matrix)
    selected = _select_partition(standardized)
    if selected is None:
        return _insufficient()

    labels, selected_k, silhouette = selected
    centers_reference = profiles.loc[:, _FEATURES].median()
    items: list[ClusterItem] = []
    for cluster_number in range(selected_k):
        member_mask = labels == cluster_number
        members = profiles.loc[member_mask].sort_values("dish_id", kind="mergesort")
        member_ids = members["dish_id"].astype(str).tolist()
        center = members.loc[:, _FEATURES].mean()
        items.append(
            ClusterItem(
                id=_cluster_id(member_ids),
                label=_cluster_label(center, centers_reference),
                member_dish_ids=member_ids,
                member_count=len(member_ids),
                support_days=int(members["support_days"].min()),
                center=ClusterCenter(
                    unsold_rate=_rounded(center["unsold_rate"]),
                    daily_variation=_rounded(center["daily_variation"]),
                    dinner_share=_rounded(center["dinner_share"]),
                    mean_prepared_portions=_rounded(
                        center["mean_prepared_portions"]
                    ),
                ),
            )
        )

    items.sort(key=lambda item: tuple(item.member_dish_ids))
    return ClustersResult(
        status=ComponentState.ready,
        items=items,
        limitations=[
            (
                f"Exploratory KMeans selected k={selected_k} by silhouette "
                f"({silhouette:.3f}) after standardizing four dish-profile features."
            ),
            "Cluster labels describe similar profiles and do not establish causes.",
            "A recurring dish profile is separate from any punctual residual anomaly.",
        ],
    )


def _prepare_rows(rows: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(rows, pd.DataFrame):
        raise TypeError("rows must be a pandas DataFrame")
    missing = sorted(_REQUIRED_COLUMNS.difference(rows.columns))
    if missing:
        raise ValueError(f"rows is missing required columns: {', '.join(missing)}")

    frame = deepcopy(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    if frame["date"].isna().any():
        raise ValueError("rows contains missing dates")
    if frame["dish_id"].isna().any() or (
        frame["dish_id"].astype(str).str.strip() == ""
    ).any():
        raise ValueError("dish_id must be non-empty")

    for column in ("prepared_qty", "sold_qty"):
        if not pd.api.types.is_numeric_dtype(frame[column]):
            raise ValueError(f"rows column {column} must be numeric")
        if not np.isfinite(frame[column].to_numpy(dtype=float)).all():
            raise ValueError(f"rows column {column} must contain finite values")
    if (frame[["prepared_qty", "sold_qty"]] < 0).any().any():
        raise ValueError("prepared_qty and sold_qty must be non-negative")
    if (frame["sold_qty"] > frame["prepared_qty"]).any():
        raise ValueError("sold_qty must not exceed prepared_qty")

    frame["dish_id"] = frame["dish_id"].astype(str)
    frame["time_slot"] = frame["time_slot"].astype(str)
    frame["_unsold_qty"] = frame["prepared_qty"] - frame["sold_qty"]
    return frame.sort_values(
        ["dish_id", "date", "time_slot"], kind="mergesort"
    ).reset_index(drop=True)


def _dish_profiles(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=("dish_id", "support_days", *_FEATURES))

    daily = (
        frame.groupby(["dish_id", "date"], sort=True, as_index=False)[
            ["prepared_qty", "sold_qty", "_unsold_qty"]
        ]
        .sum()
        .sort_values(["dish_id", "date"], kind="mergesort")
    )
    daily = daily.loc[daily["prepared_qty"] > 0].copy()
    daily["_daily_unsold_rate"] = daily["_unsold_qty"] / daily["prepared_qty"]
    dinner_prepared = (
        frame.loc[frame["time_slot"] == "dinner"]
        .groupby("dish_id", sort=True)["prepared_qty"]
        .sum()
    )

    profiles: list[dict[str, float | int | str]] = []
    for dish_id, dish_daily in daily.groupby("dish_id", sort=True):
        support_days = int(dish_daily["date"].nunique())
        total_prepared = float(dish_daily["prepared_qty"].sum())
        if support_days < MIN_CLUSTER_DAYS or total_prepared <= 0:
            continue
        profiles.append(
            {
                "dish_id": str(dish_id),
                "support_days": support_days,
                "unsold_rate": float(dish_daily["_unsold_qty"].sum())
                / total_prepared,
                "daily_variation": float(
                    dish_daily["_daily_unsold_rate"].std(ddof=0)
                ),
                "dinner_share": float(dinner_prepared.get(dish_id, 0.0))
                / total_prepared,
                "mean_prepared_portions": float(
                    dish_daily["prepared_qty"].mean()
                ),
            }
        )
    return pd.DataFrame(profiles, columns=("dish_id", "support_days", *_FEATURES))


def _select_partition(
    standardized: np.ndarray,
) -> tuple[np.ndarray, int, float] | None:
    candidates: list[tuple[float, int, np.ndarray]] = []
    distinct_profiles = len(np.unique(standardized, axis=0))
    maximum = min(MAX_K, len(standardized) - 1, distinct_profiles)
    for k in range(MIN_K, maximum + 1):
        labels = KMeans(
            n_clusters=k,
            random_state=CLUSTER_SEED,
            n_init=20,
        ).fit_predict(standardized)
        counts = np.bincount(labels, minlength=k)
        if len(np.unique(labels)) != k or np.any(counts < 2):
            continue
        score = float(silhouette_score(standardized, labels))
        if not np.isfinite(score) or score <= 0:
            continue
        candidates.append((score, k, labels))

    if not candidates:
        return None
    score, k, labels = sorted(candidates, key=lambda item: (-item[0], item[1]))[0]
    return labels, k, score


def _cluster_id(member_ids: list[str]) -> str:
    canonical = "\n".join(sorted(member_ids)).encode("utf-8")
    return f"cluster-{sha256(canonical).hexdigest()[:16]}"


def _cluster_label(center: pd.Series, reference: pd.Series) -> str:
    unsold = "Lower-unsold" if center["unsold_rate"] <= reference["unsold_rate"] else "Higher-unsold"
    variation = "steadier" if center["daily_variation"] <= reference["daily_variation"] else "more-variable"
    if center["dinner_share"] >= 0.60:
        service = "dinner-heavy"
    elif center["dinner_share"] <= 0.40:
        service = "lunch-heavy"
    else:
        service = "balanced-service"
    return f"{unsold}, {variation}, {service} profiles"


def _insufficient() -> ClustersResult:
    return ClustersResult(
        status=ComponentState.insufficient_data,
        items=[],
        limitations=[_INSUFFICIENT],
    )


def _rounded(value: float, digits: int = 10) -> float:
    return round(float(value), digits)
