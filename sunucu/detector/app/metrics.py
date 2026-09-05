from __future__ import annotations

import logging
import subprocess
import threading
import time

logger = logging.getLogger(__name__)

_GPU_CACHE_TTL_S = 2.0
_NVIDIA_SMI_TIMEOUT_S = 3.0
_LAP_EMA_ALPHA = 0.3  # gerçek tur süresi üstel hareketli ortalama katsayısı
_KEEPING_UP_TOLERANCE = 1.1  # gözlenen tur süresi hedefin bu katını aşarsa "yetişemiyor" say


class GpuMonitor:
    """`nvidia-smi`'yi kısa TTL'li cache ile sorgular (her istek subprocess açmasın).

    GPU yoksa/`model.device` "cuda" ile başlamıyorsa ya da `nvidia-smi` bulunamazsa
    `{"available": False}` döner — hata fırlatmaz, panel "kullanılamıyor" gösterir.
    """

    def __init__(self, device: str) -> None:
        self._enabled = device.startswith("cuda")
        self._lock = threading.Lock()
        self._cached_at = 0.0
        self._cached: dict = {"available": False}

    def snapshot(self) -> dict:
        if not self._enabled:
            return {"available": False}
        with self._lock:
            now = time.monotonic()
            if now - self._cached_at < _GPU_CACHE_TTL_S:
                return self._cached
            self._cached = self._query()
            self._cached_at = now
            return self._cached

    def _query(self) -> dict:
        try:
            out = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True, text=True, timeout=_NVIDIA_SMI_TIMEOUT_S, check=True,
            )
            first_line = out.stdout.strip().splitlines()[0]
            name, util, used, total = (p.strip() for p in first_line.split(",")[:4])
            used_mb, total_mb = float(used), float(total)
            return {
                "available": True,
                "name": name,
                "utilizationPercent": float(util),
                "memoryUsedMb": round(used_mb),
                "memoryTotalMb": round(total_mb),
                "memoryPercent": round(used_mb / total_mb * 100, 1) if total_mb else 0.0,
            }
        except Exception as exc:  # noqa: BLE001 — nvidia-smi eksik/başarısız, servis düşmemeli
            logger.warning("nvidia-smi sorgusu başarısız: %s", exc)
            return {"available": False}


class SchedulerStats:
    """Ana çıkarım döngüsünün zamanlama durumu; `/api/metrics` için thread-safe
    anlık görüntü. `Application.run()` her turda `update()`, her tam round-robin
    turu tamamlandığında `record_lap()` çağırır.

    "Yetişiyor mu" sorusu artık statik bir bütçeye değil, gerçekten ölçülen
    tur süresine (`observed_lap_s`) dayanır: sabit aralıklı (continuous=False)
    modda da, sürekli/art arda (continuous=True) modda da aynı mantıkla
    çalışır — art arda modda zaten yapay bir "slot" yok, tek doğru ölçüt
    gerçek turun ne kadar sürdüğü.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._mode = ""
        self._continuous = False
        self._base_interval_s = 0.0
        self._target_count = 0
        self._tick_interval_s = 0.0
        self._last_lag_ms = 0.0
        self._last_tick_at = 0.0
        self._observed_lap_s: float | None = None
        self._group_size = 1

    def update(
        self, mode: str, continuous: bool, base_interval_s: float, target_count: int,
        tick_interval_s: float, lag_ms: float, group_size: int = 1,
    ) -> None:
        with self._lock:
            self._mode = mode
            self._continuous = continuous
            self._base_interval_s = base_interval_s
            self._target_count = target_count
            self._tick_interval_s = tick_interval_s
            self._last_lag_ms = lag_ms
            self._group_size = group_size
            self._last_tick_at = time.monotonic()

    def record_lap(self, lap_s: float) -> None:
        """Tüm hedef kameraların sırayla bir kez işlendiği tam turun gerçek
        süresi. Üstel hareketli ortalama ile yumuşatılır (tekil kare/ağ
        gecikmesi tek başına göstergeyi sıçratmasın)."""
        with self._lock:
            if self._observed_lap_s is None:
                self._observed_lap_s = lap_s
            else:
                self._observed_lap_s = (
                    (1 - _LAP_EMA_ALPHA) * self._observed_lap_s + _LAP_EMA_ALPHA * lap_s
                )

    def snapshot(self) -> dict:
        with self._lock:
            if self._last_tick_at == 0.0:
                return {
                    "mode": self._mode, "continuous": self._continuous,
                    "baseIntervalS": self._base_interval_s, "targetCount": 0,
                    "tickIntervalS": 0.0, "lastLagMs": 0, "observedLapS": None,
                    "groupSize": self._group_size, "keepingUp": True, "staleS": None,
                }
            observed = self._observed_lap_s
            keeping_up = observed is None or observed <= self._base_interval_s * _KEEPING_UP_TOLERANCE
            return {
                "mode": self._mode,
                "continuous": self._continuous,
                "baseIntervalS": round(self._base_interval_s, 3),
                "targetCount": self._target_count,
                "tickIntervalS": round(self._tick_interval_s, 3),
                "lastLagMs": round(self._last_lag_ms),
                "observedLapS": round(observed, 2) if observed is not None else None,
                "groupSize": self._group_size,
                "keepingUp": keeping_up,
                "staleS": round(time.monotonic() - self._last_tick_at, 1),
            }
