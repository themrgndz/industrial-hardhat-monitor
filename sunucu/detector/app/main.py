from __future__ import annotations

# app/__init__.py OPENCV_FFMPEG_CAPTURE_OPTIONS'ı burada içe aktarım anında ayarlar
# (bu satır cv2'den önce çalışır çünkü paket __init__.py önce yüklenir).
from . import config as _config  # noqa: F401  (paket __init__ tetiklensin diye)

import copy
import logging
import os
import signal
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .backend_client import BackendClient, RetryWorker
from .cameras_store import CameraStore
from .capture_control import CaptureControl
from .config import Config
from .engine_control import EngineControl
from .events import EventBus
from .hub import CameraHub, CameraState
from .inference import Detection, InferenceEngine
from .metrics import GpuMonitor, SchedulerStats
from .server import DetectorServer
from .tracker import Track
from .violations import ViolationRecord, ViolationWorker

logger = logging.getLogger(__name__)

_SUMMARY_INTERVAL_S = 60.0
_IDLE_SLEEP_S = 0.2
_BUSY_SLEEP_S = 0.01


class Application:
    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._bus = EventBus()
        self._engine = InferenceEngine(cfg.model, cfg.sahi)
        self._backend: BackendClient | None = None
        self._retry_worker: RetryWorker | None = None
        if cfg.backend.enabled:
            self._backend = BackendClient(cfg.backend)
            self._retry_worker = RetryWorker(cfg.logging, cfg.backend, self._backend)
        self._violation_worker = ViolationWorker(self._on_violation_recorded)
        self._hub = CameraHub(cfg, self._backend, self._bus, CameraStore(cfg.cameras_file))
        self._gpu_monitor = GpuMonitor(cfg.model.device)
        self._scheduler_stats = SchedulerStats()
        self._engine_control = EngineControl()
        self._capture_control = CaptureControl(
            Path(cfg.cameras_file).resolve().parent / "capture_settings.json",
            default=cfg.capture.batch_size, max_value=16,
        )
        self._server = DetectorServer(
            cfg, self._hub, self._bus, self._scheduler_stats, self._gpu_monitor,
            self._engine_control, self._capture_control,
        )

        self._stop = False
        self._last_summary_at = time.monotonic()
        self._rr_index = 0          # tüm kameralar için round-robin imleci
        self._lap_tick = 0          # gerçek tur süresini ölçmek için ayrı sayaç
        self._lap_started_at: float | None = None

    def run(self) -> None:
        if self._retry_worker is not None:
            self._retry_worker.start()
        self._violation_worker.start()
        self._server.start()

        continuous = self._cfg.capture.continuous
        base_interval = 1.0 / self._cfg.capture.fps
        next_tick = time.monotonic()
        try:
            while not self._stop:
                if self._engine_control.paused:
                    time.sleep(_IDLE_SLEEP_S)
                    next_tick = time.monotonic()
                    self._lap_started_at = None
                    self._maybe_log_summary()
                    continue

                targets = self._scheduling_target_count()
                group_size = self._group_size(targets)
                # Bir "tur" (lap) tüm kameraları bir kez kapsar; grup halinde
                # ilerlendiği için tur başına tik sayısı targets/group_size'a iner.
                ticks_per_lap = -(-targets // group_size) if targets else 1
                interval = base_interval / ticks_per_lap if ticks_per_lap else base_interval
                lag_ms = 0.0
                if not continuous:
                    next_tick += interval
                    sleep = next_tick - time.monotonic()
                    if sleep > 0:
                        time.sleep(sleep)
                    else:
                        lag_ms = -sleep * 1000
                        logger.warning(
                            "işleme %d kamera / %.1fs döngüde yetişemiyor (%.2fs aralık): %.0f ms gecikme",
                            targets, base_interval, interval, lag_ms,
                        )
                        next_tick = time.monotonic()
                self._scheduler_stats.update(
                    self._cfg.monitoring.mode, continuous, base_interval, targets, interval, lag_ms,
                    group_size,
                )

                self._hub.ensure_readers()
                group = self._next_target_group(group_size)
                if targets:
                    self._lap_tick += 1
                    now_monotonic = time.monotonic()
                    if self._lap_started_at is None:
                        self._lap_started_at = now_monotonic
                    elif self._lap_tick % ticks_per_lap == 0:
                        self._scheduler_stats.record_lap(now_monotonic - self._lap_started_at)
                        self._lap_started_at = now_monotonic
                if not group:
                    if continuous:
                        time.sleep(_IDLE_SLEEP_S)
                    self._maybe_log_summary()
                    continue

                ready: list[tuple[CameraState, np.ndarray, int]] = []
                for camera_id in group:
                    try:
                        state = self._hub.state(camera_id)
                        frame, seq = self._hub.frame_with_seq(camera_id)
                    except KeyError:
                        # Kamera bu turun başında seçildi ama DELETE /api/cameras/{id}
                        # ile o an silindi (ölçüldü: KeyError -> tüm servis çöktü,
                        # bkz. hub.commit_analysis notu). Bu bir yarış durumu, hata
                        # değil: bu kamerayı sessizce atla.
                        continue
                    # Donmuş yayında aynı kare tekrar tekrar işlenmez.
                    if frame is None or seq == state.last_seq_processed:
                        continue
                    ready.append((state, frame, seq))

                if not ready:
                    if continuous:
                        time.sleep(_BUSY_SLEEP_S)
                    self._maybe_log_summary()
                    continue

                try:
                    batch_start = time.monotonic()
                    batch_detections = self._engine.predict_batch([frame for _, frame, _ in ready])
                    per_camera_ms = (time.monotonic() - batch_start) * 1000 / len(ready)
                    for (state, frame, seq), detections in zip(ready, batch_detections):
                        try:
                            self._process_frame(state, frame, seq, detections, per_camera_ms)
                        except Exception:  # noqa: BLE001
                            # Tek bir karedeki beklenmeyen hata (bozuk kare, model kenar
                            # durumu, vb.) tüm servisi düşürmemeli — loglanır, devam edilir.
                            logger.exception(
                                "kamera=%s karesi işlenirken hata, atlanıyor", state.cfg.id,
                            )
                except Exception:  # noqa: BLE001
                    logger.exception("grup çıkarımı başarısız (%d kamera), atlanıyor", len(ready))
                self._maybe_log_summary()
        finally:
            self._shutdown()

    def _scheduling_target_count(self) -> int:
        """Bu döngüde sırayla işlenecek kamera sayısı: tur aralığı
        base_interval / bu sayı olur, her kamera döngü başına bir kez alır."""
        if self._cfg.monitoring.mode == "selected":
            return 1 if self._hub.active_id is not None else 0
        return len(self._hub.camera_ids)

    def _group_size(self, targets: int) -> int:
        """Bir turda AYNI ANDA (tek GPU çağrısında) işlenecek kamera sayısı.
        mode=selected'da tek hedef zaten var, gruplamanın anlamı yok.
        Config'teki başlangıç değeri yerine arayüzden canlı ayarlanabilen
        `CaptureControl.batch_size` kullanılır (bkz. POST /api/capture)."""
        if self._cfg.monitoring.mode == "selected" or not targets:
            return 1
        return max(1, min(self._capture_control.batch_size, targets))

    def _next_target_group(self, group_size: int) -> list[str]:
        """Bu turda birlikte (tek GPU çağrısında) işlenecek kamera grubu.
        Round-robin GRUP halinde ilerler: 12 kamera + grup=4 → 4'erli 3 tur.
        mode=selected iken yalnızca aktif kamerayı içeren tek elemanlı liste
        döner (aktif kameraya öncelik yok, herkes eşit sırayla)."""
        if self._cfg.monitoring.mode == "selected":
            active = self._hub.active_id
            return [active] if active is not None else []
        ids = self._hub.camera_ids
        n = len(ids)
        if not n:
            return []
        size = max(1, min(group_size, n))
        start = self._rr_index % n
        group = [ids[(start + i) % n] for i in range(size)]
        self._rr_index += size
        return group

    def _process_frame(
        self, state: CameraState, frame: np.ndarray, seq: int,
        detections: list[Detection], inference_ms: float,
    ) -> None:
        camera_id = state.cfg.id

        now = datetime.now(timezone.utc)
        analysis_iso = now.isoformat().replace("+00:00", "Z")
        self._hub.commit_analysis(camera_id, detections, inference_ms, seq, analysis_iso)

        now_monotonic = time.monotonic()
        tracks = state.tracker.update(detections, now_monotonic)
        for t in tracks:
            if not self._is_violation(t, now_monotonic):
                continue
            # Kanıtlama (JPEG encode + disk + backend POST) senkron değil: bu
            # döngü GPU'yu bloklamamalı (bkz. ViolationWorker docstring'i).
            # Bu yüzden soğuma/istatistik hemen, kanıt arka planda işlenir.
            t.last_reported_at = now_monotonic
            self._hub.note_violation(camera_id)
            self._violation_worker.submit(
                state.logger, frame, copy.copy(t), now, camera_id, state.cfg.name,
            )

        self._bus.publish("analysis", {
            "cameraId": camera_id,
            "at": analysis_iso,
            "inferenceMs": round(inference_ms),
            "counts": _counts(detections),
            "detections": [
                {"label": d.label, "confidence": round(d.confidence, 3), "bbox": list(d.bbox)}
                for d in detections
            ],
        })

    def _on_violation_recorded(self, camera_id: str, camera_name: str, record: ViolationRecord) -> None:
        """`ViolationWorker` bir kanıtı işleyip bitirince (arka plan thread'inden)
        çağrılır; SSE yayını burada yapılır — `EventBus.publish` thread-safe."""
        x, y, w, h = record.bbox_xywh
        self._bus.publish("violation", {
            "cameraId": camera_id,
            "cameraName": camera_name,
            "detectedAt": record.detected_at.isoformat().replace("+00:00", "Z"),
            "confidence": record.confidence,
            "bbox": [x, y, w, h],
            "trackId": record.track_id,
            "backendId": record.backend_id or None,
            "localImage": record.image_path,
            "localCrop": record.crop_path,
        })

    def _is_violation(self, t: Track, now_monotonic: float) -> bool:
        cfg = self._cfg.tracking
        if t.label != self._cfg.model.violation_class:
            return False
        # Arayüzdeki "Hassasiyet" eşiği artık yalnız canlı görüntü çizimini değil,
        # ihlal onayını da kapsıyor: eşik yükseltilince gerçekten daha az ihlal
        # üretilir (2026-09-02).
        if t.confidence < self._hub.min_confidence:
            return False
        if t.violation_streak < cfg.confirm_frames:
            return False
        return (now_monotonic - t.last_reported_at) >= cfg.cooldown_seconds

    def _maybe_log_summary(self) -> None:
        now = time.monotonic()
        if now - self._last_summary_at < _SUMMARY_INTERVAL_S:
            return
        for camera_id in self._hub.camera_ids:
            st = self._hub.state(camera_id)
            avg_ms = st.inference_ms_total / st.frames_processed if st.frames_processed else 0.0
            logger.info(
                "kamera=%s işlenen=%d ihlal=%d ort=%.0f ms bağlı=%s",
                camera_id, st.frames_processed, st.violations_since_start, avg_ms,
                st.reader is not None and st.reader.connected,
            )
        self._last_summary_at = now

    def stop(self) -> None:
        self._stop = True

    def _shutdown(self) -> None:
        self._server.stop()
        self._violation_worker.stop()
        if self._retry_worker is not None:
            self._retry_worker.stop()
        self._hub.stop_all()


def _counts(detections: list[Detection]) -> dict[str, int]:
    out: dict[str, int] = {}
    for d in detections:
        out[d.label] = out.get(d.label, 0) + 1
    return out


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    cfg = Config.load(Path(os.environ.get("PPE_CONFIG", "config.yaml")))
    app = Application(cfg)

    def _handle_signal(signum, frame) -> None:
        logger.info("sinyal alındı (%d), kapatılıyor...", signum)
        app.stop()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    app.run()


if __name__ == "__main__":
    main()
