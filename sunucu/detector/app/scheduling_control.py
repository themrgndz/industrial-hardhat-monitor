from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

_MODES = {"all", "selected"}
_MIN_FPS = 0.05   # 20 saniyede bir tur — pratik alt sınır
_MAX_FPS = 30.0


class SchedulingControl:
    """Tarama modunun (`monitoring.mode`), tarama biçiminin (`capture.continuous`)
    ve hedef tur hızının (`capture.fps`) arayüzden canlı ayarlanması.

    `CaptureControl`/`ModelControl` ile aynı desen: bellekte thread-safe tutulur
    (döngü thread'i okur, HTTP thread'i yazar), `scheduling_settings.json`'a
    kalıcı yazılır — servis/container yeniden başlasa da (config.yaml'daki
    başlangıç değerleri yerine) son seçilen değerler korunur.
    """

    def __init__(self, path: Path, default_mode: str, default_continuous: bool, default_fps: float) -> None:
        self._path = path
        self._default_mode = default_mode if default_mode in _MODES else "all"
        self._default_continuous = default_continuous
        self._default_fps = max(_MIN_FPS, min(_MAX_FPS, default_fps))
        self._lock = threading.Lock()
        self._mode, self._continuous, self._fps = self._load()

    def _load(self) -> tuple[str, bool, float]:
        if not self._path.exists():
            return self._default_mode, self._default_continuous, self._default_fps
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            mode = raw["mode"] if raw.get("mode") in _MODES else self._default_mode
            continuous = bool(raw["continuous"])
            fps = max(_MIN_FPS, min(_MAX_FPS, float(raw["fps"])))
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError):
            return self._default_mode, self._default_continuous, self._default_fps
        return mode, continuous, fps

    def _save(self) -> None:
        data = json.dumps(
            {"mode": self._mode, "continuous": self._continuous, "fps": self._fps},
            ensure_ascii=False, indent=2,
        )
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
    def mode(self) -> str:
        with self._lock:
            return self._mode

    @property
    def continuous(self) -> bool:
        with self._lock:
            return self._continuous

    @property
    def fps(self) -> float:
        with self._lock:
            return self._fps

    def set_mode(self, mode: str) -> str:
        if mode not in _MODES:
            raise ValueError(f"mode {sorted(_MODES)} içinden biri olmalı")
        with self._lock:
            self._mode = mode
            self._save()
        return mode

    def set_continuous(self, continuous: bool) -> bool:
        with self._lock:
            self._continuous = bool(continuous)
            self._save()
        return self._continuous

    def set_fps(self, fps: float) -> float:
        clamped = max(_MIN_FPS, min(_MAX_FPS, float(fps)))
        with self._lock:
            self._fps = clamped
            self._save()
        return clamped

    def snapshot(self) -> dict:
        with self._lock:
            return {"mode": self._mode, "continuous": self._continuous, "fps": self._fps}
