"""SQLite persistence for redistribution, isolated per demo session.

The database file is separate from the analytics `DATA_DIR/{dataset_id}` cache
and its TTL: cleaning analytics never deletes offers or handover records.
Every operation runs in a `BEGIN IMMEDIATE` transaction, which serializes
writers so reservation and handover checks are atomic with their writes.
"""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

from app.redistribution.schemas import Donor, Offer, Organization, Reservation

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    is_synthetic INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS donors (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
);
CREATE TABLE IF NOT EXISTS organizations (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
);
CREATE TABLE IF NOT EXISTS offers (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'collected', 'expired', 'cancelled')),
    version INTEGER NOT NULL CHECK (version >= 1),
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
);
CREATE TABLE IF NOT EXISTS reservations (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'released', 'cancelled', 'expired', 'collected')),
    quantity_kg REAL NOT NULL CHECK (quantity_kg > 0),
    service_date TEXT NOT NULL,
    reserved_at TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation_per_offer
    ON reservations (session_id, offer_id) WHERE status IN ('reserved', 'collected');
CREATE TABLE IF NOT EXISTS handovers (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    reservation_id TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    offered_quantity_kg REAL NOT NULL,
    received_quantity_kg REAL NOT NULL CHECK (received_quantity_kg > 0),
    received_at TEXT NOT NULL,
    service_date TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    PRIMARY KEY (session_id, reservation_id)
);
CREATE TABLE IF NOT EXISTS idempotency (
    session_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (session_id, scope, key)
);
CREATE TABLE IF NOT EXISTS transitions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    at TEXT NOT NULL
);
"""


class Repository:
    """Opens one short-lived connection per transaction; safe across threads."""

    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        ignore = self.db_path.parent / ".gitignore"
        if not ignore.exists():
            ignore.write_text("*\n", encoding="utf-8")
        with self.transaction() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def transaction(self) -> Iterator["Tx"]:
        conn = sqlite3.connect(self.db_path, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield Tx(conn)
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")
        finally:
            conn.close()


class Tx:
    """Data access inside one transaction. Contains no business rules."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def executescript(self, script: str) -> None:
        for statement in filter(str.strip, script.split(";")):
            self.conn.execute(statement)

    # Sessions and directories
    def create_session(self, session_id: str, is_synthetic: bool, at: datetime) -> None:
        self.conn.execute("INSERT INTO sessions VALUES (?, ?, ?)", (session_id, int(is_synthetic), at.isoformat()))

    def session_is_synthetic(self, session_id: str) -> bool | None:
        row = self.conn.execute("SELECT is_synthetic FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return None if row is None else bool(row["is_synthetic"])

    def add_donor(self, session_id: str, donor: Donor) -> None:
        self.conn.execute("INSERT INTO donors VALUES (?, ?, ?)", (session_id, donor.id, donor.model_dump_json()))

    def add_organization(self, session_id: str, org: Organization) -> None:
        self.conn.execute("INSERT INTO organizations VALUES (?, ?, ?)", (session_id, org.id, org.model_dump_json()))

    def donors(self, session_id: str) -> list[Donor]:
        rows = self.conn.execute("SELECT data FROM donors WHERE session_id = ? ORDER BY id", (session_id,))
        return [Donor.model_validate_json(row["data"]) for row in rows]

    def donor(self, session_id: str, donor_id: str) -> Donor | None:
        row = self.conn.execute("SELECT data FROM donors WHERE session_id = ? AND id = ?", (session_id, donor_id)).fetchone()
        return None if row is None else Donor.model_validate_json(row["data"])

    def organizations(self, session_id: str) -> list[Organization]:
        rows = self.conn.execute("SELECT data FROM organizations WHERE session_id = ? ORDER BY id", (session_id,))
        return [Organization.model_validate_json(row["data"]) for row in rows]

    def organization(self, session_id: str, org_id: str) -> Organization | None:
        row = self.conn.execute("SELECT data FROM organizations WHERE session_id = ? AND id = ?", (session_id, org_id)).fetchone()
        return None if row is None else Organization.model_validate_json(row["data"])

    # Offers
    def insert_offer(self, session_id: str, offer: Offer) -> None:
        self.conn.execute(
            "INSERT INTO offers VALUES (?, ?, ?, ?, ?)",
            (session_id, offer.id, offer.status, offer.version, offer.model_dump_json()),
        )

    def save_offer(self, session_id: str, offer: Offer) -> None:
        self.conn.execute(
            "UPDATE offers SET status = ?, version = ?, data = ? WHERE session_id = ? AND id = ?",
            (offer.status, offer.version, offer.model_dump_json(), session_id, offer.id),
        )

    def offers(self, session_id: str, statuses: tuple[str, ...] | None = None) -> list[Offer]:
        query, params = "SELECT data FROM offers WHERE session_id = ?", [session_id]
        if statuses:
            query += f" AND status IN ({', '.join('?' * len(statuses))})"
            params.extend(statuses)
        return [Offer.model_validate_json(row["data"]) for row in self.conn.execute(query, params)]

    def offer(self, session_id: str, offer_id: str) -> Offer | None:
        row = self.conn.execute("SELECT data FROM offers WHERE session_id = ? AND id = ?", (session_id, offer_id)).fetchone()
        return None if row is None else Offer.model_validate_json(row["data"])

    # Reservations
    def insert_reservation(self, session_id: str, reservation: Reservation, quantity_kg: float, service_day: date) -> None:
        self.conn.execute(
            "INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                session_id, reservation.reservation_id, reservation.offer_id, reservation.organization_id,
                reservation.status, quantity_kg, service_day.isoformat(), reservation.reserved_at.isoformat(),
            ),
        )

    def set_reservation_status(self, session_id: str, reservation_id: str, status: str) -> None:
        self.conn.execute("UPDATE reservations SET status = ? WHERE session_id = ? AND id = ?", (status, session_id, reservation_id))

    def reservation(self, session_id: str, reservation_id: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM reservations WHERE session_id = ? AND id = ?", (session_id, reservation_id)).fetchone()

    def reservations(self, session_id: str, status: str | None = None) -> list[sqlite3.Row]:
        query, params = "SELECT * FROM reservations WHERE session_id = ?", [session_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        return list(self.conn.execute(query + " ORDER BY reserved_at, id", params))

    def active_reservation_for_offer(self, session_id: str, offer_id: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT * FROM reservations WHERE session_id = ? AND offer_id = ? AND status = 'reserved'", (session_id, offer_id)
        ).fetchone()

    def committed_kg(self, session_id: str, service_day: date, exclude_offer_id: str | None = None) -> dict[str, float]:
        """Capacity used per organization on one local day: active reservations
        plus confirmed handovers (a collected reservation counts via its handover)."""
        day, excluded = service_day.isoformat(), exclude_offer_id or ""
        rows = self.conn.execute(
            """
            SELECT organization_id, SUM(kg) AS kg FROM (
                SELECT organization_id, quantity_kg AS kg FROM reservations
                WHERE session_id = ? AND service_date = ? AND status = 'reserved' AND offer_id != ?
                UNION ALL
                SELECT organization_id, received_quantity_kg AS kg FROM handovers
                WHERE session_id = ? AND service_date = ? AND offer_id != ?
            ) GROUP BY organization_id
            """,
            (session_id, day, excluded, session_id, day, excluded),
        )
        return {row["organization_id"]: row["kg"] for row in rows}

    # Handovers
    def insert_handover(self, session_id: str, values: dict) -> None:
        self.conn.execute(
            "INSERT INTO handovers VALUES (:session_id, :reservation_id, :offer_id, :organization_id, :offered_quantity_kg,"
            " :received_quantity_kg, :received_at, :service_date, :idempotency_key)",
            {"session_id": session_id, **values},
        )

    def handover(self, session_id: str, reservation_id: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT * FROM handovers WHERE session_id = ? AND reservation_id = ?", (session_id, reservation_id)
        ).fetchone()

    def handovers(self, session_id: str) -> list[sqlite3.Row]:
        return list(self.conn.execute("SELECT * FROM handovers WHERE session_id = ? ORDER BY received_at", (session_id,)))

    # Idempotency and history
    def idempotent_response(self, session_id: str, scope: str, key: str) -> tuple[str, dict] | None:
        row = self.conn.execute(
            "SELECT request_hash, response FROM idempotency WHERE session_id = ? AND scope = ? AND key = ?", (session_id, scope, key)
        ).fetchone()
        return None if row is None else (row["request_hash"], json.loads(row["response"]))

    def remember_response(self, session_id: str, scope: str, key: str, request_hash: str, response: dict) -> None:
        self.conn.execute("INSERT INTO idempotency VALUES (?, ?, ?, ?, ?)", (session_id, scope, key, request_hash, json.dumps(response)))

    def record_transition(self, session_id: str, entity: str, entity_id: str, from_status: str | None, to_status: str, at: datetime) -> None:
        self.conn.execute(
            "INSERT INTO transitions (session_id, entity, entity_id, from_status, to_status, at) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, entity, entity_id, from_status, to_status, at.isoformat()),
        )

    def transitions(self, session_id: str, entity_id: str | None = None) -> list[sqlite3.Row]:
        query, params = "SELECT * FROM transitions WHERE session_id = ?", [session_id]
        if entity_id:
            query += " AND entity_id = ?"
            params.append(entity_id)
        return list(self.conn.execute(query + " ORDER BY seq", params))
