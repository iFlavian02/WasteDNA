"""Synthetic demo session built from data/demo/redistribution/*.json.

Offer times are relative so the demo always has live offers: `{"day": 0,
"time": "17:00"}` is local time on the anchor day (today before 15:00 local,
otherwise tomorrow); `{"minutes_from_now": -60}` is relative to now (used for
the already-expired scenario).
"""

import json
from datetime import date, datetime, time, timedelta
from pathlib import Path

from app.redistribution.geo import BUCHAREST, local
from app.redistribution.repository import Repository
from app.redistribution.schemas import Donor, OfferCreate, Organization
from app.redistribution.service import create_session

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo" / "redistribution"
ANCHOR_CUTOFF = time(15, 0)


def anchor_day(now: datetime) -> date:
    current = local(now)
    return current.date() if current.time() < ANCHOR_CUTOFF else current.date() + timedelta(days=1)


def _resolve(spec: dict, now: datetime) -> datetime:
    if "minutes_from_now" in spec:
        return local(now) + timedelta(minutes=spec["minutes_from_now"])
    day = anchor_day(now) + timedelta(days=spec["day"])
    return datetime.combine(day, time.fromisoformat(spec["time"]), BUCHAREST)


def _read(name: str, demo_dir: Path) -> list:
    return json.loads((demo_dir / name).read_text(encoding="utf-8"))


def load_demo(now: datetime, demo_dir: Path = DEMO_DIR) -> tuple[list[Donor], list[Organization], list[OfferCreate]]:
    donors = [Donor.model_validate(item) for item in _read("donors.json", demo_dir)]
    organizations = [Organization.model_validate(item) for item in _read("organizations.json", demo_dir)]
    offers = []
    for item in _read("offers.json", demo_dir):
        fields = {key: value for key, value in item.items() if key != "scenario"}
        fields["available_from"] = _resolve(item["available_from"], now)
        fields["pickup_deadline"] = _resolve(item["pickup_deadline"], now)
        offers.append(OfferCreate.model_validate(fields))
    return donors, organizations, offers


def create_demo_session(repo: Repository, now: datetime, demo_dir: Path = DEMO_DIR) -> str:
    donors, organizations, offers = load_demo(now, demo_dir)
    return create_session(repo, now, donors, organizations, offers, is_synthetic=True)
