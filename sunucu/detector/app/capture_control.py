from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path


class CaptureControl:
    """Grup boyutunun (`capture.batch_size`) arayüzden canlı ayarlanması.

    `display_settings.py`/`cameras_store.py` ile aynı desen: bellekte
    thread-safe tutulur (döngü thread'i okur, HTTP thread'i yazar),
    `capture_settings.json`'a kalıcı yazılır — servis/container yeniden
    başlasa da (config.yaml'daki başlangıç değeri yerine) son seçilen
    değer korunur, kullanıcı her seferinde tekrar ayarlamak zorunda kalmaz.
    """

    def __init__(self, path: Path, default: int, max_value: int) -> None:
        self._path = path
        self._max = max(1, max_value)
        self._default = max(1, min(self._max, default))
        self._lock = threading.Lock()
        self._batch_size = self._load()

    def _load(self) -> int:
        if not self._path.exists():
            return self._default
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            value = int(raw["batch_size"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError):
            return self._default
        return max(1, min(self._max, value))

    def _save(self, value: int) -> None:
        data = json.dumps({"batch_size": value}, ensure_ascii=False, indent=2)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=str(self._path.parent), prefix=f".{self._path.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(data)
            try:
                os.replace(tmp_name, self._path)
            except OSError:
                # Docker Desktop bind-mount kısıtı (bkz. cameras_store.py:save) —
                # atomiklik feda edilir, hedefe doğrudan yazılır.
                with open(self._path, "w", encoding="utf-8") as direct:
                    direct.write(data)
                Path(tmp_name).unlink(missing_ok=True)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    @property
    def batch_size(self) -> int:
        with self._lock:
            return self._batch_size

    @property
    def max_value(self) -> int:
        return self._max

    def set_batch_size(self, value: int) -> int:
        clamped = max(1, min(self._max, int(value)))
        with self._lock:
            self._batch_size = clamped
        self._save(clamped)
        return clamped

    def snapshot(self) -> dict:
        with self._lock:
            return {"batchSize": self._batch_size, "max": self._max}
