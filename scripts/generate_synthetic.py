"""Generate synthetic restaurant sales CSVs (all records are simulated).

Profiles:

- ``minimal``: small CSV shared early so other members can develop against the
  agreed column format.
- ``demo``: the full demo (seed 42, 180 days, 16 dishes, lunch and dinner)
  driven by the committed Iași context snapshot, with three planted recurring
  effects and late anomalies. Generator truth (latent demand, effects,
  anomalies) is written to separate files and never to the model CSV.

Usage, from the repository root (``demo`` reads ``data/context``):

    python scripts/generate_synthetic.py --profile minimal
    python scripts/generate_synthetic.py --profile demo
"""

import argparse
import csv
import hashlib
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_dataset import load_context  # noqa: E402

COLUMNS = [
    "date",
    "dish_id",
    "dish_name",
    "category",
    "time_slot",
    "prepared_qty",
    "sold_qty",
    "unit_cost_ron",
    "unit_price_ron",
    "stockout_confirmed",
]

MINIMAL_SEED = 42
MINIMAL_START = date(2025, 6, 1)
MINIMAL_DAYS = 56

# dish_id, name, category, unit cost, unit price, mean demand {lunch, dinner}, first day index
MINIMAL_DISHES = [
    ("dish-01", "Ciorbă de burtă", "soup", 9.5, 22.0, {"lunch": 24, "dinner": 14}, 0),
    ("dish-02", "Sarmale cu mămăligă", "main", 14.0, 34.0, {"lunch": 18, "dinner": 22}, 0),
    ("dish-03", "Papanași", "dessert", 7.0, 19.0, {"lunch": 8, "dinner": 16}, 0),
    ("dish-04", "Salată de vinete", "salad", 6.0, 16.0, {"lunch": 12, "dinner": 9}, 36),
]


def generate_minimal(seed: int = MINIMAL_SEED) -> list[dict]:
    """Return deterministic synthetic rows; sales are ``min(prepared, demand)``.

    Planted, simulated behaviour: the kitchen prepares ~25% extra on Friday
    dinner without higher demand, and dish-04 only appears in the last 20 days
    (so the simulator must fall back from weekday to service-level history).
    """
    rng = np.random.default_rng(seed)
    rows = []
    for day_index in range(MINIMAL_DAYS):
        day = MINIMAL_START + timedelta(days=day_index)
        weekend = day.weekday() >= 5
        for dish_id, name, category, cost, price, demand_by_slot, first_day in MINIMAL_DISHES:
            if day_index < first_day:
                continue
            for slot in ("lunch", "dinner"):
                mean_demand = demand_by_slot[slot] * (1.2 if weekend else 1.0)
                demand = int(rng.poisson(mean_demand))
                planned = mean_demand * 1.1
                if day.weekday() == 4 and slot == "dinner":
                    planned *= 1.25
                prepared = max(0, int(round(planned + rng.normal(0, 1.5))))
                sold = min(prepared, demand)
                stockout = demand > prepared and rng.random() < 0.7
                rows.append(
                    {
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
                    }
                )
    return rows


def write_csv(rows: list[dict], path: Path) -> str:
    """Write rows as UTF-8 comma-separated CSV and return its SHA-256."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return hashlib.sha256(path.read_bytes()).hexdigest()


DEMO_SEED = 42
DEMO_START = date(2025, 6, 1)
DEMO_DAYS = 180
DEMO_TEST_FRACTION = 0.2
DEMO_PATHS = {
    "csv": Path("data/demo/restaurant_demo_synthetic.csv"),
    "demand": Path("data/demo/truth/restaurant_demo_latent_demand.csv"),
    "truth": Path("data/demo/truth/restaurant_demo_truth.json"),
}

# dish_id, name, category, unit cost, unit price, mean demand per served slot
DEMO_DISHES = [
    ("dish-01", "Ciorbă de burtă", "soup", 9.5, 22.0, {"lunch": 22, "dinner": 12}),
    ("dish-02", "Ciorbă de perișoare", "soup", 8.0, 19.0, {"lunch": 20, "dinner": 10}),
    ("dish-03", "Supă cremă de legume", "soup", 6.5, 17.0, {"lunch": 14, "dinner": 8}),
    ("dish-04", "Sarmale cu mămăligă", "main", 14.0, 34.0, {"lunch": 18, "dinner": 20}),
    ("dish-05", "Meniul zilei", "daily_menu", 11.0, 25.0, {"lunch": 30}),
    ("dish-06", "Tochitură moldovenească", "main", 16.0, 39.0, {"lunch": 14, "dinner": 22}),
    ("dish-07", "Piept de pui la grătar", "main", 12.0, 29.0, {"lunch": 16, "dinner": 18}),
    ("dish-08", "Mici cu muștar", "main", 9.0, 24.0, {"lunch": 10, "dinner": 20}),
    ("dish-09", "Pastramă de porc", "main", 15.0, 36.0, {"lunch": 8, "dinner": 14}),
    ("dish-10", "Pește la cuptor", "main", 18.0, 42.0, {"lunch": 6, "dinner": 10}),
    ("dish-11", "Cartofi prăjiți", "side", 3.5, 11.0, {"lunch": 24, "dinner": 30}),
    ("dish-12", "Salată de varză", "side", 2.5, 8.0, {"lunch": 16, "dinner": 18}),
    ("dish-13", "Salată de vinete", "side", 6.0, 16.0, {"lunch": 9, "dinner": 11}),
    ("dish-14", "Papanași", "dessert", 7.0, 19.0, {"lunch": 10, "dinner": 20}),
    ("dish-15", "Clătite cu dulceață", "dessert", 5.0, 15.0, {"lunch": 8, "dinner": 14}),
    ("dish-16", "Cozonac", "dessert", 4.5, 13.0, {"lunch": 7, "dinner": 9}),
]

# Planted recurring effects; ``factor`` uses member 2's pattern vocabulary.
DEMO_EFFECTS = [
    {
        "id": "effect-main-friday-overproduction",
        "description": "The kitchen prepares 30% more mains on Fridays; demand is unchanged.",
        "factor": {"category": "main", "weekday": "Friday"},
        "prepared_multiplier": 1.30,
        "demand_multiplier": 1.0,
    },
    {
        "id": "effect-dessert-rain-demand-drop",
        "description": "On rain days dessert demand drops 35%; the kitchen does not adapt.",
        "factor": {"category": "dessert", "rain_bin": "rain"},
        "prepared_multiplier": 1.0,
        "demand_multiplier": 0.65,
    },
    {
        "id": "effect-daily-menu-university-break",
        "description": "During the university break demand for the daily menu drops 45%; the kitchen does not adapt.",
        "factor": {"dish_id": "dish-05", "university_state": "break"},
        "prepared_multiplier": 1.0,
        "demand_multiplier": 0.55,
    },
]

# Late anomalies inside the last 20% of dates: a batch prepared at 3.0x the plan.
# 3.0x and dish-12 on 2025-11-12 (was dish-14, a noisy rain-affected dessert)
# follow member 2's first recovery measurement (docs/fixtures/analytics/REQUESTS.md).
DEMO_ANOMALIES = [
    ("2025-10-30", "dish-06", "dinner"),
    ("2025-11-05", "dish-01", "lunch"),
    ("2025-11-12", "dish-12", "dinner"),
    ("2025-11-19", "dish-11", "dinner"),
    ("2025-11-25", "dish-04", "lunch"),
]
ANOMALY_PREPARED_MULTIPLIER = 3.0


def _value(value):
    return None if pd.isna(value) else value


def generate_demo(context: pd.DataFrame, seed: int = DEMO_SEED) -> tuple[list[dict], list[dict], dict]:
    """Return (model rows, latent demand rows, truth) for the full synthetic demo.

    Sales are ``min(prepared, demand)``. The kitchen plans from each dish's
    usual demand (with a known +15% weekend effect) times 1.08, without knowing
    the rain, university or anomaly effects.
    """
    by_date = {row.date: row for row in context.itertuples(index=False)}
    rng = np.random.default_rng(seed)
    anomalies = set(DEMO_ANOMALIES)
    rows, demand_rows, anomaly_truth = [], [], []
    for day_index in range(DEMO_DAYS):
        day = DEMO_START + timedelta(days=day_index)
        ctx = by_date[day]
        weekend = day.weekday() >= 5
        for dish_id, name, category, cost, price, demand_by_slot in DEMO_DISHES:
            for slot in ("lunch", "dinner"):
                if slot not in demand_by_slot:
                    continue
                values = {
                    "dish_id": dish_id,
                    "category": category,
                    "weekday": day.strftime("%A"),
                    "time_slot": slot,
                    "rain_bin": _value(ctx.rain_bin),
                    "university_state": _value(ctx.university_state),
                }
                usual = demand_by_slot[slot] * (1.15 if weekend else 1.0)
                demand_mean, prepared_factor = usual, 1.0
                for effect in DEMO_EFFECTS:
                    if all(values.get(k) == v for k, v in effect["factor"].items()):
                        demand_mean *= effect["demand_multiplier"]
                        prepared_factor *= effect["prepared_multiplier"]
                key = (day.isoformat(), dish_id, slot)
                planned = usual * 1.08 * prepared_factor
                if key in anomalies:
                    planned *= ANOMALY_PREPARED_MULTIPLIER
                demand = int(rng.poisson(demand_mean))
                prepared = max(0, int(round(planned + rng.normal(0, 1.5))))
                sold = min(prepared, demand)
                stockout = demand > prepared and rng.random() < 0.7
                if key in anomalies:
                    anomaly_truth.append(
                        {
                            "date": key[0],
                            "dish_id": dish_id,
                            "time_slot": slot,
                            "prepared_multiplier": ANOMALY_PREPARED_MULTIPLIER,
                            "prepared_qty": prepared,
                        }
                    )
                rows.append(
                    {
                        "date": key[0],
                        "dish_id": dish_id,
                        "dish_name": name,
                        "category": category,
                        "time_slot": slot,
                        "prepared_qty": prepared,
                        "sold_qty": sold,
                        "unit_cost_ron": f"{cost:.2f}",
                        "unit_price_ron": f"{price:.2f}",
                        "stockout_confirmed": "true" if stockout else "false",
                    }
                )
                demand_rows.append({"date": key[0], "dish_id": dish_id, "time_slot": slot, "latent_demand": demand})

    test_start = DEMO_START + timedelta(days=int(DEMO_DAYS * (1 - DEMO_TEST_FRACTION)))
    truth = {
        "is_synthetic": True,
        "seed": seed,
        "period": {"from": DEMO_START.isoformat(), "to": (DEMO_START + timedelta(days=DEMO_DAYS - 1)).isoformat()},
        "test_period_from": test_start.isoformat(),
        "planning_rule": "prepared = round(usual demand (+15% weekend) x 1.08 x effect prepared multiplier + Normal(0, 1.5))",
        "effects": DEMO_EFFECTS,
        "anomalies": anomaly_truth,
        "context_used": "data/context/context_daily.csv",
        "note": "Real weather and calendar dates are inputs; their effect on sales is simulated, not observed.",
    }
    return rows, demand_rows, truth


def write_demo(context: pd.DataFrame, paths: dict = DEMO_PATHS) -> str:
    """Write the model CSV and the separate truth files; return the CSV SHA-256."""
    rows, demand_rows, truth = generate_demo(context)
    digest = write_csv(rows, paths["csv"])
    paths["demand"].parent.mkdir(parents=True, exist_ok=True)
    with paths["demand"].open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["date", "dish_id", "time_slot", "latent_demand"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(demand_rows)
    paths["truth"].write_text(json.dumps(truth, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", choices=["minimal", "demo"], default="minimal")
    args = parser.parse_args()
    if args.profile == "minimal":
        out = Path("data/demo/restaurant_minimal_synthetic.csv")
        digest = write_csv(generate_minimal(), out)
    else:
        out = DEMO_PATHS["csv"]
        digest = write_demo(load_context())
    print(f"wrote {out} sha256={digest}")


if __name__ == "__main__":
    main()
