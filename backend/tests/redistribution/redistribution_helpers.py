"""Shared constants for redistribution tests (unique module name avoids
collisions with other members' test helpers)."""

from datetime import datetime

from app.redistribution.geo import BUCHAREST

# Saturday 10:00 local: demo offers land today between 16:00 and 20:00.
NOW = datetime(2026, 10, 17, 10, 0, tzinfo=BUCHAREST)
