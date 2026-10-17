"""Empirical what-if simulator for one dish, weekday and service.

No model is trained: every curve point is an average over historical sales
``S_j`` of the selected history (master plan, "Simulator & Recommendations").
"""

import math

import pandas as pd

from app.contracts.common import ComponentState
from app.contracts.decisions import CurvePoint, SimulationResult, SimulationSelection

MIN_WEEKDAY_DAYS = 8
MIN_SLOT_DAYS = 12

LIMIT_PER_SERVICE = "Cost change is RON per service, not per month, and is production cost avoided, not profit."
LIMIT_LOWER_BOUND = "Shortage and risk are lower bounds: sales never exceed the quantity prepared on that day."
LIMIT_CENSORED = (
    "Some history days sold out (sold equals prepared or a stockout was confirmed); real demand may be higher, "
    "so shortage and risk may be underestimated and the unsold proxy overestimated."
)


def _half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def simulate(rows: pd.DataFrame, selection: SimulationSelection) -> SimulationResult:
    """Return the empirical curve for ``selection`` from validated ``rows``.

    Uses ``dish_id+weekday+time_slot`` history with at least 8 days, otherwise
    announced ``dish_id+time_slot`` fallback with at least 12 days, otherwise
    ``insufficient_data``. ``rows`` is not modified.
    """
    slot_rows = rows[(rows["dish_id"] == selection.dish_id) & (rows["time_slot"] == selection.time_slot)]
    weekdays = pd.to_datetime(slot_rows["date"]).dt.day_name()
    weekday_rows = slot_rows[weekdays == selection.weekday]
    weekday_days = weekday_rows["date"].nunique()
    slot_days = slot_rows["date"].nunique()

    limitations: list[str] = []
    if weekday_days >= MIN_WEEKDAY_DAYS:
        basis, history, support_days = "dish_weekday_slot", weekday_rows, weekday_days
    elif slot_days >= MIN_SLOT_DAYS:
        basis, history, support_days = "dish_slot", slot_rows, slot_days
        limitations.append(
            f"Only {weekday_days} {selection.weekday} {selection.time_slot} days are available "
            f"(minimum {MIN_WEEKDAY_DAYS}); using all {slot_days} {selection.time_slot} days of this dish instead."
        )
    else:
        return SimulationResult(
            status=ComponentState.insufficient_data,
            selection=selection,
            support_days=int(slot_days),
            basis="none",
            baseline_quantity=None,
            unit_cost_ron=None,
            selected_point=None,
            curve=[],
            censored_demand=False,
            limitations=[
                f"Not enough history: {weekday_days} {selection.weekday} {selection.time_slot} days "
                f"(minimum {MIN_WEEKDAY_DAYS}) and {slot_days} {selection.time_slot} days for this dish "
                f"(minimum {MIN_SLOT_DAYS})."
            ],
        )

    sold = history["sold_qty"].astype(int).to_numpy()
    prepared = history["prepared_qty"].astype(int).to_numpy()
    unit_cost = float(history["unit_cost_ron"].astype(float).median())
    baseline = _half_up(float(pd.Series(prepared).median()))

    censored = bool((sold == prepared).any())
    if "stockout_confirmed" in history.columns:
        confirmed = history["stockout_confirmed"].map(lambda value: value is True or str(value).strip().lower() in {"true", "1"})
        censored = censored or bool(confirmed.any())

    top = int(max(selection.requested_quantity, baseline, sold.max(initial=0), prepared.max(initial=0)))
    curve = []
    for quantity in range(top + 1):
        curve.append(
            CurvePoint(
                quantity=quantity,
                waste_proxy_portions=float((quantity - sold).clip(min=0).mean()),
                shortage_lower_bound_portions=float((sold - quantity).clip(min=0).mean()),
                risk_lower_bound=float((sold > quantity).mean()),
                production_cost_change_ron_per_service=round((baseline - quantity) * unit_cost, 2),
            )
        )

    limitations += [LIMIT_PER_SERVICE, LIMIT_LOWER_BOUND]
    if censored:
        limitations.append(LIMIT_CENSORED)

    return SimulationResult(
        status=ComponentState.ready,
        selection=selection,
        support_days=int(support_days),
        basis=basis,
        baseline_quantity=baseline,
        unit_cost_ron=unit_cost,
        selected_point=curve[selection.requested_quantity],
        curve=curve,
        censored_demand=censored,
        limitations=limitations,
    )
