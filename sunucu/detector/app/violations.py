from __future__ import annotations

import dataclasses
import json
import logging
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np

from .config import LoggingConfig
from .tracker import Track

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ViolationRecord:
    id: str                              # uuid4().hex, yerel kanıt kimliği
    camera_id: str
    detected_at: datetime                # timezone-aware, UTC
    confidence: float
    bbox_xywh: tuple[int, int, int, int]
    track_id: str
    image_path: str                      # logging.dir'e göreli
    crop_path: str                       # logging.dir'e göreli; kırpma yoksa ""
    backend_id: str = ""                 # backend'in döndürdüğü uuid; POST başarısızsa ""


class ViolationLogger:
    def __init__(self, cfg: LoggingConfig, camera_id: str, backend) -> None:
        self._cfg = cfg
        self._camera_id = camera_id
        self._backend = backend

    def record(self, frame: np.ndarray, track: Track, when: datetime) -> ViolationRecord:
        cfg = self._cfg
        day = when.strftime("%d.%m.%Y")
        stamp = when.strftime("%Y%m%dT%H%M%SZ")

        image_name = f"{stamp}_{track.track_id}.jpg"
        crop_name = f"{stamp}_{track.track_id}_crop.jpg"
        image_rel = f"{day}/{self._camera_id}/{image_name}"
        crop_rel = f"{day}/{self._camera_id}/{crop_name}"

        image_bytes = self._encode(frame, cfg.jpeg_quality)
        crop_bytes: bytes | None = None
        crop_rel_final = ""

        x, y, w, h = track.bbox
        pad_x = int(w * cfg.crop_padding_ratio)
        pad_y = int(h * cfg.crop_padding_ratio)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(frame.shape[1], x + w + pad_x)
        y2 = min(frame.shape[0], y + h + pad_y)
        if x2 <= x1 or y2 <= y1:
            logger.warning("dejenere bbox, kırpma atlandı: bbox=%s track_id=%s", track.bbox, track.track_id)
        else:
            crop_bytes = self._encode(frame[y1:y2, x1:x2], cfg.jpeg_quality)
            crop_rel_final = crop_rel

        try:
            cam_dir = cfg.dir / day / self._camera_id
            cam_dir.mkdir(parents=True, exist_ok=True)
            (cfg.dir / image_rel).write_bytes(image_bytes)
            if crop_bytes is not None:
                (cfg.dir / crop_rel).write_bytes(crop_bytes)
        except OSError:
            logger.exception("kanıt dosyası yazılamadı: track_id=%s", track.track_id)

        v = ViolationRecord(
            id=uuid.uuid4().hex,
            camera_id=self._camera_id,
            detected_at=when,
            confidence=track.confidence,
            bbox_xywh=track.bbox,
            track_id=track.track_id,
            image_path=image_rel,
            crop_path=crop_rel_final,
        )

        backend_id: str | None = None
        if self._backend is not None:
            backend_id = self._backend.post_violation(v, image_bytes, crop_bytes)
            v = dataclasses.replace(v, backend_id=backend_id or "")
        posted = backend_id is not None
        self._append_jsonl(v, posted)
        if self._backend is not None and not posted:
            self._append_retry_queue(v)
        return v

    @staticmethod
    def _encode(frame: np.ndarray, quality: int | None = None) -> bytes:
        params = [cv2.IMWRITE_JPEG_QUALITY, quality] if quality is not None else []
        ok, buf = cv2.imencode(".jpg", frame, params)
        return buf.tobytes() if ok else b""

    def record_dict(self, v: ViolationRecord, posted_to_backend: bool) -> dict:
        x, y, w, h = v.bbox_xywh
        return {
            "id": v.id,
            "camera_id": v.camera_id,
            "detected_at": v.detected_at.isoformat().replace("+00:00", "Z"),
            "class": "no_helmet",
            "confidence": v.confidence,
            "bbox": [x, y, x + w, y + h],
            "track_id": v.track_id,
            "image_path": v.image_path,
            "crop_path": v.crop_path,
            "backend_id": v.backend_id,
            "posted_to_backend": posted_to_backend,
        }

    def _append_jsonl(self, v: ViolationRecord, posted: bool) -> None:
        path = self._cfg.jsonl_path
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(self.record_dict(v, posted), ensure_ascii=False) + "\n")
        except OSError:
            logger.exception("violations.jsonl yazılamadı: track_id=%s", v.track_id)

    def _append_retry_queue(self, v: ViolationRecord) -> None:
        path = self._cfg.dir / "retry_queue.jsonl"
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(self.record_dict(v, False), ensure_ascii=False) + "\n")
        except OSError:
            logger.exception("retry_queue.jsonl yazılamadı: track_id=%s", v.track_id)


class ViolationWorker:
    """İhlal kanıtlama (JPEG encode + disk yazma + `BackendClient.post_violation`
    senkron HTTP isteği) ana çıkarım döngüsünden ayrı bir thread'de yapılır.
    Önceden `ViolationLogger.record()` doğrudan ana döngüde çağrılıyordu —
    backend'e giden POST (5 sn'ye kadar zaman aşımı payı) GPU/round-robin
    döngüsünü bloke ediyor, tur süresini şişiriyordu (ölçüldü: 12 kamerada
    ~38 ihlal sonrası tur 5.6-6.1s'ye çıkmıştı). `submit()` anında döner,
    kayıt tamamlanınca `on_recorded` callback'i (SSE yayını) tetiklenir.

    TEK worker: 3 thread'le denendi (2026-09-02), GIL çekişmesi ana döngüyü
    (dilimleme/numpy/tracker Python işleri) yavaşlattı — backend bloklaması
    çözüldü ama tur süresi net olarak KÖTÜLEŞTİ (3.5-4.2s -> 5.0-5.9s, CPU
    %546'ya çıktı). İhlal hızı (~0.5/sn) tek thread'in rahatça yetişeceği
    kadar düşük; tek worker GIL çekişmesini minimuma indirir, network I/O
    yine de GIL'i bırakır — art arda gelen ihlaller kuyrukta bekler ama ana
    döngüyü bloklamaz (bu zaten asıl hedefti)."""

    _WORKERS = 1

    def __init__(self, on_recorded: Callable[[str, str, ViolationRecord], None]) -> None:
        self._on_recorded = on_recorded
        self._executor: ThreadPoolExecutor | None = None

    def start(self) -> None:
        self._executor = ThreadPoolExecutor(max_workers=self._WORKERS, thread_name_prefix="violation")

    def submit(
        self, violation_logger: ViolationLogger, frame: np.ndarray, track: Track,
        when: datetime, camera_id: str, camera_name: str,
    ) -> None:
        if self._executor is None:
            return
        self._executor.submit(self._process, violation_logger, frame, track, when, camera_id, camera_name)

    def _process(
        self, violation_logger: ViolationLogger, frame: np.ndarray, track: Track,
        when: datetime, camera_id: str, camera_name: str,
    ) -> None:
        try:
            record = violation_logger.record(frame, track, when)
            self._on_recorded(camera_id, camera_name, record)
        except Exception:  # noqa: BLE001 — arka plan işi; ana döngüyü etkilememeli
            logger.exception("ihlal kaydı işlenemedi: kamera=%s track=%s", camera_id, track.track_id)

    def stop(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=True)
            self._executor = None
