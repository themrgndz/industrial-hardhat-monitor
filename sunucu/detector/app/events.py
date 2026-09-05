from __future__ import annotations

import queue
import threading

_MAXSIZE = 100


class EventBus:
    """Abone başına sınırlı kuyruk. Canlı panel geçmiş değil akış olduğu için
    kuyruk dolduğunda en eski olay düşürülür (yayıncı asla bloklanmaz)."""

    def __init__(self) -> None:
        self._subscribers: list[queue.Queue] = []
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=_MAXSIZE)
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def publish(self, event_type: str, payload: dict) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
        item = (event_type, payload)
        for q in subscribers:
            while True:
                try:
                    q.put_nowait(item)
                    break
                except queue.Full:
                    try:
                        q.get_nowait()
                    except queue.Empty:
                        break
