"""Simulated inventory connection on top of the platform's dataset store.

The demo assumes WiseEat reads the restaurant's inventory system. `connect`
returns the active connected dataset, or creates one with a 90-day history up
to yesterday. `simulate` adds days after the last one, and `reset` starts a
fresh history; both keep the dataset ID. The history is regenerated from the
stored `(seed, start, days)`, so nothing generated earlier changes, and
analysis runs again from scratch.
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services.ingestion import parse_csv
from app.services.storage import DatasetStore
from app.services.summary import summarize

from .generator import RESTAURANT, generate_days, to_csv

SOURCE = "inventory"
INITIAL_DAYS = 90
MAX_DAYS = 366
TERMINAL = {"ready", "insufficient_data", "error"}
LOCAL = ZoneInfo("Europe/Bucharest")


class InventoryError(Exception):
    """A request the connected inventory cannot serve; `status` is the HTTP code."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def local_today(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(LOCAL).date()


def connection_info(record: dict) -> dict:
    meta = record["inventory"]
    start = date.fromisoformat(meta["start"])
    return {
        "dataset_id": record["dataset_id"],
        "source": record["source"],
        "is_synthetic": True,
        "status": record["status"],
        "created_at": record["created_at"],
        "restaurant": RESTAURANT,
        "history_from": meta["start"],
        "history_to": (start + timedelta(days=meta["days"] - 1)).isoformat(),
        "history_days": meta["days"],
        "simulated_days": meta["days"] - INITIAL_DAYS,
        "max_days": MAX_DAYS,
    }


def _history(seed: int, start: date, days: int):
    content = to_csv(generate_days(seed, start, days))
    rows = parse_csv(content)
    return content, rows


def _active_inventory(store: DatasetStore) -> dict | None:
    newest = None
    for path in store.root.glob("ds-*.json"):
        try:
            record = store.get(path.stem)
        except (KeyError, ValueError, json.JSONDecodeError):
            continue
        if record.get("source") == SOURCE and "inventory" in record:
            if newest is None or record["created_at"] > newest["created_at"]:
                newest = record
    return newest


def connect(store: DatasetStore, today: date, seed: int | None = None) -> tuple[dict, bool]:
    """Return `(record, created)`. Reuses the newest active connected dataset."""
    existing = _active_inventory(store)
    if existing is not None:
        return existing, False
    seed = random.randrange(1, 2**31) if seed is None else seed
    start = today - timedelta(days=INITIAL_DAYS)
    content, rows = _history(seed, start, INITIAL_DAYS)
    try:
        record = store.create(content, rows, summarize(rows), SOURCE)
    except OverflowError as exc:
        raise InventoryError(409, str(exc)) from None
    record["is_synthetic"] = True
    record["inventory"] = {"seed": seed, "start": start.isoformat(), "days": INITIAL_DAYS, "restaurant": RESTAURANT}
    store.update(record["dataset_id"], record)
    return record, True


def _connected(store: DatasetStore, dataset_id: str) -> dict:
    try:
        record = store.get(dataset_id)
    except KeyError:
        raise InventoryError(404, "Dataset not found or expired.") from None
    if record.get("source") != SOURCE or "inventory" not in record:
        raise InventoryError(409, "Only a connected inventory can be simulated or reset; uploaded files stay as they are.")
    if any(state not in TERMINAL for state in record["components"].values()):
        raise InventoryError(409, "Analysis is still running. Try again when it has finished.")
    return record


def _replace_history(store: DatasetStore, record: dict, seed: int, start: date, days: int) -> dict:
    content, rows = _history(seed, start, days)
    now = datetime.now(timezone.utc)
    record.update({
        "rows": rows.sort_values(["date", "dish_id", "time_slot"]).to_json(orient="records", date_format="iso"),
        "summary": summarize(rows),
        "status": "processing",
        "components": {"summary": "ready", **{name: "queued" for name in ("patterns", "model", "explanations", "anomalies", "recommendations", "clusters")}},
        "results": {},
        "component_limitations": {},
        "expires_at": (now + timedelta(hours=store.settings.dataset_ttl_hours)).isoformat(),
    })
    record.pop("private_model_artifact", None)
    record["inventory"].update({"seed": seed, "start": start.isoformat(), "days": days})
    store.update(record["dataset_id"], record)
    return record


def simulate(store: DatasetStore, dataset_id: str, days: int) -> dict:
    """Append `days` simulated days after the current history."""
    record = _connected(store, dataset_id)
    meta = record["inventory"]
    total = meta["days"] + days
    if total > MAX_DAYS:
        raise InventoryError(422, f"A dataset holds at most {MAX_DAYS} days. Reset the history to simulate again.")
    return _replace_history(store, record, meta["seed"], date.fromisoformat(meta["start"]), total)


def reset(store: DatasetStore, dataset_id: str, today: date, seed: int | None = None) -> dict:
    """Replace the history with a fresh 90 days up to yesterday."""
    record = _connected(store, dataset_id)
    seed = random.randrange(1, 2**31) if seed is None else seed
    return _replace_history(store, record, seed, today - timedelta(days=INITIAL_DAYS), INITIAL_DAYS)
