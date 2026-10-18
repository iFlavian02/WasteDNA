"""Synthetic demo session built from data/demo/redistribution/*.json.

Offer times are relative so the demo always has live offers: `{"day": 0,
"time": "17:00"}` is local time on the anchor day (today before 15:00 local,
otherwise tomorrow); `{"minutes_from_now": -60}` is relative to now (used for
the already-expired scenario).

`marketplace.json` adds synthetic Iași restaurants with priced, always-live
offers for the customer map. Only `POST /demo?marketplace=true` seeds them, so
the default demo (and the tests built on it) keeps its five offers.
"""

import json
import random
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


def build_surplus_log(now: datetime, specs: list[dict]) -> list[tuple[str, date, float]]:
    """Deterministic synthetic confirmed-surplus days ending yesterday (local).

    Per spec: `weekday_kg` (Monday first) ± uniform `noise_kg` from a seeded
    generator. A base of 0 gives confirmed zero days; they are never skipped."""
    today = local(now).date()
    entries = []
    for spec in specs:
        rng = random.Random(spec["seed"])
        for back in range(spec["days"], 0, -1):
            day = today - timedelta(days=back)
            base = spec["weekday_kg"][day.weekday()]
            noise = rng.uniform(-spec["noise_kg"], spec["noise_kg"])
            entries.append((spec["donor_id"], day, 0.0 if base == 0 else max(0.0, round(base + noise, 1))))
    return entries


def load_demo(
    now: datetime, demo_dir: Path = DEMO_DIR
) -> tuple[list[Donor], list[Organization], list[OfferCreate], list[tuple[str, date, float]]]:
    donors = [Donor.model_validate(item) for item in _read("donors.json", demo_dir)]
    organizations = [Organization.model_validate(item) for item in _read("organizations.json", demo_dir)]
    surplus_log = build_surplus_log(now, _read("surplus_log.json", demo_dir))
    offers = []
    for item in _read("offers.json", demo_dir):
        fields = {key: value for key, value in item.items() if key != "scenario"}
        fields["available_from"] = _resolve(item["available_from"], now)
        fields["pickup_deadline"] = _resolve(item["pickup_deadline"], now)
        offers.append(OfferCreate.model_validate(fields))
    return donors, organizations, offers, surplus_log


def load_marketplace(now: datetime, demo_dir: Path = DEMO_DIR) -> tuple[list[Donor], list[OfferCreate]]:
    """The Iași customer-map restaurants and their priced offers."""
    data = json.loads((demo_dir / "marketplace.json").read_text(encoding="utf-8"))
    donors = [Donor.model_validate(item) for item in data["donors"]]
    offers = []
    for item in data["offers"]:
        fields = {**item, "available_from": _resolve(item["available_from"], now), "pickup_deadline": _resolve(item["pickup_deadline"], now)}
        offers.append(OfferCreate.model_validate(fields))
    return donors, offers


def create_demo_session(
    repo: Repository, now: datetime, demo_dir: Path = DEMO_DIR, *, with_surplus_history: bool = True, with_marketplace: bool = False
) -> str:
    """Create a synthetic demo session, seeded by default with confirmed daily
    surplus (needed for forecasts), as `POST /demo` does. Pass
    `with_surplus_history=False` for an offers-only session, and
    `with_marketplace=True` to add the Iași restaurants of the customer map."""
    donors, organizations, offers, surplus_log = load_demo(now, demo_dir)
    if with_marketplace:
        extra_donors, extra_offers = load_marketplace(now, demo_dir)
        donors, offers = donors + extra_donors, offers + extra_offers
    return create_session(repo, now, donors, organizations, offers, surplus_log if with_surplus_history else None, is_synthetic=True)
