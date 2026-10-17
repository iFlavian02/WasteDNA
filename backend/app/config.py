"""Runtime settings shared by platform and domain modules."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Settings(BaseModel):
    app_mode: Literal["normal", "fixtures"] = "normal"
    data_dir: Path = Path("backend/.runtime")
    redistribution_db_path: Path = Path("backend/.runtime-redistribution/redistribution.sqlite3")
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    max_upload_bytes: int = Field(default=5_000_000, gt=0)
    dataset_ttl_hours: int = Field(default=24, gt=0)
    max_datasets: int = Field(default=3, gt=0)

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        if any(origin == "*" or not origin.startswith(("http://", "https://")) for origin in origins):
            raise ValueError("CORS origins must be explicit HTTP(S) origins")
        return origins


@lru_cache
def get_settings() -> Settings:
    import os

    return Settings(
        app_mode=os.getenv("APP_MODE", "normal"),
        data_dir=os.getenv("DATA_DIR", "backend/.runtime"),
        redistribution_db_path=os.getenv("REDISTRIBUTION_DB_PATH", "backend/.runtime-redistribution/redistribution.sqlite3"),
        cors_origins=[s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if s.strip()],
        max_upload_bytes=os.getenv("MAX_UPLOAD_BYTES", "5000000"),
        dataset_ttl_hours=os.getenv("DATASET_TTL_HOURS", "24"),
        max_datasets=os.getenv("MAX_DATASETS", "3"),
    )
