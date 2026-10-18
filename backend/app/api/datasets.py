"""Restaurant dataset upload, demo import, status and summary routes."""

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.services.analysis_queue import QueueFull
from app.services.ingestion import InvalidDataset, parse_csv
from app.services.storage import DatasetStore
from app.services.summary import summarize
from app.services.orchestration import run_analysis
from app.contracts.platform import AnalysisResponse, ComponentEnvelope, SimulationEnvelope
from app.contracts.decisions import SimulationSelection, SimulationResult
from app.contracts.operations import OperationsImportResponse, OperationsRequest
from app.decisions.simulator import simulate
from app.services.operations import InvalidOperations, validate_for_dataset

router = APIRouter()
ROOT = Path(__file__).resolve().parents[3]


def store(request: Request) -> DatasetStore:
    return DatasetStore(request.app.state.settings)


@router.get("/template.csv")
def template():
    return FileResponse(ROOT / "data" / "template.csv", media_type="text/csv", filename="wastedna-template.csv")


def enqueue(request: Request, background_tasks: BackgroundTasks, dataset_id: str) -> None:
    """Analyse in the background, one dataset at a time (see AnalysisQueue)."""
    queue = request.app.state.analysis_queue
    background_tasks.add_task(queue.run, analyse_or_reuse, store(request), dataset_id, dataset_id=dataset_id)


def analyse_or_reuse(dataset_store: DatasetStore, dataset_id: str) -> None:
    """Reuse an identical finished analysis (e.g. ten people loading the demo
    at once: only the first trains), otherwise run the full pipeline."""
    if not dataset_store.reuse_finished_twin(dataset_id):
        run_analysis(dataset_store, dataset_id)


def imported(request: Request, background_tasks: BackgroundTasks, content: bytes, source: str):
    try:
        rows = parse_csv(content)
    except InvalidDataset as exc:
        return request.app.state.error_response(422, "INVALID_DATA", str(exc), request, exc.details)
    try:
        request.app.state.analysis_queue.check_capacity()
    except QueueFull as exc:
        raise HTTPException(503, str(exc)) from None
    dataset_store = store(request)
    try:
        record = dataset_store.create(content, rows, summarize(rows), source)
    except OverflowError as exc:
        raise HTTPException(409, str(exc)) from None
    if source == "demo" and dataset_store.reuse_finished_twin(record["dataset_id"]):
        record = dataset_store.get(record["dataset_id"])
    else:
        enqueue(request, background_tasks, record["dataset_id"])
    return JSONResponse(status_code=202, content={key: record[key] for key in ("dataset_id", "source", "is_synthetic", "status", "created_at")})


@router.post("/datasets", status_code=202)
async def upload(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    limit = request.app.state.settings.max_upload_bytes
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "CSV exceeds the upload size limit.")
    return imported(request, background_tasks, content, "upload")


@router.post("/datasets/demo", status_code=202)
def demo(request: Request, background_tasks: BackgroundTasks):
    content = (ROOT / "data" / "demo" / "restaurant_demo_synthetic.csv").read_bytes()
    return imported(request, background_tasks, content, "demo")


def lookup(request: Request, dataset_id: str) -> dict:
    try:
        return store(request).get(dataset_id)
    except KeyError:
        raise HTTPException(404, "Dataset not found or expired.") from None


@router.get("/datasets/{dataset_id}")
def status(request: Request, dataset_id: str):
    record = lookup(request, dataset_id)
    return {
        **{key: record[key] for key in ("dataset_id", "source", "is_synthetic", "status", "components")},
        "operations_version": record.get("operations_version", 0),
        "queue": request.app.state.analysis_queue.position(dataset_id),
    }


@router.get("/datasets/{dataset_id}/summary", response_model=ComponentEnvelope)
def summary(request: Request, dataset_id: str):
    return {"status": "ready", "result": lookup(request, dataset_id)["summary"], "limitations": ["Unsold portions do not prove that food was discarded."]}


@router.get("/datasets/{dataset_id}/analysis", response_model=AnalysisResponse)
def analysis(request: Request, dataset_id: str):
    record = lookup(request, dataset_id)
    components = record["components"]
    return {
        "dataset_id": dataset_id,
        "source": record["source"],
        "is_synthetic": record["is_synthetic"],
        "status": record["status"],
        "components": components,
        "summary": record["summary"],
        "patterns": record.get("results", {}).get("patterns", {}).get("items"),
        "model": record.get("results", {}).get("model"),
        "anomalies": record.get("results", {}).get("anomalies"),
        "explanations": record.get("results", {}).get("explanations"),
        "recommendations": record.get("results", {}).get("recommendations", {}).get("items"),
        "clusters": record.get("results", {}).get("clusters"),
        "limitations": ["Unsold portions do not prove that food was discarded."],
    }


@router.post(
    "/datasets/{dataset_id}/operations",
    status_code=202,
    response_model=OperationsImportResponse,
)
def import_operations(
    request: Request,
    background_tasks: BackgroundTasks,
    dataset_id: str,
    payload: OperationsRequest,
):
    dataset_store = store(request)
    record = lookup(request, dataset_id)
    rows = pd.DataFrame(json.loads(record["rows"]))
    try:
        validate_for_dataset(payload, rows)
    except InvalidOperations as exc:
        raise HTTPException(422, str(exc)) from None
    previous_version = record.get("operations_version", 0)
    with dataset_store.lock(dataset_id):
        response = _replace_operations(request, dataset_store, dataset_id, payload)
    if response.operations_version != previous_version:
        enqueue(request, background_tasks, dataset_id)
    return response


def _replace_operations(request: Request, dataset_store: DatasetStore, dataset_id: str, payload: OperationsRequest) -> OperationsImportResponse:
    """Version check and write; the caller holds the dataset lock."""
    record = lookup(request, dataset_id)
    snapshot = payload.model_dump(mode="json", exclude={"expected_version"})
    current_version = record.get("operations_version", 0)
    if snapshot == record.get("operations"):
        return OperationsImportResponse(dataset_id=dataset_id, status=record["status"], hourly_observations=len(payload.hourly_observations), menu_versions=len(payload.menu_versions), opening_hours=len(payload.opening_hours), operations_version=current_version)
    if payload.expected_version != current_version:
        raise HTTPException(409, "Operations version conflict.")
    record["operations"] = snapshot
    record["operations_version"] = current_version + 1
    record["operations_imported_at"] = datetime.now(timezone.utc).isoformat()
    record.pop("private_model_artifact", None)
    dependent = (
        "patterns",
        "recommendations",
        "model",
        "explanations",
        "anomalies",
        "clusters",
    )
    for component_name in dependent:
        record["components"][component_name] = "queued"
        record.setdefault("results", {}).pop(component_name, None)
        record.setdefault("component_limitations", {}).pop(component_name, None)
    record["status"] = "processing"
    dataset_store.update(dataset_id, record)
    return OperationsImportResponse(
        dataset_id=dataset_id,
        status="processing",
        hourly_observations=len(payload.hourly_observations),
        menu_versions=len(payload.menu_versions),
        opening_hours=len(payload.opening_hours),
        operations_version=record["operations_version"],
    )


@router.get("/datasets/{dataset_id}/operations")
def get_operations(request: Request, dataset_id: str):
    record = lookup(request, dataset_id)
    return {"dataset_id": dataset_id, "operations_version": record.get("operations_version", 0), "operations": record.get("operations")}


@router.get("/datasets/{dataset_id}/{component}", response_model=ComponentEnvelope)
def component(request: Request, dataset_id: str, component: str):
    if component not in {"patterns", "model", "explanations", "anomalies", "recommendations", "clusters"}:
        raise HTTPException(404, "Component not found.")
    record = lookup(request, dataset_id)
    state = record["components"][component]
    response = ComponentEnvelope(status=state, result=record.get("results", {}).get(component), limitations=record.get("component_limitations", {}).get(component, []))
    return JSONResponse(status_code=202 if state in {"queued", "running"} else 200, content=response.model_dump(mode="json"))


@router.post("/datasets/{dataset_id}/simulate", response_model=SimulationEnvelope)
def simulation(request: Request, dataset_id: str, selection: SimulationSelection):
    record = lookup(request, dataset_id)
    rows = pd.DataFrame(json.loads(record["rows"]))
    rows["date"] = pd.to_datetime(rows["date"]).dt.date
    result: SimulationResult = simulate(rows, selection)
    return SimulationEnvelope(status=result.status, result=result, limitations=result.limitations)
