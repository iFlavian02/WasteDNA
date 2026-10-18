"""Atomic, bounded dataset snapshots with expiration on access.

Several demo users share one process, so reads go through an in-memory cache
(keyed by file mtime and size) and read-modify-write sequences hold a
per-dataset lock (`DatasetStore.lock`).
"""

import copy
import hashlib
import json
import os
import re
import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.config import Settings

ID_PATTERN = re.compile(r"^ds-[0-9a-f]{32}$")
PIPELINE_VERSION = "platform-summary-v1"
# Keys written by the analysis worker; copied when a demo import reuses a finished twin.
ANALYSIS_KEYS = ("components", "results", "component_limitations", "private_model_artifact", "cache_identity", "status")

# Shared by every DatasetStore instance in the process (routes build one per request).
_cache: dict[Path, tuple[tuple[int, int], dict]] = {}
_cache_lock = threading.Lock()
_dataset_locks: defaultdict[Path, threading.RLock] = defaultdict(threading.RLock)
_create_lock = threading.Lock()


class DatasetStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.root = settings.data_dir.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, dataset_id: str) -> Path:
        if not ID_PATTERN.fullmatch(dataset_id):
            raise KeyError(dataset_id)
        return self.root / f"{dataset_id}.json"

    def _load(self, path: Path) -> dict:
        """Parsed snapshot, served from the cache while the file is unchanged.
        Returns a private copy, so callers may mutate it freely."""
        stat = path.stat()
        key = (stat.st_mtime_ns, stat.st_size)
        with _cache_lock:
            cached = _cache.get(path)
        if cached is None or cached[0] != key:
            record = json.loads(path.read_text(encoding="utf-8"))
            with _cache_lock:
                _cache[path] = (key, record)
        else:
            record = cached[1]
        return copy.deepcopy(record)

    def _forget(self, path: Path) -> None:
        with _cache_lock:
            _cache.pop(path, None)
        path.unlink(missing_ok=True)

    def _active(self) -> list[tuple[Path, dict]]:
        active = []
        for path in self.root.glob("ds-*.json"):
            try:
                record = self._load(path)
                if datetime.fromisoformat(record["expires_at"]) > datetime.now(timezone.utc):
                    active.append((path, record))
                else:
                    self._forget(path)
            except (OSError, ValueError, KeyError):
                continue
        return active

    @contextmanager
    def lock(self, dataset_id: str):
        """Hold while reading, changing and writing back one dataset snapshot."""
        with _dataset_locks[self._path(dataset_id)]:
            yield

    def _make_room(self, active: list[tuple[Path, dict]]) -> None:
        """Evict the oldest finished datasets until a new one fits."""
        finished = sorted(
            (item for item in active if item[1].get("status") != "processing"),
            key=lambda item: item[1]["created_at"],
        )
        while len(active) >= self.settings.max_datasets:
            if not finished:
                raise OverflowError("Maximum active datasets reached.")
            path, record = finished.pop(0)
            with self.lock(record["dataset_id"]):
                self._forget(path)
            active.remove((path, record))

    def create(self, content: bytes, rows, summary: dict, source: str) -> dict:
        with _create_lock:
            self._make_room(self._active())
            return self._create(rows, summary, source)

    def _create(self, rows, summary: dict, source: str) -> dict:
        now = datetime.now(timezone.utc)
        dataset_id = f"ds-{uuid4().hex}"
        components = {"summary": "ready", "patterns": "queued", "model": "queued", "explanations": "queued", "anomalies": "queued", "recommendations": "queued", "clusters": "queued"}
        canonical_rows = rows.sort_values(["date", "dish_id", "time_slot"]).to_json(orient="records", date_format="iso")
        identity_input = f"{PIPELINE_VERSION}|rows=20000|dishes=30|days=366|context=none|{canonical_rows}"
        record = {"dataset_id": dataset_id, "source": source, "is_synthetic": source == "demo", "status": "processing", "created_at": now.isoformat(), "expires_at": (now + timedelta(hours=self.settings.dataset_ttl_hours)).isoformat(), "cache_identity": hashlib.sha256(identity_input.encode()).hexdigest(), "components": components, "summary": summary, "rows": canonical_rows}
        path = self._path(dataset_id)
        temporary = self.root / f".{dataset_id}.{uuid4().hex}.tmp"
        try:
            temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        return record

    def get(self, dataset_id: str) -> dict:
        path = self._path(dataset_id)
        try:
            record = self._load(path)
        except FileNotFoundError:
            raise KeyError(dataset_id) from None
        if datetime.fromisoformat(record["expires_at"]) <= datetime.now(timezone.utc):
            self._forget(path)
            raise KeyError(dataset_id)
        return record

    def reuse_finished_twin(self, dataset_id: str) -> bool:
        """Copy the results of an identical, already analysed dataset (no
        operations imported) into `dataset_id`. Lets every demo user after the
        first skip training: at import time, or when a job queued behind the
        first demo analysis reaches its turn. Returns False when no twin exists."""
        target = self.get(dataset_id)
        if target.get("operations"):
            return False
        for path, record in sorted(self._active(), key=lambda item: item[1]["created_at"], reverse=True):
            if record["dataset_id"] != dataset_id and record.get("status") == "ready" and not record.get("operations") and record["rows"] == target["rows"]:
                with self.lock(dataset_id):
                    target = self.get(dataset_id)
                    target.update({key: copy.deepcopy(record[key]) for key in ANALYSIS_KEYS if key in record})
                    self.update(dataset_id, target)
                return True
        return False

    def recover_pending(self) -> None:
        """End work left queued by a previous process before serving requests."""
        for path, record in self._active():
            pending = [key for key, state in record["components"].items() if state in {"queued", "running"}]
            if pending:
                for key in pending:
                    record["components"][key] = "error"
                    record.setdefault("component_limitations", {})[key] = ["Analysis was interrupted; import the dataset again to retry."]
                record["status"] = "partial"
                self.update(record["dataset_id"], record)

    def update(self, dataset_id: str, record: dict) -> None:
        """Atomically persist one analysis snapshot for a still-active dataset."""
        path = self._path(dataset_id)
        if not path.exists() or datetime.fromisoformat(record["expires_at"]) <= datetime.now(timezone.utc):
            raise KeyError(dataset_id)
        temporary = self.root / f".{dataset_id}.{uuid4().hex}.tmp"
        try:
            temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            for attempt in range(10):
                try:
                    os.replace(temporary, path)
                    with _cache_lock:
                        _cache.pop(path, None)
                    break
                except PermissionError:
                    if attempt == 9:
                        raise
                    time.sleep(0.01 * (attempt + 1))
        finally:
            temporary.unlink(missing_ok=True)
