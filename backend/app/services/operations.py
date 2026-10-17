"""Operational import validation against a restaurant dataset and analysis rows."""

from datetime import date, time

import pandas as pd

from app.contracts.operations import OperationsImport


CUTOFF = time(18, 0)


class InvalidOperations(ValueError):
    """Raised when an otherwise valid payload does not belong to its dataset."""


def validate_for_dataset(payload: OperationsImport, restaurant_rows: pd.DataFrame) -> None:
    dish_ids = {str(value) for value in restaurant_rows["dish_id"].unique()}
    dates = pd.to_datetime(restaurant_rows["date"]).dt.date
    first_date, last_date = dates.min(), dates.max()
    referenced_dishes = {
        *(row.dish_id for row in payload.hourly_observations),
        *(row.dish_id for row in payload.menu_versions),
    }
    unknown = sorted(referenced_dishes.difference(dish_ids))
    if unknown:
        raise InvalidOperations(f"Unknown dish IDs: {', '.join(unknown)}")
    outside = sorted(
        {row.date for row in payload.hourly_observations}
        .difference(pd.date_range(first_date, last_date).date)
    )
    if outside:
        raise InvalidOperations("Hourly observation dates must be inside the dataset period.")
    keys = set(zip(dates, restaurant_rows["dish_id"], restaurant_rows["time_slot"]))
    if {(row.date, row.dish_id, row.time_slot) for row in payload.hourly_observations} - keys:
        raise InvalidOperations("Hourly observation (date, dish_id, time_slot) key is absent from the dataset.")


def build_hourly_analysis_rows(
    payload: OperationsImport,
    restaurant_rows: pd.DataFrame,
) -> pd.DataFrame:
    """Convert fully before/after-cutoff observations to the analytics row shape.

    Intervals crossing 18:00 are intentionally excluded because quantities cannot
    be split without inventing observations.
    """

    catalog = (
        restaurant_rows.sort_values("date", kind="mergesort")
        .drop_duplicates("dish_id", keep="last")
        .set_index("dish_id")
    )
    menu = sorted(payload.menu_versions, key=lambda row: row.effective_from)
    records = []
    for observation in payload.hourly_observations:
        start_time = observation.interval_start.timetz().replace(tzinfo=None)
        end_time = observation.interval_end.timetz().replace(tzinfo=None)
        if end_time <= CUTOFF:
            slot = "before_18:00"
        elif start_time >= CUTOFF:
            slot = "after_18:00"
        else:
            continue
        source = catalog.loc[observation.dish_id]
        records.append(
            {
                "date": observation.date,
                "dish_id": observation.dish_id,
                "dish_name": source["dish_name"],
                "category": source["category"],
                "time_slot": slot,
                "prepared_qty": observation.prepared_qty,
                "sold_qty": observation.sold_qty,
                "unit_cost_ron": _effective_cost(
                    menu,
                    observation.dish_id,
                    observation.date,
                    float(source["unit_cost_ron"]),
                ),
            }
        )
    return pd.DataFrame.from_records(records)


def _effective_cost(menu, dish_id: str, on_date: date, fallback: float) -> float:
    matches = [
        row
        for row in menu
        if row.dish_id == dish_id
        and row.effective_from <= on_date
        and (row.effective_to is None or on_date <= row.effective_to)
    ]
    return float(matches[-1].unit_cost_ron) if matches else fallback
