"""Generate synthetic restaurant sales CSVs (all records are simulated).

Currently implements the ``minimal`` profile: a small deterministic CSV shared
early so other members can develop against the agreed column format. The full
180-day demo (seed 42, 16 dishes, weather context, planted effects and
generator truth) is a later step of the member 4 plan.

Usage, from the repository root:

    python scripts/generate_synthetic.py --profile minimal --out data/demo/restaurant_minimal_synthetic.csv
"""

import argparse
import csv
import hashlib
from datetime import date, timedelta
from pathlib import Path

import numpy as np

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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", choices=["minimal"], default="minimal")
    parser.add_argument("--out", type=Path, default=Path("data/demo/restaurant_minimal_synthetic.csv"))
    args = parser.parse_args()
    digest = write_csv(generate_minimal(), args.out)
    print(f"wrote {args.out} sha256={digest}")


if __name__ == "__main__":
    main()
