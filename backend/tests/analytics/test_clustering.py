from __future__ import annotations

from copy import deepcopy

import pandas as pd
import pytest

from app.analytics.clustering import cluster_profiles


def _profile_rows(
    *,
    days: int = 40,
    dishes: int = 8,
    distinct: bool = True,
    singleton: bool = False,
) -> pd.DataFrame:
    records: list[dict] = []
    for day_number, timestamp in enumerate(
        pd.date_range("2026-01-01", periods=days)
    ):
        for dish_number in range(dishes):
            high = distinct and dish_number >= dishes // 2
            if singleton:
                high = dish_number == dishes - 1
            for time_slot in ("lunch", "dinner"):
                if high:
                    prepared = 30 if time_slot == "dinner" else 10
                    unsold = 13 + day_number % 3 if time_slot == "dinner" else 4
                else:
                    prepared = 10
                    unsold = 1 + (day_number % 2 if distinct else 0)
                records.append(
                    {
                        "date": timestamp.date(),
                        "dish_id": f"dish-{dish_number + 1:02d}",
                        "dish_name": f"Dish {dish_number + 1:02d}",
                        "category": "main",
                        "time_slot": time_slot,
                        "prepared_qty": prepared,
                        "sold_qty": prepared - unsold,
                        "unit_cost_ron": 5.0,
                    }
                )
    return pd.DataFrame(records)


def test_distinct_profiles_are_reproducible_and_report_original_units():
    rows = _profile_rows()
    original = deepcopy(rows)

    first = cluster_profiles(rows)
    shuffled = cluster_profiles(
        rows.sample(frac=1, random_state=987).reset_index(drop=True)
    )

    assert first.status == "ready"
    assert first.model_dump(mode="json") == shuffled.model_dump(mode="json")
    assert len(first.items) == 2
    assert sorted(item.member_count for item in first.items) == [4, 4]
    assert all(item.support_days == 40 for item in first.items)
    assert all(item.center.unsold_rate <= 1 for item in first.items)
    assert all(item.center.dinner_share <= 1 for item in first.items)
    assert all(item.center.mean_prepared_portions > 0 for item in first.items)
    assert len({item.id for item in first.items}) == 2
    pd.testing.assert_frame_equal(rows, original)


@pytest.mark.parametrize(
    "rows",
    [
        _profile_rows(days=29),
        _profile_rows(dishes=7),
        _profile_rows(distinct=False),
    ],
    ids=["fewer-than-30-days", "fewer-than-8-dishes", "constant-profiles"],
)
def test_insufficient_or_constant_profiles_return_explicit_empty_result(rows):
    result = cluster_profiles(rows)

    assert result.status == "insufficient_data"
    assert result.items == []
    assert result.limitations


def test_candidate_partitions_with_singleton_clusters_are_rejected():
    result = cluster_profiles(_profile_rows(singleton=True))

    assert result.status == "insufficient_data"
    assert result.items == []
    assert "singleton" in result.limitations[0]


def test_invalid_quantities_are_rejected_before_fitting():
    rows = _profile_rows()
    rows.loc[0, "sold_qty"] = rows.loc[0, "prepared_qty"] + 1

    with pytest.raises(ValueError, match="sold_qty must not exceed prepared_qty"):
        cluster_profiles(rows)
