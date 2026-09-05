from __future__ import annotations

import threading
import time


class EngineControl:
    """Çıkarım döngüsünü (model) durdurup devam ettirmek için thread-safe bayrak.

    Kamera "kapat" (aktif kamerayı bırak) ile karıştırılmasın: bu bayrak
    tüm kameralar için round-robin çıkarımı bir bütün olarak durdurur/başlatır.
    Kamera akışları (RTSP okuyucular, canlı görüntü) bundan etkilenmez —
    yalnız model çıkarımı (GPU kullanımı, ihlal tespiti) askıya alınır.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._paused = False
        self._changed_at = time.monotonic()

    @property
    def paused(self) -> bool:
        with self._lock:
            return self._paused

    def pause(self) -> None:
        with self._lock:
            self._paused = True
            self._changed_at = time.monotonic()

    def resume(self) -> None:
        with self._lock:
            self._paused = False
            self._changed_at = time.monotonic()

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "paused": self._paused,
                "changedAgoS": round(time.monotonic() - self._changed_at, 1),
            }
