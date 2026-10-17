"""Guard: the deployed image must ship the redistribution demo data.

`POST /api/redistribution/demo` reads data/demo/redistribution/*.json at
runtime. If the Dockerfile (member 1's file) does not copy them, the hosted
app answers 500 on every page load. This test only reads the Dockerfile.
"""

import re
from pathlib import Path

import pytest

from app.redistribution.demo import DEMO_DIR

ROOT = Path(__file__).resolve().parents[3]
DEMO_FILES = ("donors.json", "organizations.json", "offers.json", "surplus_log.json")


def copied_sources(dockerfile: Path) -> list[str]:
    sources = []
    for line in dockerfile.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*COPY\s+(?!--from)(.+)", line, re.IGNORECASE)
        if match:
            parts = [part for part in match.group(1).split() if not part.startswith("--")]
            sources += [part.rstrip("/") for part in parts[:-1]]
    return sources


def ships(path: str, sources: list[str]) -> bool:
    return any(source in (".", "data") or path == source or path.startswith(source + "/") for source in sources)


def test_demo_data_files_exist_in_repository():
    assert DEMO_DIR == ROOT / "data" / "demo" / "redistribution"
    for name in DEMO_FILES:
        assert (DEMO_DIR / name).is_file(), name


def test_copy_parser_understands_dockerfile_syntax(tmp_path):
    dockerfile = tmp_path / "Dockerfile"
    dockerfile.write_text("FROM python:3.12\nCOPY --chown=app backend/app backend/app\nCOPY data/demo/redistribution/ data/demo/redistribution\nCOPY --from=build /x /y\n", encoding="utf-8")
    sources = copied_sources(dockerfile)
    assert sources == ["backend/app", "data/demo/redistribution"]
    assert ships("data/demo/redistribution/offers.json", sources)
    assert not ships("data/demo/restaurant_demo_synthetic.csv", sources)


@pytest.mark.xfail(
    reason="Waiting for member 1: COPY data/demo/redistribution in Dockerfile "
    "(docs/fixtures/platform/REQUESTS.md, request from member 3). Remove this marker once it passes.",
    strict=False,
)
def test_dockerfile_ships_redistribution_demo_data():
    sources = copied_sources(ROOT / "Dockerfile")
    missing = [name for name in DEMO_FILES if not ships(f"data/demo/redistribution/{name}", sources)]
    assert missing == [], f"Dockerfile does not copy: {missing}"
