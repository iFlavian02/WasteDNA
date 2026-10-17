"""Run owner calculations once per imported dataset and persist public results."""

import json
import logging

import pandas as pd

from app.analytics.model import analyze_model
from app.analytics.patterns import analyze_patterns
from app.decisions.recommendations import build_recommendations
from app.services.storage import DatasetStore

logger = logging.getLogger(__name__)


def run_analysis(store: DatasetStore, dataset_id: str) -> None:
    """Calculate independent components; one failure leaves other results usable."""
    record = store.get(dataset_id)
    rows = pd.DataFrame(json.loads(record["rows"]))
    rows["date"] = pd.to_datetime(rows["date"]).dt.date
    results = record.setdefault("results", {})
    limitations = record.setdefault("component_limitations", {})
    for name in ("patterns", "recommendations", "model", "explanations", "anomalies"):
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
        patterns = analyze_patterns(rows.copy(), None)
        save("patterns", patterns)
    except Exception:
        fail(("patterns", "recommendations"))
    else:
        try:
            save("recommendations", build_recommendations(patterns))
        except Exception:
            fail(("recommendations",))

    try:
        model = analyze_model(rows.copy(), None)
        save("model", model)
        for name, value in (("explanations", model.explanations), ("anomalies", model.anomalies)):
            record["components"][name] = model.status.value
            results[name] = value.model_dump(mode="json") if hasattr(value, "model_dump") else [item.model_dump(mode="json") for item in value]
            limitations[name] = model.limitations
        store.update(dataset_id, record)
    except Exception:
        fail(("model", "explanations", "anomalies"))

    # Clustering belongs to the later optional analysis step.
    record["components"]["clusters"] = "insufficient_data"
    limitations["clusters"] = ["Cluster analysis is not available for this dataset yet."]
    states = record["components"].values()
    record["status"] = "partial" if "error" in states else "ready"
    store.update(dataset_id, record)
