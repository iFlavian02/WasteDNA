"""Routes for the simulated inventory connection (docs/INVENTORY.md)."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.inventory.service import InventoryError, connect, connection_info, local_today, reset, simulate
from app.services.orchestration import run_analysis
from app.services.storage import DatasetStore

router = APIRouter()


class SimulateRequest(BaseModel):
    days: int = Field(default=30, ge=1, le=90)


def _store(request: Request) -> DatasetStore:
    return DatasetStore(request.app.state.settings)


def _call(function, *args):
    try:
        return function(*args)
    except InventoryError as exc:
        raise HTTPException(exc.status, str(exc)) from None


@router.post("/inventory/connect")
def connect_inventory(request: Request, background_tasks: BackgroundTasks):
    """Connected dataset for this demo: 200 when reused, 202 when created."""
    store = _store(request)
    record, created = _call(connect, store, local_today())
    if created:
        background_tasks.add_task(run_analysis, store, record["dataset_id"])
    return JSONResponse(status_code=202 if created else 200, content=connection_info(record))


@router.get("/inventory/{dataset_id}")
def inventory_status(request: Request, dataset_id: str):
    store = _store(request)
    try:
        record = store.get(dataset_id)
    except KeyError:
        raise HTTPException(404, "Dataset not found or expired.") from None
    if "inventory" not in record:
        raise HTTPException(404, "This dataset is not a connected inventory.")
    return connection_info(record)


@router.post("/inventory/{dataset_id}/simulate", status_code=202)
def simulate_days(request: Request, background_tasks: BackgroundTasks, dataset_id: str, body: SimulateRequest | None = None):
    store = _store(request)
    record = _call(simulate, store, dataset_id, (body or SimulateRequest()).days)
    background_tasks.add_task(run_analysis, store, dataset_id)
    return connection_info(record)


@router.post("/inventory/{dataset_id}/reset", status_code=202)
def reset_history(request: Request, background_tasks: BackgroundTasks, dataset_id: str):
    store = _store(request)
    record = _call(reset, store, dataset_id, local_today())
    background_tasks.add_task(run_analysis, store, dataset_id)
    return connection_info(record)
