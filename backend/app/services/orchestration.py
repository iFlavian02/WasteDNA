"""Run owner calculations once per imported dataset and persist public results."""

import json
import logging
from base64 import b64encode
from hashlib import sha256

import pandas as pd
from pathlib import Path

from app.analytics.clustering import cluster_profiles
from app.analytics.model import analyze_model, serialize_model_artifacts
from app.analytics.patterns import (
    analyze_hourly_patterns,
    analyze_patterns,
    merge_pattern_results,
)
from app.contracts.operations import OperationsImport
from app.decisions.recommendations import build_recommendations
from app.services.operations import build_hourly_analysis_rows
from app.services.storage import DatasetStore

logger = logging.getLogger(__name__)
CONTEXT_PATH = Path(__file__).resolve().parents[3] / "data" / "context" / "context_daily.csv"


def load_context(rows: pd.DataFrame) -> pd.DataFrame | None:
    """Load only dates present in the dataset; keep unmatched dates missing."""
    if not CONTEXT_PATH.exists():
        return None
    context = pd.read_csv(CONTEXT_PATH, parse_dates=["date"])
    if context["date"].duplicated().any():
        raise ValueError("context dates must be unique")
    dates = pd.to_datetime(rows["date"].unique())
    return context.loc[context["date"].isin(dates)].copy()


def run_analysis(store: DatasetStore, dataset_id: str) -> None:
    """Calculate independent components; one failure leaves other results usable."""
    record = store.get(dataset_id)
    rows = pd.DataFrame(json.loads(record["rows"]))
    rows["date"] = pd.to_datetime(rows["date"]).dt.date
    results = record.setdefault("results", {})
    limitations = record.setdefault("component_limitations", {})
    record.pop("private_model_artifact", None)
    for name in ("patterns", "recommendations", "model", "explanations", "anomalies", "clusters"):
        record["components"][name] = "running"
    store.update(dataset_id, record)

    def save(name: str, result) -> None:
        record["components"][name] = result.status.value
        results[name] = result.model_dump(mode="json")
        limitations[name] = result.limitations
        store.update(dataset_id, record)

    def fail(names: tuple[str, ...]) -> None:
        logger.exception("Dataset analysis failed: %s", ", ".join(names))
        for name in names:
            record["components"][name] = "error"
            limitations[name] = ["This analysis could not be completed. The summary remains available."]
        store.update(dataset_id, record)

    try:
        context = load_context(rows)
    except Exception:
        fail(("patterns", "recommendations", "model", "explanations", "anomalies"))
        context = None

    record["cache_identity"] = _analysis_identity(record, context)
    store.update(dataset_id, record)

    if record["components"]["patterns"] != "error":
        try:
            patterns = analyze_patterns(rows.copy(), context)
            if record.get("operations"):
                operations = OperationsImport.model_validate(record["operations"])
                hourly_rows = build_hourly_analysis_rows(operations, rows)
                patterns = merge_pattern_results(
                    patterns,
                    analyze_hourly_patterns(hourly_rows),
                )
            save("patterns", patterns)
        except Exception:
            fail(("patterns", "recommendations"))
        else:
            try:
                save("recommendations", build_recommendations(patterns))
            except Exception:
                fail(("recommendations",))

    if record["components"]["model"] != "error":
        try:
            model = analyze_model(rows.copy(), context)
            save("model", model)
            if model.artifacts is not None:
                record["private_model_artifact"] = b64encode(
                    serialize_model_artifacts(model.artifacts)
                ).decode("ascii")
            for name, value in (("explanations", model.explanations), ("anomalies", model.anomalies)):
                record["components"][name] = model.status.value
                results[name] = value.model_dump(mode="json") if hasattr(value, "model_dump") else [item.model_dump(mode="json") for item in value]
                limitations[name] = model.limitations
            store.update(dataset_id, record)
        except Exception:
            fail(("model", "explanations", "anomalies"))

    try:
        save("clusters", cluster_profiles(rows.copy()))
    except Exception:
        fail(("clusters",))
    states = record["components"].values()
    record["status"] = "partial" if "error" in states else "ready"
    store.update(dataset_id, record)


def _analysis_identity(record: dict, context: pd.DataFrame | None) -> str:
    if context is None:
        canonical_context = None
    else:
        canonical_context = (
            context.sort_values("date", kind="mergesort")
            .sort_index(axis=1)
            .to_json(orient="records", date_format="iso")
        )
    payload = json.dumps(
        {
            "pipeline": "analytics-v2",
            "rows": record["rows"],
            "context": canonical_context,
            "operations": record.get("operations"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(payload.encode("utf-8")).hexdigest()
