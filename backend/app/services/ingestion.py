"""Strict restaurant CSV parsing shared by upload and demo import."""

import csv
import io
import math
from datetime import date

import pandas as pd

from app.contracts.common import ErrorDetail

REQUIRED = ("date", "dish_id", "dish_name", "category", "time_slot", "prepared_qty", "sold_qty", "unit_cost_ron")
OPTIONAL = ("unit_price_ron", "stockout_confirmed")


class InvalidDataset(ValueError):
    def __init__(self, details: list[ErrorDetail]):
        self.details = details
        super().__init__("The CSV contains invalid data.")


def parse_csv(content: bytes) -> pd.DataFrame:
    try:
        source = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise InvalidDataset([ErrorDetail(field="file", code="INVALID_ENCODING", message="Use UTF-8 encoding.")]) from None
    first = source.splitlines()[0] if source.splitlines() else ""
    if first.count(",") and first.count(";") or not (first.count(",") or first.count(";")):
        raise InvalidDataset([ErrorDetail(field="file", code="AMBIGUOUS_DELIMITER", message="Use either commas or semicolons.")])
    delimiter = "," if first.count(",") else ";"
    reader = csv.DictReader(io.StringIO(source, newline=""), delimiter=delimiter, restkey="_extra")
    columns = reader.fieldnames or []
    if len(columns) != len(set(columns)) or any(column not in REQUIRED + OPTIONAL for column in columns) or any(column not in columns for column in REQUIRED):
        raise InvalidDataset([ErrorDetail(field="file", code="INVALID_HEADER", message="CSV columns do not match the template.")])
    rows = []
    errors: list[ErrorDetail] = []
    seen = set()
    dishes = {}
    dates = set()
    for line, raw in enumerate(reader, start=2):
        if line > 20001:
            errors.append(ErrorDetail(row=line, code="ROW_LIMIT", message="Maximum 20,000 rows."))
            break
        if "_extra" in raw or any(value is None for value in raw.values()):
            errors.append(ErrorDetail(row=line, code="COLUMN_COUNT", message="Column count does not match header."))
            continue
        row = {key: (value or "").strip() for key, value in raw.items()}
        try:
            row["date"] = date.fromisoformat(row["date"])
            if row["date"].isoformat() != raw["date"].strip():
                raise ValueError()
        except ValueError:
            errors.append(ErrorDetail(row=line, field="date", code="INVALID_DATE", message="Use YYYY-MM-DD."))
            continue
        dates.add(row["date"])
        if not all(row[column] for column in ("dish_id", "dish_name", "category")):
            errors.append(ErrorDetail(row=line, code="REQUIRED_VALUE", message="Dish ID, name and category are required."))
        if row["time_slot"] not in ("lunch", "dinner"):
            errors.append(ErrorDetail(row=line, field="time_slot", code="INVALID_TIME_SLOT", message="Use lunch or dinner."))
        for column in ("prepared_qty", "sold_qty"):
            try:
                value = int(row[column])
                if str(value) != row[column] or value < 0:
                    raise ValueError()
                row[column] = value
            except ValueError:
                errors.append(ErrorDetail(row=line, field=column, code="INVALID_QUANTITY", message="Use a non-negative integer."))
        for column in ("unit_cost_ron", "unit_price_ron"):
            if column not in row or column == "unit_price_ron" and not row[column]:
                row[column] = None
                continue
            try:
                value = float(row[column])
                if not math.isfinite(value) or value <= 0:
                    raise ValueError()
                row[column] = value
            except ValueError:
                errors.append(ErrorDetail(row=line, field=column, code="INVALID_MONEY", message="Use a finite positive number."))
        if "stockout_confirmed" in row:
            if row["stockout_confirmed"].lower() not in ("true", "false", ""):
                errors.append(ErrorDetail(row=line, field="stockout_confirmed", code="INVALID_BOOLEAN", message="Use true or false."))
            row["stockout_confirmed"] = {"true": True, "false": False, "": None}.get(row["stockout_confirmed"].lower())
        if isinstance(row.get("sold_qty"), int) and isinstance(row.get("prepared_qty"), int) and row["sold_qty"] > row["prepared_qty"]:
            errors.append(ErrorDetail(row=line, field="sold_qty", code="SOLD_EXCEEDS_PREPARED", message="Sold cannot exceed prepared."))
        key = (row["date"], row["dish_id"], row["time_slot"])
        if key in seen:
            errors.append(ErrorDetail(row=line, code="DUPLICATE_ROW", message="Date, dish and time slot must be unique."))
        seen.add(key)
        dish = (row["dish_name"], row["category"], row["unit_cost_ron"])
        if row["dish_id"] in dishes and dishes[row["dish_id"]] != dish:
            errors.append(ErrorDetail(row=line, code="INCONSISTENT_DISH", message="Dish name, category and cost must stay consistent."))
        dishes[row["dish_id"]] = dish
        rows.append(row)
    if not rows and not errors:
        errors.append(ErrorDetail(field="file", code="EMPTY_DATASET", message="CSV must contain at least one row."))
    if len(dishes) > 30:
        errors.append(ErrorDetail(field="dish_id", code="DISH_LIMIT", message="Maximum 30 dishes."))
    if dates and (max(dates) - min(dates)).days + 1 > 366:
        errors.append(ErrorDetail(field="date", code="DATE_LIMIT", message="Maximum 366 calendar days."))
    if errors:
        raise InvalidDataset(errors)
    return pd.DataFrame(rows)
