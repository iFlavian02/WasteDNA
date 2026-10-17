"""Atomic, bounded dataset snapshots with expiration on access."""

import hashlib
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.config import Settings

ID_PATTERN = re.compile(r"^ds-[0-9a-f]{32}$")
PIPELINE_VERSION = "platform-summary-v1"


class DatasetStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.root = settings.data_dir.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, dataset_id: str) -> Path:
        if not ID_PATTERN.fullmatch(dataset_id):
            raise KeyError(dataset_id)
        return self.root / f"{dataset_id}.json"

    def _active(self) -> list[Path]:
        active = []
        for path in self.root.glob("ds-*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if datetime.fromisoformat(record["expires_at"]) > datetime.now(timezone.utc):
                    active.append(path)
                else:
                    path.unlink()
            except (ValueError, KeyError):
                continue
        return active

    def create(self, content: bytes, rows, summary: dict, source: str) -> dict:
        active = self._active()
        if len(active) >= self.settings.max_datasets:
            raise OverflowError("Maximum active datasets reached.")
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
            record = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise KeyError(dataset_id) from None
        if datetime.fromisoformat(record["expires_at"]) <= datetime.now(timezone.utc):
            path.unlink(missing_ok=True)
            raise KeyError(dataset_id)
        return record

    def recover_pending(self) -> None:
        """End work left queued by a previous process before serving requests."""
        for path in self._active():
            record = json.loads(path.read_text(encoding="utf-8"))
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
                    break
                except PermissionError:
                    if attempt == 9:
                        raise
                    time.sleep(0.01 * (attempt + 1))
        finally:
            temporary.unlink(missing_ok=True)
