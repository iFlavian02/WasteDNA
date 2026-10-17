"""Common transport states and error responses."""

from enum import StrEnum

from pydantic import BaseModel, Field


class ComponentState(StrEnum):
    queued = "queued"
    running = "running"
    ready = "ready"
    insufficient_data = "insufficient_data"
    error = "error"


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str
    code: str | None = None
    row: int | None = None


class ApiError(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str


class ErrorResponse(BaseModel):
    error: ApiError
