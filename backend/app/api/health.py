"""Dependency health probe."""

from importlib import import_module
from importlib.metadata import version

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    versions: dict[str, str]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    libraries = {"pandas": "pandas", "scikit-learn": "sklearn", "shap": "shap"}
    for module in libraries.values():
        import_module(module)
    return HealthResponse(status="ok", versions={package: version(package) for package in libraries})
