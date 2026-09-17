from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

import numpy as np

from .cameras_store import CameraStore
from .config import CameraConfig, Config
from .display_settings import DisplaySettingsStore
from .events import EventBus
from .inference import Detection
from .stream import StreamReader
from .tracker import IoUTracker, Track
from .violations import ViolationLogger

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CameraState:
    cfg: CameraConfig
    tracker: IoUTracker
    logger: ViolationLogger
    reader: StreamReader | None = None
    detections: list[Detection] = field(default_factory=list)
    analysis_at: float = 0.0             # time.monotonic(); 0.0 = hiç analiz edilmedi
    analysis_iso: str = ""
    inference_ms: float = 0.0
    last_seq_processed: int = 0
    last_viewer_at: float = 0.0          # time.monotonic(); snapshot/MJPEG isteğinde tazelenir
    violations_since_start: int = 0
    frames_processed: int = 0
    inference_ms_total: float = 0.0
    # GEÇİCİ (yalnız test/görselleştirme): track_id -> son merkez noktaları.
    # tracker.py'nin rotayı doğru takip ettiğini canlı görüntüde doğrulamak
    # için eklendi; kalıcı bir özellik değil, kaldırılması güvenli.
    trails: dict[str, list[tuple[int, int]]] = field(default_factory=dict)


class CameraHub:
    """Kamera başına akış/izleme durumu ve okuyucu yaşam döngüsü.

    Okuyucular tembeldir: yalnız aktif kamera, `monitoring.mode == "all"` veya
    son `stream.idle_timeout_s` içinde izleyicisi olan kameralar için açık tutulur.
    Önizleme ve çıkarım aynı `StreamReader`'ı paylaşır; bir kameraya iki RTSP
    bağlantısı açılmaz.
    """

    def __init__(self, cfg: Config, backend, event_bus: EventBus, store: CameraStore) -> None:
        self._cfg = cfg
        self._bus = event_bus
        self._store = store
        self._backend = backend
        self._lock = threading.RLock()
        self._active_id: str | None = None
        self._states: dict[str, CameraState] = {}
        for cam in store.load():
            self._states[cam.id] = self._new_state(cam)
        self._confidence_floor = min(cfg.model.thresholds.values()) if cfg.model.thresholds else 0.0
        self._settings_store = DisplaySettingsStore(
            Path(cfg.cameras_file).resolve().parent / "display_settings.json", self._confidence_floor,
        )
        self._min_confidence = self._settings_store.load()

    def _new_state(self, cam: CameraConfig) -> CameraState:
        return CameraState(
            cfg=cam,
            tracker=IoUTracker(
                run_id=uuid4().hex[:8], cfg=self._cfg.tracking,
                violation_label=self._cfg.model.violation_class,
            ),
            logger=ViolationLogger(self._cfg.logging, cam.id, self._backend),
        )

    # ---- durum sorguları -------------------------------------------------

    @property
    def active_id(self) -> str | None:
        with self._lock:
            return self._active_id

    @property
    def camera_ids(self) -> tuple[str, ...]:
        return tuple(self._states.keys())

    def has(self, camera_id: str) -> bool:
        return camera_id in self._states

    def state(self, camera_id: str) -> CameraState:
        return self._states[camera_id]

    # ---- seçim -----------------------------------------------------------

    def select(self, camera_id: str) -> None:
        if camera_id not in self._states:
            raise KeyError(camera_id)
        with self._lock:
            if self._active_id == camera_id:
                return
            self._active_id = camera_id
        logger.info("aktif kamera: %s", camera_id)
        self.ensure_readers()

    def release(self) -> None:
        with self._lock:
            if self._active_id is None:
                return
            self._active_id = None
        logger.info("aktif kamera bırakıldı")
        self.ensure_readers()

    def touch_viewer(self, camera_id: str) -> None:
        """İzleyici (snapshot/MJPEG) isteği; gerekiyorsa okuyucuyu başlatır."""
        with self._lock:
            st = self._states[camera_id]
            st.last_viewer_at = time.monotonic()
            needs_start = st.reader is None
        if needs_start:
            self.ensure_readers()

    # ---- görüntüleme hassasiyeti (canlı akış/sayaç filtresi) -------------

    @property
    def min_confidence(self) -> float:
        with self._lock:
            return self._min_confidence

    @property
    def confidence_floor(self) -> float:
        return self._confidence_floor

    def set_min_confidence(self, value: float) -> float:
        """`value`'yu [floor, 1.0] aralığına kırpar, kalıcı hale getirir, yayınlar."""
        clamped = max(self._confidence_floor, min(1.0, value))
        with self._lock:
            self._min_confidence = clamped
        self._settings_store.save(clamped)
        self._bus.publish("settings", self.display_settings_body())
        return clamped

    def display_settings_body(self) -> dict:
        return {"minConfidence": self.min_confidence, "floor": self._confidence_floor}

    # ---- kamera CRUD -----------------------------------------------------

    def add(self, cam: CameraConfig) -> None:
        """Yeni kamera ekler. id çakışırsa `ValueError`."""
        with self._lock:
            if cam.id in self._states:
                raise ValueError(f"kamera id zaten var: {cam.id!r}")
            self._states[cam.id] = self._new_state(cam)
            self._store.save([st.cfg for st in self._states.values()])
        self.ensure_readers()
        self._bus.publish("cameras", self.cameras_body())

    def update(self, camera_id: str, new_cfg: CameraConfig) -> None:
        """Kamerayı düzenler (ad/id/uri). id çakışırsa `ValueError`, bilinmeyen
        kaynak id `KeyError`. Okuyucu/tracker/logger sıfırdan kurulur (`add` ile
        aynı yol) — id veya uri değiştiyse eski bağlantı/izleme geçmişi taşınmaz."""
        with self._lock:
            if camera_id not in self._states:
                raise KeyError(camera_id)
            if new_cfg.id != camera_id and new_cfg.id in self._states:
                raise ValueError(f"kamera id zaten var: {new_cfg.id!r}")
            was_active = self._active_id == camera_id
            st = self._states.pop(camera_id)
            if st.reader is not None:
                self._stop_reader(st)
            self._states[new_cfg.id] = self._new_state(new_cfg)
            if was_active:
                self._active_id = new_cfg.id
            self._store.save([s.cfg for s in self._states.values()])
        self.ensure_readers()
        self._bus.publish("cameras", self.cameras_body())

    def remove(self, camera_id: str) -> None:
        """Kamerayı kaldırır. Bilinmeyen id `KeyError`."""
        with self._lock:
            if camera_id not in self._states:
                raise KeyError(camera_id)
            if self._active_id == camera_id:
                self._active_id = None
            st = self._states.pop(camera_id)
            if st.reader is not None:
                self._stop_reader(st)
            self._store.save([s.cfg for s in self._states.values()])
        self._bus.publish("cameras", self.cameras_body())

    # ---- okuyucu yaşam döngüsü ------------------------------------------

    def ensure_readers(self) -> None:
        events: list[dict] = []
        with self._lock:
            now = time.monotonic()
            for st in self._states.values():
                scan = st.cfg.id == self._active_id or self._cfg.monitoring.mode == "all"
                viewer = (now - st.last_viewer_at) < self._cfg.stream.idle_timeout_s
                if not (scan or viewer):
                    if st.reader is not None:
                        self._stop_reader(st)
                        events.append(self._camera_event_locked(st))
                    continue

                # Aktif/taranan kamerada model ana akışta çalışır; yalnız izlenen
                # kamerada (varsa) hafif önizleme akışı yeterlidir.
                target_uri = st.cfg.uri if scan else st.cfg.effective_preview_uri()
                if st.reader is not None and st.reader.uri != target_uri:
                    self._stop_reader(st)
                if st.reader is None:
                    st.reader = StreamReader(target_uri, self._cfg.stream)
                    st.reader.start()
                    logger.info("okuyucu açıldı: %s (%s)", st.cfg.id, target_uri)
                    events.append(self._camera_event_locked(st))
        for ev in events:
            self._bus.publish("camera", ev)

    def stop_all(self) -> None:
        with self._lock:
            for st in self._states.values():
                if st.reader is not None:
                    self._stop_reader(st)

    def _stop_reader(self, st: CameraState) -> None:
        reader = st.reader
        st.reader = None
        st.detections = []
        st.analysis_at = 0.0
        st.analysis_iso = ""
        st.inference_ms = 0.0
        st.last_seq_processed = 0
        if reader is not None:
            reader.stop()
            logger.info("okuyucu kapatıldı: %s", st.cfg.id)

    # ---- kare / analiz ---------------------------------------------------

    def frame(self, camera_id: str) -> np.ndarray | None:
        with self._lock:
            reader = self._states[camera_id].reader
        return reader.latest() if reader is not None else None

    def frame_with_seq(self, camera_id: str) -> tuple[np.ndarray | None, int]:
        with self._lock:
            reader = self._states[camera_id].reader
        return reader.latest_with_seq() if reader is not None else (None, 0)

    def analysis(self, camera_id: str) -> tuple[list[Detection], float]:
        """(son analizin tespitleri, analizin yaşı ms). Analiz yoksa ([], -1.0)."""
        with self._lock:
            st = self._states[camera_id]
            if st.analysis_at == 0.0:
                return [], -1.0
            return list(st.detections), (time.monotonic() - st.analysis_at) * 1000.0

    def commit_analysis(
        self, camera_id: str, detections: list[Detection],
        inference_ms: float, seq: int, analysis_iso: str,
    ) -> None:
        # Kamera, cikarim surerken (300-700ms) DELETE /api/cameras/{id} ile
        # silinmis olabilir (olculdu: KeyError -> tum servis coktu). Bu artik
        # beklenen bir yaris durumu, hata degil: sessizce atlanir.
        with self._lock:
            st = self._states.get(camera_id)
            if st is None:
                return
            st.detections = detections
            st.analysis_at = time.monotonic()
            st.analysis_iso = analysis_iso
            st.inference_ms = inference_ms
            st.inference_ms_total += inference_ms
            st.last_seq_processed = seq
            st.frames_processed += 1

    def note_violation(self, camera_id: str) -> None:
        with self._lock:
            st = self._states.get(camera_id)
            if st is not None:
                st.violations_since_start += 1

    # GEÇİCİ (yalnız test/görselleştirme, bkz. CameraState.trails).
    _TRAIL_MAX_POINTS = 40

    def update_trails(self, camera_id: str, tracks: list[Track]) -> None:
        with self._lock:
            st = self._states.get(camera_id)
            if st is None:
                return
            alive_ids = set()
            for t in tracks:
                alive_ids.add(t.track_id)
                x, y, w, h = t.bbox
                center = (int(x + w / 2), int(y + h / 2))
                pts = st.trails.setdefault(t.track_id, [])
                pts.append(center)
                if len(pts) > self._TRAIL_MAX_POINTS:
                    del pts[: len(pts) - self._TRAIL_MAX_POINTS]
            for tid in list(st.trails.keys()):
                if tid not in alive_ids:
                    del st.trails[tid]

    def trails(self, camera_id: str) -> dict[str, list[tuple[int, int]]]:
        with self._lock:
            st = self._states.get(camera_id)
            if st is None:
                return {}
            return {tid: list(pts) for tid, pts in st.trails.items()}

    # ---- API gövdeleri ---------------------------------------------------

    def cameras_body(self) -> dict:
        """POST/DELETE/GET /api/cameras ve SSE `cameras` olayı için ortak gövde."""
        with self._lock:
            return {
                "activeCameraId": self._active_id,
                "mode": self._cfg.monitoring.mode,
                "cameras": [self._state_dict_locked(st) for st in self._states.values()],
            }

    def snapshot_state(self) -> list[dict]:
        with self._lock:
            return [self._state_dict_locked(st) for st in self._states.values()]

    def _state_dict_locked(self, st: CameraState) -> dict:
        now = time.monotonic()
        reader = st.reader
        age = reader.last_frame_age_ms() if reader is not None else None
        frame_age_ms = round(age) if age is not None else None
        counts: dict[str, int] = {}
        for det in st.detections:
            counts[det.label] = counts.get(det.label, 0) + 1
        analysed = st.analysis_at != 0.0
        return {
            "id": st.cfg.id,
            "name": st.cfg.name,
            "uri": st.cfg.uri,
            "previewUri": st.cfg.preview_uri,
            "connected": bool(reader is not None and reader.connected),
            "streaming": reader is not None,
            "active": st.cfg.id == self._active_id,
            "lastFrameAgeMs": frame_age_ms,
            "lastAnalysisAgeMs": round((now - st.analysis_at) * 1000.0) if analysed else None,
            "inferenceMs": round(st.inference_ms) if analysed else None,
            "counts": counts if analysed else {},
            "violationsSinceStart": st.violations_since_start,
        }

    def _camera_event_locked(self, st: CameraState) -> dict:
        return {
            "cameraId": st.cfg.id,
            "connected": bool(st.reader is not None and st.reader.connected),
            "streaming": st.reader is not None,
            "active": st.cfg.id == self._active_id,
        }

    def camera_event(self, camera_id: str) -> dict:
        with self._lock:
            return self._camera_event_locked(self._states[camera_id])
