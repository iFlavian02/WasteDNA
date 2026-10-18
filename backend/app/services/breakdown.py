"""Filtered dashboard totals grouped by date, service, category and dish."""

from __future__ import annotations

import json
from datetime import date

import pandas as pd

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
LATEST_BATCHES = 6
TOP_DISHES = 5


def load_rows(record: dict) -> pd.DataFrame:
    rows = pd.DataFrame(json.loads(record["rows"]))
    rows["date"] = pd.to_datetime(rows["date"]).dt.date
    rows["unsold"] = rows["prepared_qty"] - rows["sold_qty"]
    rows["unsold_cost_ron"] = rows["unsold"] * rows["unit_cost_ron"].astype(float)
    return rows


def _totals(rows: pd.DataFrame) -> dict:
    prepared = int(rows["prepared_qty"].sum())
    unsold = int(rows["unsold"].sum())
    return {
        "prepared_portions": prepared,
        "sold_portions": int(rows["sold_qty"].sum()),
        "unsold_portions": unsold,
        "unsold_cost_ron": round(float(rows["unsold_cost_ron"].sum()), 2),
        "unsold_rate": unsold / prepared if prepared else None,
        "days_with_data": int(rows["date"].nunique()),
    }


def _grouped(rows: pd.DataFrame, key: str) -> list[dict]:
    if rows.empty:
        return []
    groups = rows.groupby(key, sort=True).agg(
        unsold=("unsold", "sum"),
        unsold_cost_ron=("unsold_cost_ron", "sum"),
        prepared=("prepared_qty", "sum"),
    )
    return [
        {
            key: name,
            "unsold_portions": int(item.unsold),
            "unsold_cost_ron": round(float(item.unsold_cost_ron), 2),
            "prepared_portions": int(item.prepared),
        }
        for name, item in groups.iterrows()
    ]


def breakdown(
    record: dict,
    start: date | None = None,
    end: date | None = None,
    category: str | None = None,
    time_slot: str | None = None,
) -> dict:
    rows = load_rows(record)
    available = {"from": rows["date"].min().isoformat(), "to": rows["date"].max().isoformat()} if not rows.empty else None
    options = {
        "categories": sorted(rows["category"].unique().tolist()),
        "time_slots": [slot for slot in ("lunch", "dinner") if slot in set(rows["time_slot"])],
    }
    start = start or rows["date"].min()
    end = end or rows["date"].max()
    selected = rows[(rows["date"] >= start) & (rows["date"] <= end)]
    if category:
        selected = selected[selected["category"] == category]
    if time_slot:
        selected = selected[selected["time_slot"] == time_slot]

    daily = []
    if not selected.empty:
        per_day = selected.groupby("date", sort=True).agg(
            prepared=("prepared_qty", "sum"),
            sold=("sold_qty", "sum"),
            unsold=("unsold", "sum"),
            cost=("unsold_cost_ron", "sum"),
        )
        daily = [
            {
                "date": day.isoformat(),
                "prepared_portions": int(item.prepared),
                "sold_portions": int(item.sold),
                "unsold_portions": int(item.unsold),
                "unsold_cost_ron": round(float(item.cost), 2),
            }
            for day, item in per_day.iterrows()
        ]

    by_weekday = []
    for index, name in enumerate(WEEKDAYS):
        days = [item for item in daily if date.fromisoformat(item["date"]).weekday() == index]
        count = len(days)
        by_weekday.append({
            "weekday": name,
            "days": count,
            "unsold_portions_per_day": sum(item["unsold_portions"] for item in days) / count if count else None,
            "unsold_cost_ron_per_day": round(sum(item["unsold_cost_ron"] for item in days) / count, 2) if count else None,
        })

    dishes = sorted(
        (
            {
                "dish_id": dish_id,
                "dish_name": group["dish_name"].iloc[0],
                "category": group["category"].iloc[0],
                "unsold_portions": int(group["unsold"].sum()),
                "unsold_cost_ron": round(float(group["unsold_cost_ron"].sum()), 2),
            }
            for dish_id, group in selected.groupby("dish_id", sort=True)
        ),
        key=lambda item: (-item["unsold_cost_ron"], item["dish_id"]),
    )

    latest = []
    if not selected.empty:
        last_day = selected["date"].max()
        batches = selected[(selected["date"] == last_day) & (selected["unsold"] > 0)].sort_values(
            ["unsold_cost_ron", "dish_id"], ascending=[False, True]
        )
        latest = [
            {
                "date": last_day.isoformat(),
                "dish_id": item.dish_id,
                "dish_name": item.dish_name,
                "category": item.category,
                "time_slot": item.time_slot,
                "unsold_portions": int(item.unsold),
                "unsold_cost_ron": round(float(item.unsold_cost_ron), 2),
            }
            for item in batches.head(LATEST_BATCHES).itertuples()
        ]

    return {
        "period": {"from": start.isoformat(), "to": end.isoformat(), "calendar_days": (end - start).days + 1},
        "filters": {"category": category, "time_slot": time_slot},
        "available": available,
        "options": options,
        "totals": _totals(selected),
        "daily": daily,
        "by_weekday": by_weekday,
        "by_time_slot": _grouped(selected, "time_slot"),
        "by_category": _grouped(selected, "category"),
        "top_dishes": dishes[:TOP_DISHES],
        "latest_batches": latest,
    }
