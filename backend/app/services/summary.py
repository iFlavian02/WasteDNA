"""Descriptive calculations from validated restaurant rows."""

from datetime import timedelta

import pandas as pd


def summarize(rows: pd.DataFrame) -> dict:
    first, last = rows["date"].min(), rows["date"].max()
    days = (last - first).days + 1
    prepared = int(rows["prepared_qty"].sum())
    sold = int(rows["sold_qty"].sum())
    unsold = prepared - sold
    cost = float(((rows["prepared_qty"] - rows["sold_qty"]) * rows["unit_cost_ron"]).sum())
    daily = []
    for day, group in rows.groupby("date", sort=True):
        daily.append({"date": day.isoformat(), "prepared_portions": int(group["prepared_qty"].sum()), "sold_portions": int(group["sold_qty"].sum()), "unsold_portions": int((group["prepared_qty"] - group["sold_qty"]).sum())})
    dishes = []
    for dish_id, group in rows.groupby("dish_id", sort=True):
        dishes.append({"dish_id": dish_id, "dish_name": group.iloc[0]["dish_name"], "unsold_portions": int((group["prepared_qty"] - group["sold_qty"]).sum()), "unsold_cost_ron": round(float(((group["prepared_qty"] - group["sold_qty"]) * group["unit_cost_ron"]).sum()), 2)})
    dishes.sort(key=lambda item: (-item["unsold_cost_ron"], item["dish_id"]))
    return {"prepared_portions": prepared, "sold_portions": sold, "unsold_portions": unsold, "unsold_cost_ron": round(cost, 2), "unsold_rate": unsold / prepared if prepared else None, "monthly_equivalent_unsold_cost_ron": round(cost / days * 30, 2), "period": {"from": first.isoformat(), "to": last.isoformat(), "calendar_days": days}, "daily": daily, "top_dishes": dishes[:5]}
