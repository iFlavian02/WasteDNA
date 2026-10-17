"""Restaurant dataset upload, demo import, status and summary routes."""

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.services.ingestion import InvalidDataset, parse_csv
from app.services.storage import DatasetStore
from app.services.summary import summarize

router = APIRouter()
ROOT = Path(__file__).resolve().parents[3]


def store(request: Request) -> DatasetStore:
    return DatasetStore(request.app.state.settings)


@router.get("/template.csv")
def template():
    return FileResponse(ROOT / "data" / "template.csv", media_type="text/csv", filename="wastedna-template.csv")


def imported(request: Request, content: bytes, source: str):
    try:
        rows = parse_csv(content)
    except InvalidDataset as exc:
        return request.app.state.error_response(422, "INVALID_DATA", str(exc), request, exc.details)
    try:
        record = store(request).create(content, rows, summarize(rows), source)
    except OverflowError as exc:
        raise HTTPException(409, str(exc)) from None
    return JSONResponse(status_code=202, content={key: record[key] for key in ("dataset_id", "source", "is_synthetic", "status", "created_at")})


@router.post("/datasets", status_code=202)
async def upload(request: Request, file: UploadFile = File(...)):
    limit = request.app.state.settings.max_upload_bytes
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "CSV exceeds the upload size limit.")
    return imported(request, content, "upload")


@router.post("/datasets/demo", status_code=202)
def demo(request: Request):
    content = (ROOT / "data" / "demo" / "restaurant_minimal_synthetic.csv").read_bytes()
    return imported(request, content, "demo")


def lookup(request: Request, dataset_id: str) -> dict:
    try:
        return store(request).get(dataset_id)
    except KeyError:
        raise HTTPException(404, "Dataset not found or expired.") from None


@router.get("/datasets/{dataset_id}")
def status(request: Request, dataset_id: str):
    record = lookup(request, dataset_id)
    return {key: record[key] for key in ("dataset_id", "source", "is_synthetic", "status", "components")}


@router.get("/datasets/{dataset_id}/summary")
def summary(request: Request, dataset_id: str):
    return {"status": "ready", "result": lookup(request, dataset_id)["summary"], "limitations": ["Unsold portions do not prove that food was discarded."]}
