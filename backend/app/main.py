"""FastAPI application factory."""

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.health import router as health_router
from app.api.breakdown import router as breakdown_router
from app.api.datasets import router as datasets_router
from app.api.inventory import router as inventory_router
from app.api.redistribution import router as redistribution_router
from app.config import Settings, get_settings
from app.contracts.common import ApiError, ErrorDetail, ErrorResponse
from app.services.storage import DatasetStore


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="WasteDNA API")
    app.state.settings = settings
    DatasetStore(settings).recover_pending()
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["*"])
    app.include_router(health_router, prefix="/api")
    # Before the datasets router: its `/datasets/{id}/{component}` route would catch `/breakdown`.
    app.include_router(breakdown_router, prefix="/api")
    app.include_router(datasets_router, prefix="/api")
    app.include_router(inventory_router, prefix="/api")
    app.include_router(redistribution_router, prefix="/api/redistribution")

    def error_response(status: int, code: str, message: str, request: Request, details: list[ErrorDetail] | None = None) -> JSONResponse:
        payload = ErrorResponse(error=ApiError(code=code, message=message, details=details or [], request_id=f"req-{uuid4().hex}"))
        return JSONResponse(status_code=status, content=payload.model_dump())

    app.state.error_response = error_response

    @app.exception_handler(RequestValidationError)
    async def request_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [ErrorDetail(field=".".join(map(str, item["loc"])), message=item["msg"], code=item["type"]) for item in exc.errors()]
        status = 422 if request.url.path.endswith("/operations") else 400
        return error_response(status, "VALIDATION_ERROR", "The request contains invalid fields.", request, details)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 409: "CONFLICT", 413: "UPLOAD_TOO_LARGE", 422: "INVALID_DATA"}.get(exc.status_code, "HTTP_ERROR")
        return error_response(exc.status_code, code, str(exc.detail), request)

    @app.exception_handler(Exception)
    async def server_error(request: Request, exc: Exception) -> JSONResponse:
        return error_response(500, "INTERNAL_ERROR", "An unexpected server error occurred.", request)

    return app


app = create_app()
