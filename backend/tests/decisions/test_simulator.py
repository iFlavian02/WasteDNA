from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

from app.contracts.common import ComponentState
from app.contracts.decisions import SimulationSelection
from app.decisions import simulate


def make_rows(sold, prepared=None, start=date(2025, 6, 6), step_days=7, dish_id="dish-01", time_slot="dinner", stockout=False):
    """Rows on the same weekday (default Friday) for one dish and service."""
    prepared = prepared if prepared is not None else [max(sold) + 5] * len(sold)
    return pd.DataFrame(
        {
            "date": [start + timedelta(days=step_days * i) for i in range(len(sold))],
            "dish_id": dish_id,
            "dish_name": "Test dish",
            "category": "soup",
            "time_slot": time_slot,
            "prepared_qty": prepared,
            "sold_qty": sold,
            "unit_cost_ron": 10.0,
            "stockout_confirmed": stockout,
        }
    )


def select(quantity, weekday="Friday", dish_id="dish-01", time_slot="dinner"):
    return SimulationSelection(dish_id=dish_id, weekday=weekday, time_slot=time_slot, requested_quantity=quantity)


def test_reference_example_waste_and_shortage_are_ten_thirds():
    # S=[10,20,30] repeated keeps the means identical while meeting the 8-day support threshold.
    rows = make_rows([10, 20, 30] * 3, prepared=[35] * 9)
    result = simulate(rows, select(20))
    assert result.status == ComponentState.ready
    assert result.basis == "dish_weekday_slot"
    assert result.support_days == 9
    assert result.selected_point.waste_proxy_portions == pytest.approx(10 / 3)
    assert result.selected_point.shortage_lower_bound_portions == pytest.approx(10 / 3)
    assert result.selected_point.risk_lower_bound == pytest.approx(1 / 3)


def test_curve_is_monotonic_and_contains_every_integer_point():
    rows = make_rows([12, 18, 9, 25, 14, 20, 16, 11, 22], prepared=[26] * 9)
    result = simulate(rows, select(40))
    quantities = [p.quantity for p in result.curve]
    assert quantities == list(range(41))
    for low, high in zip(result.curve, result.curve[1:]):
        assert high.waste_proxy_portions >= low.waste_proxy_portions
        assert high.shortage_lower_bound_portions <= low.shortage_lower_bound_portions
        assert high.risk_lower_bound <= low.risk_lower_bound


def test_baseline_is_median_prepared_with_zero_cost_change():
    rows = make_rows([10] * 8, prepared=[14, 15, 15, 16, 20, 15, 13, 18])
    result = simulate(rows, select(0))
    assert result.baseline_quantity == 15
    assert result.curve[15].production_cost_change_ron_per_service == 0
    assert result.curve[10].production_cost_change_ron_per_service == pytest.approx(50.0)
    assert result.curve[20].production_cost_change_ron_per_service == pytest.approx(-50.0)
    assert result.unit_cost_ron == 10.0


def test_falls_back_to_dish_slot_with_announced_limitation():
    rows = make_rows([10 + i % 5 for i in range(14)], step_days=1)  # 14 consecutive days, 2 per weekday
    result = simulate(rows, select(12))
    assert result.basis == "dish_slot"
    assert result.support_days == 14
    assert any("using all 14 dinner days" in text for text in result.limitations)


def test_insufficient_history_returns_empty_curve():
    rows = make_rows([10] * 5, step_days=1)
    result = simulate(rows, select(12))
    assert result.status == ComponentState.insufficient_data
    assert result.basis == "none"
    assert result.support_days == 5
    assert result.curve == [] and result.selected_point is None
    assert result.baseline_quantity is None and result.unit_cost_ron is None
    assert result.limitations


def test_unknown_dish_is_insufficient_not_an_error():
    result = simulate(make_rows([10] * 9), select(5, dish_id="dish-unknown"))
    assert result.status == ComponentState.insufficient_data
    assert result.support_days == 0


def test_zero_sales_history():
    rows = make_rows([0] * 9, prepared=[4] * 9)
    result = simulate(rows, select(0))
    assert result.status == ComponentState.ready
    assert result.curve[0].waste_proxy_portions == 0
    assert result.curve[4].waste_proxy_portions == 4
    assert all(p.risk_lower_bound == 0 for p in result.curve)


def test_censored_demand_flag():
    not_censored = simulate(make_rows([10] * 9, prepared=[12] * 9), select(10))
    assert not_censored.censored_demand is False
    sold_out = simulate(make_rows([12] + [10] * 8, prepared=[12] * 9), select(10))
    assert sold_out.censored_demand is True
    confirmed = simulate(make_rows([10] * 9, prepared=[12] * 9, stockout=True), select(10))
    assert confirmed.censored_demand is True
    assert any("sold out" in text for text in confirmed.limitations)


def test_input_is_not_mutated_and_no_model_dependency():
    rows = make_rows([10, 20, 30] * 3)
    before = rows.copy()
    simulate(rows, select(20))
    pd.testing.assert_frame_equal(rows, before)
    import app.decisions.simulator as module

    source = Path(module.__file__).read_text(encoding="utf-8")
    assert "sklearn" not in source and "shap" not in source


def test_large_requested_quantity_extends_curve():
    result = simulate(make_rows([10] * 9, prepared=[12] * 9), select(100))
    assert len(result.curve) == 101
    assert result.selected_point.quantity == 100
    assert result.selected_point.shortage_lower_bound_portions == 0
