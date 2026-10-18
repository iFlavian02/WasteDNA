"""FIFO gate that limits how many dataset analyses train at the same time.

Imports still hand their job to FastAPI `BackgroundTasks` (a thread-pool
thread), but each job waits here for its turn, so ten simultaneous uploads
train one after another instead of all at once on a 1-CPU host. The status
route reads `position()` so the UI can show "N analyses ahead of yours".
"""

import logging
import threading
from collections import deque
from collections.abc import Callable

logger = logging.getLogger(__name__)


class QueueFull(RuntimeError):
    pass


class AnalysisQueue:
    def __init__(self, workers: int = 1, max_waiting: int = 25):
        self.workers = workers
        self.max_waiting = max_waiting
        self._cond = threading.Condition()
        self._waiting: deque[str] = deque()
        self._running: list[str] = []

    def check_capacity(self) -> None:
        """Raise QueueFull before a new import is saved, when the line is too long."""
        with self._cond:
            if len(self._waiting) >= self.max_waiting:
                raise QueueFull("The analysis queue is full. Try again in a minute.")

    def position(self, dataset_id: str) -> dict | None:
        """`None` once the dataset is neither waiting nor running."""
        with self._cond:
            if dataset_id in self._running:
                return {"state": "running", "position": 0, "ahead": 0, "waiting": len(self._waiting)}
            if dataset_id in self._waiting:
                index = self._waiting.index(dataset_id)
                return {"state": "waiting", "position": index + 1, "ahead": index + len(self._running), "waiting": len(self._waiting)}
        return None

    def run(self, job: Callable[..., None], *args, dataset_id: str) -> None:
        """Block until it is `dataset_id`'s turn, then run `job(*args)`.
        A dataset already waiting is not queued twice: that job reads the
        latest snapshot when it starts."""
        with self._cond:
            if dataset_id in self._waiting:
                return
            self._waiting.append(dataset_id)
            while self._waiting[0] != dataset_id or len(self._running) >= self.workers or dataset_id in self._running:
                self._cond.wait()
            self._waiting.popleft()
            self._running.append(dataset_id)
            self._cond.notify_all()
        try:
            job(*args)
        except KeyError:
            logger.info("Dataset %s expired before its analysis finished.", dataset_id)
        except Exception:
            logger.exception("Analysis job for %s failed.", dataset_id)
        finally:
            with self._cond:
                self._running.remove(dataset_id)
                self._cond.notify_all()
