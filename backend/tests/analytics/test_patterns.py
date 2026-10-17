from __future__ import annotations

from copy import deepcopy

import pandas as pd
import pytest

from app.analytics.patterns import (
    MAX_CANDIDATES,
    _enumerate_candidates,
    _prepare_frame,
    analyze_patterns,
)


def _two_slot_rows(
    *,
    days: int = 12,
    dinner_unsold: int = 3,
    lunch_unsold: int = 2,
) -> pd.DataFrame:
    records = []
    for day_number, date in enumerate(pd.date_range("2026-01-01", periods=days)):
        for slot, unsold in (("dinner", dinner_unsold), ("lunch", lunch_unsold)):
            records.append(
                {
                    "date": date.date(),
                    "dish_id": "dish-01",
                    "dish_name": "Synthetic soup",
                    "category": "soup",
                    "time_slot": slot,
                    "prepared_qty": 10,
                    "sold_qty": 10 - unsold,
                    "unit_cost_ron": 4.0,
                    "sequence": day_number,
                }
            )
    return pd.DataFrame(records)


def _find_factor(result, **factor):
    return next(item for item in result.items if item.factor == factor)


def test_weighted_effect_uses_percentage_points_and_relative_change():
    result = analyze_patterns(_two_slot_rows(), context=pd.DataFrame())

    item = _find_factor(result, dish_id="dish-01", time_slot="dinner")
    assert item.group.unsold_rate == pytest.approx(0.30)
    assert item.baseline.unsold_rate == pytest.approx(0.20)
    assert item.effect_pp == pytest.approx(10.0)
    assert item.relative_effect == pytest.approx(0.50)
    assert item.support.days == 12


def test_zero_baseline_has_no_relative_effect():
    result = analyze_patterns(
        _two_slot_rows(lunch_unsold=0), context=pd.DataFrame()
    )

    item = _find_factor(result, dish_id="dish-01", time_slot="dinner")
    assert item.baseline.unsold_rate == 0
    assert item.effect_pp == pytest.approx(30.0)
    assert item.relative_effect is None


def test_insufficient_support_returns_explicit_empty_result():
    result = analyze_patterns(_two_slot_rows(days=11), context=pd.DataFrame())

    assert result.status == "insufficient_data"
    assert result.items == []
    assert result.limitations


def test_result_is_stable_when_input_rows_are_shuffled():
    rows = _two_slot_rows(days=24)
    original_rows = deepcopy(rows)

    ordered = analyze_patterns(rows, context=pd.DataFrame())
    shuffled = analyze_patterns(
        rows.sample(frac=1, random_state=987).reset_index(drop=True),
        context=pd.DataFrame(),
    )

    assert ordered.model_dump(mode="json") == shuffled.model_dump(mode="json")
    pd.testing.assert_frame_equal(rows, original_rows)


def test_comparable_baseline_never_uses_other_dishes():
    first = _two_slot_rows()
    second = _two_slot_rows(dinner_unsold=9, lunch_unsold=9).assign(
        dish_id="dish-02", dish_name="Synthetic stew", category="stew"
    )

    result = analyze_patterns(pd.concat([first, second], ignore_index=True), None)

    item = _find_factor(result, dish_id="dish-01", time_slot="dinner")
    assert item.baseline.unsold_rate == pytest.approx(0.20)
    assert item.effect_pp == pytest.approx(10.0)


def test_top_results_deduplicate_fully_overlapping_dish_and_category_patterns():
    result = analyze_patterns(_two_slot_rows(days=24), context=pd.DataFrame())

    dinner_patterns = [
        item for item in result.items if item.factor.get("time_slot") == "dinner"
    ]
    assert len(dinner_patterns) == 1
    assert "Overlapping pattern opportunities must not be summed." in result.limitations


def test_context_is_joined_by_unique_date_without_mutating_inputs():
    rows = _two_slot_rows(days=24)
    context = pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=24).date,
            "rain_bin": ["rain"] * 12 + ["dry"] * 12,
        }
    )
    original_context = deepcopy(context)

    result = analyze_patterns(rows, context)

    assert result.status == "ready"
    pd.testing.assert_frame_equal(context, original_context)


def test_candidate_cap_keeps_every_available_context_family():
    rows = pd.concat(
        [
            _two_slot_rows(days=28).assign(
                dish_id=f"dish-{dish_number:02d}",
                dish_name=f"Dish {dish_number:02d}",
                category=f"category-{dish_number % 5}",
            )
            for dish_number in range(20)
        ],
        ignore_index=True,
    )
    context = pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=28).date,
            "rain_bin": ["dry", "rain"] * 14,
            "university_state": ["term"] * 14 + ["break"] * 14,
        }
    )

    candidates = _enumerate_candidates(_prepare_frame(rows, context))

    assert len(candidates) == MAX_CANDIDATES
    assert {candidate.base_dimension for candidate in candidates} == {
        "dish_id",
        "category",
    }
    assert {candidate.context_dimension for candidate in candidates} == {
        "weekday",
        "time_slot",
        "rain_bin",
        "university_state",
    }
