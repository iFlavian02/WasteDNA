"""Fetch a local snapshot of daily historical weather for Iași from Open-Meteo.

Run once, with network access, from the repository root; the demo then works
offline from the committed snapshot:

    python scripts/fetch_weather.py --start 2025-06-01 --end 2025-11-27

Writes ``data/context/weather_iasi.csv`` (date, temperature_mean_c,
precipitation_mm) and records the request in ``data/context/sources.json``.
Days the API returns without a value stay empty; they are never filled in.
"""

import argparse
import csv
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
LATITUDE = 47.1585
LONGITUDE = 27.6014
TIMEZONE = "Europe/Bucharest"
CONTEXT_DIR = Path("data/context")


def fetch(start: str, end: str) -> tuple[str, dict]:
    query = urllib.parse.urlencode(
        {
            "latitude": LATITUDE,
            "longitude": LONGITUDE,
            "start_date": start,
            "end_date": end,
            "daily": "temperature_2m_mean,precipitation_sum",
            "timezone": TIMEZONE,
        }
    )
    url = f"{ARCHIVE_URL}?{query}"
    with urllib.request.urlopen(url, timeout=60) as response:
        return url, json.load(response)


def write_weather(payload: dict, path: Path) -> int:
    daily = payload["daily"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["date", "temperature_mean_c", "precipitation_mm"])
        for day, temperature, precipitation in zip(
            daily["time"], daily["temperature_2m_mean"], daily["precipitation_sum"], strict=True
        ):
            writer.writerow([day, "" if temperature is None else temperature, "" if precipitation is None else precipitation])
    return len(daily["time"])


def record_source(url: str, start: str, end: str, payload: dict) -> None:
    sources_path = CONTEXT_DIR / "sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.exists() else {"sources": []}
    sources["sources"] = [s for s in sources["sources"] if s.get("id") != "weather_iasi"]
    sources["sources"].insert(
        0,
        {
            "id": "weather_iasi",
            "file": "data/context/weather_iasi.csv",
            "title": "Open-Meteo Historical Weather API, daily mean temperature and precipitation sum",
            "url": url,
            "accessed_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "period": {"from": start, "to": end},
            "grid_cell": {"latitude": payload.get("latitude"), "longitude": payload.get("longitude")},
            "units": payload.get("daily_units"),
            "license": "CC BY 4.0, weather data by Open-Meteo.com",
            "is_synthetic": False,
        },
    )
    sources_path.write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--start", default="2025-06-01")
    parser.add_argument("--end", default="2025-11-27")
    args = parser.parse_args()
    url, payload = fetch(args.start, args.end)
    count = write_weather(payload, CONTEXT_DIR / "weather_iasi.csv")
    record_source(url, args.start, args.end, payload)
    print(f"wrote {count} days to {CONTEXT_DIR / 'weather_iasi.csv'}")


if __name__ == "__main__":
    main()
