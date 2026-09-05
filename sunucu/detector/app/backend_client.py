from __future__ import annotations

import datetime as _dt
import json
import logging
import os
import threading
import time
from pathlib import Path

import requests

from .config import BackendConfig, LoggingConfig
from .violations import ViolationRecord

logger = logging.getLogger(__name__)


class BackendClient:
    def __init__(self, cfg: BackendConfig) -> None:
        self._base_url = cfg.url.rstrip("/")
        self._api_key = cfg.api_key
        self._timeout = cfg.timeout_seconds

    def post_violation(
        self, v: ViolationRecord, image_bytes: bytes, crop_bytes: bytes | None,
    ) -> str | None:
        """Başarıda backend'in kayıt id'si (gövde ayrıştırılamazsa ""), aksi hâlde None."""
        x, y, w, h = v.bbox_xywh
        meta = {
            "cameraId": v.camera_id,
            "detectedAt": v.detected_at.isoformat().replace("+00:00", "Z"),
            "confidence": v.confidence,
            "bboxX": x,
            "bboxY": y,
            "bboxW": w,
            "bboxH": h,
            "trackId": v.track_id,
        }
        files: dict[str, tuple] = {
            "meta": (None, json.dumps(meta), "application/json"),
            "image": (Path(v.image_path).name, image_bytes, "image/jpeg"),
        }
        if crop_bytes is not None:
            files["crop"] = (Path(v.crop_path).name, crop_bytes, "image/jpeg")
        try:
            resp = requests.post(
                f"{self._base_url}/api/v1/violations",
                headers={"X-API-KEY": self._api_key},
                files=files,
                timeout=self._timeout,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    "backend %d döndürdü: track_id=%s", resp.status_code, v.track_id,
                )
                return None
            try:
                return str(resp.json()["id"])
            except (ValueError, KeyError, TypeError):
                logger.warning("backend yanıtında id yok: track_id=%s", v.track_id)
                return ""
        except Exception:
            logger.exception("backend'e POST başarısız: track_id=%s", v.track_id)
            return None


class RetryWorker:
    def __init__(self, log_cfg: LoggingConfig, backend_cfg: BackendConfig, backend: BackendClient) -> None:
        self._log_cfg = log_cfg
        self._interval = backend_cfg.retry_interval_seconds
        self._backend = backend
        self._queue_path = log_cfg.dir / "retry_queue.jsonl"
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            time.sleep(self._interval)
            self._retry_once()

    def _retry_once(self) -> None:
        if not self._queue_path.exists():
            return

        tmp_path = self._queue_path.with_suffix(".processing")
        try:
            os.replace(self._queue_path, tmp_path)
        except FileNotFoundError:
            return

        remaining: list[str] = []
        for line in tmp_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("retry_queue: bozuk satır atlandı")
                continue

            image_path = record.get("image_path")
            if not image_path:
                logger.warning("retry_queue: image_path eksik, satır düşürüldü")
                continue
            img_file = self._log_cfg.dir / image_path
            if not img_file.exists():
                logger.warning("retry_queue: görsel bulunamadı (%s), satır düşürüldü", image_path)
                continue

            crop_path = record.get("crop_path") or ""
            crop_bytes: bytes | None = None
            if crop_path:
                crop_file = self._log_cfg.dir / crop_path
                if crop_file.exists():
                    crop_bytes = crop_file.read_bytes()

            bbox_xyxy = record["bbox"]
            x1, y1, x2, y2 = bbox_xyxy
            v = ViolationRecord(
                id=record["id"], camera_id=record["camera_id"],
                detected_at=_dt.datetime.fromisoformat(record["detected_at"].replace("Z", "+00:00")),
                confidence=record["confidence"], bbox_xywh=(x1, y1, x2 - x1, y2 - y1),
                track_id=record["track_id"], image_path=record["image_path"],
                crop_path=crop_path,
            )
            ok = self._backend.post_violation(v, img_file.read_bytes(), crop_bytes) is not None
            if not ok:
                remaining.append(line)

        if remaining:
            tmp_path.write_text("\n".join(remaining) + "\n", encoding="utf-8")
            os.replace(tmp_path, self._queue_path)
        else:
            tmp_path.unlink(missing_ok=True)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
