"""Synthetic sales for a small Iași bistro, as if read from its inventory system.

Every day is drawn from its own random stream (seeded by the history seed and
the date), so extending a history never changes the days already generated.
The kitchen plans from what it knows (usual demand per service, weekday
pattern, the season with some delay). It does not foresee daily
shocks, and three habits waste food on purpose so insights have something real
to find:

- Mondays are planned like a normal day, but demand is about 20% lower.
- Desserts at dinner are prepared about 30% above plan.
- Fewer guests order the daily menu on Fridays; the kitchen does not adapt.
"""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta

import numpy as np

RESTAURANT = "Bistro Copou"
COLUMNS = ["date", "dish_id", "dish_name", "category", "time_slot", "prepared_qty", "sold_qty", "unit_cost_ron", "unit_price_ron", "stockout_confirmed"]

# dish_id, name, category, unit cost RON, unit price RON, mean demand per service
DISHES = [
    ("dish-01", "Ciorbă de burtă", "soup", 9.5, 22.0, {"lunch": 14, "dinner": 7}),
    ("dish-02", "Ciorbă de perișoare", "soup", 8.0, 19.0, {"lunch": 12, "dinner": 6}),
    ("dish-03", "Sarmale cu mămăligă", "main", 14.0, 34.0, {"lunch": 10, "dinner": 12}),
    ("dish-04", "Tochitură moldovenească", "main", 16.0, 39.0, {"lunch": 8, "dinner": 13}),
    ("dish-05", "Piept de pui la grătar", "main", 12.0, 29.0, {"lunch": 10, "dinner": 11}),
    ("dish-06", "Mici cu muștar", "main", 9.0, 24.0, {"lunch": 6, "dinner": 12}),
    ("dish-07", "Meniul zilei", "daily_menu", 11.0, 25.0, {"lunch": 24}),
    ("dish-08", "Cartofi prăjiți", "side", 3.5, 11.0, {"lunch": 14, "dinner": 18}),
    ("dish-09", "Salată de varză", "side", 2.5, 8.0, {"lunch": 9, "dinner": 10}),
    ("dish-10", "Papanași", "dessert", 7.0, 19.0, {"lunch": 6, "dinner": 12}),
    ("dish-11", "Clătite cu dulceață", "dessert", 5.0, 15.0, {"lunch": 5, "dinner": 8}),
]

# Demand by weekday (Monday = 0). The kitchen plans Monday like Thursday.
WEEKDAY_DEMAND = [0.80, 0.92, 0.97, 1.00, 1.15, 1.22, 1.02]
WEEKDAY_PLANNED = [1.00, 0.92, 0.97, 1.00, 1.15, 1.22, 1.02]
SUNDAY_DINNER = 0.85
# Season by month: terrace in late spring and summer, holidays in December, a quiet January.
SEASON = {1: 0.84, 2: 0.88, 3: 0.95, 4: 1.00, 5: 1.06, 6: 1.08, 7: 1.02, 8: 0.94, 9: 1.04, 10: 1.00, 11: 0.97, 12: 1.10}
CLOSED = {(12, 25), (1, 1)}
PLAN_BUFFER = 1.0
DESSERT_DINNER_OVERPREP = 1.30
FRIDAY_DAILY_MENU_DEMAND = 0.70


def _season_known(day: date) -> float:
    """The kitchen adjusts to the season halfway, a month late."""
    previous = (day.replace(day=1) - timedelta(days=1)).month
    return (SEASON[previous] + SEASON[day.month]) / 2


def generate_days(seed: int, start: date, days: int) -> list[dict]:
    """Rows for `days` consecutive dates from `start`, in the CSV template schema."""
    rows = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        if (day.month, day.day) in CLOSED:
            continue
        rng = np.random.default_rng([seed, day.toordinal()])
        weekday = day.weekday()
        shock = float(rng.lognormal(0, 0.06))
        roll = rng.random()
        if roll < 0.03:
            shock *= 0.70  # a quiet day: bad weather, a match on TV, roadworks
        elif roll < 0.06:
            shock *= 1.25  # a busy day: an event or a group booking
        for dish_id, name, category, cost, price, demand_by_slot in DISHES:
            for slot in ("lunch", "dinner"):
                if slot not in demand_by_slot or (category == "daily_menu" and weekday >= 5):
                    continue
                usual = demand_by_slot[slot]
                slot_factor = SUNDAY_DINNER if weekday == 6 and slot == "dinner" else 1.0
                demand_mean = usual * WEEKDAY_DEMAND[weekday] * slot_factor * SEASON[day.month] * shock
                if category == "daily_menu" and weekday == 4:
                    demand_mean *= FRIDAY_DAILY_MENU_DEMAND
                planned = usual * WEEKDAY_PLANNED[weekday] * slot_factor * _season_known(day) * PLAN_BUFFER
                if category == "dessert" and slot == "dinner":
                    planned *= DESSERT_DINNER_OVERPREP
                demand = int(rng.poisson(max(demand_mean, 0)))
                prepared = max(0, int(round(planned + rng.normal(0, 1.2))))
                sold = min(prepared, demand)
                stockout = demand > prepared and rng.random() < 0.7
                rows.append({
                    "date": day.isoformat(),
                    "dish_id": dish_id,
                    "dish_name": name,
                    "category": category,
                    "time_slot": slot,
                    "prepared_qty": prepared,
                    "sold_qty": sold,
                    "unit_cost_ron": f"{cost:.2f}",
                    "unit_price_ron": f"{price:.2f}",
                    "stockout_confirmed": "true" if stockout else "false",
                })
    return rows


def to_csv(rows: list[dict]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")
