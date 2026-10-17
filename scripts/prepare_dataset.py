"""Build the date-keyed context table from the local weather and calendar files.

    python scripts/prepare_dataset.py

Reads ``data/context/weather_iasi.csv`` and ``data/context/calendar_iasi.json``
and writes ``data/context/context_daily.csv`` with one row per date:

date, temperature_mean_c, precipitation_mm, rain_bin, university_state,
university_period, event_id

``rain_bin`` is ``rain`` when precipitation is at least 1.0 mm, ``dry``
otherwise, and empty when precipitation is missing. Dates outside a verified
calendar interval keep empty university fields. Nothing is filled in.
"""

import json
from pathlib import Path

import pandas as pd

CONTEXT_DIR = Path("data/context")
RAIN_THRESHOLD_MM = 1.0
CONTEXT_COLUMNS = [
    "date",
    "temperature_mean_c",
    "precipitation_mm",
    "rain_bin",
    "university_state",
    "university_period",
    "event_id",
]


def build_context(weather: pd.DataFrame, calendar: dict) -> pd.DataFrame:
    """Return one row per weather date with derived bins and calendar labels."""
    context = weather.copy()
    context["date"] = pd.to_datetime(context["date"]).dt.date
    if context["date"].duplicated().any():
        raise ValueError("weather dates must be unique")
    precipitation = pd.to_numeric(context["precipitation_mm"])
    context["rain_bin"] = precipitation.map(
        lambda mm: None if pd.isna(mm) else ("rain" if mm >= RAIN_THRESHOLD_MM else "dry")
    )
    context["university_state"] = None
    context["university_period"] = None
    context["event_id"] = None
    for interval in calendar["university"]:
        inside = _between(context["date"], interval)
        context.loc[inside, "university_state"] = interval["state"]
        context.loc[inside, "university_period"] = interval["period"]
    for event in calendar["events"]:
        context.loc[_between(context["date"], event), "event_id"] = event["id"]
    return context[CONTEXT_COLUMNS].sort_values("date").reset_index(drop=True)


def _between(dates: pd.Series, interval: dict) -> pd.Series:
    start, end = pd.Timestamp(interval["from"]).date(), pd.Timestamp(interval["to"]).date()
    return (dates >= start) & (dates <= end)


def load_context(context_dir: Path = CONTEXT_DIR) -> pd.DataFrame:
    """Build the context table from the committed files in ``context_dir``."""
    weather = pd.read_csv(context_dir / "weather_iasi.csv")
    calendar = json.loads((context_dir / "calendar_iasi.json").read_text(encoding="utf-8"))
    return build_context(weather, calendar)


def main() -> None:
    context = load_context()
    path = CONTEXT_DIR / "context_daily.csv"
    context.to_csv(path, index=False, lineterminator="\n")
    print(f"wrote {len(context)} days to {path}")


if __name__ == "__main__":
    main()
