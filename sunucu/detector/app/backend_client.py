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
    """Backend'e POST başarısız olan ihlalleri periyodik olarak yeniden dener.

    SINIR: Backend uzun süre erişilemezse (3 gün kesinti gibi) kuyruk binlerce
    satıra ulaşabilir. Önceki sürüm her turda dosyanın TAMAMINI `read_text()`
    ile tek seferde belleğe alıp, kalanları `"\\n".join()` ile tek büyük string
    olarak geri yazıyordu — hem bellek hem CPU/IO maliyeti kuyruk boyutuyla
    SINIRSIZ büyüyordu. Şimdi: dosya satır satır okunup yazılıyor (tek seferde
    bellekte tutulan veri yok) ve bir turda en fazla `_MAX_BATCH` kayıt denenir
    (geri kalanı olduğu gibi bir sonraki tura taşınır) — tur maliyeti kuyruk
    boyutundan BAĞIMSIZ, sabit bir üst sınırla sınırlı.
    """

    _MAX_BATCH = 200  # bir turda en fazla bu kadar kayıt denenir

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
            if self._stop.wait(self._interval):
                break
            try:
                self._retry_once()
            except Exception:  # noqa: BLE001 — bu thread 3 gün boyunca hayatta kalmalı;
                # tek bir turun hatası (ör. beklenmeyen disk/encoding sorunu) retry
                # mekanizmasını KALICI olarak öldürmemeli, bir sonraki turda denenir.
                logger.exception("retry_queue turu başarısız, bir sonraki turda denenecek")

    def _retry_once(self) -> None:
        if not self._queue_path.exists():
            return

        tmp_path = self._queue_path.with_suffix(".processing")
        try:
            os.replace(self._queue_path, tmp_path)
        except FileNotFoundError:
            return

        out_path = self._queue_path.with_suffix(".rebuild")
        attempted = 0
        try:
            with tmp_path.open("r", encoding="utf-8") as src, out_path.open("w", encoding="utf-8") as dst:
                for raw_line in src:
                    line = raw_line.strip()
                    if not line:
                        continue
                    if attempted >= self._MAX_BATCH:
                        # bu turun kotası doldu: kalanı (hiç denenmemiş) olduğu gibi
                        # bir sonraki tura taşı — kuyruğun geri kalanını okumaya/
                        # işlemeye gerek yok, akış zaten satır satır.
                        dst.write(line + "\n")
                        continue
                    attempted += 1
                    if not self._retry_line(line):
                        dst.write(line + "\n")
        finally:
            tmp_path.unlink(missing_ok=True)

        if out_path.stat().st_size > 0:
            os.replace(out_path, self._queue_path)
        else:
            out_path.unlink(missing_ok=True)

    def _retry_line(self, line: str) -> bool:
        """Tek bir kuyruk satırını dener. `True` -> satır düşürülsün (başarılı
        POST ya da kurtarılamaz/bozuk kayıt), `False` -> kuyrukta kalsın
        (POST başarısız, bir sonraki turda tekrar denenecek)."""
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("retry_queue: bozuk satır atlandı")
            return True

        try:
            image_path = record.get("image_path")
            if not image_path:
                logger.warning("retry_queue: image_path eksik, satır düşürüldü")
                return True
            img_file = self._log_cfg.dir / image_path
            if not img_file.exists():
                logger.warning("retry_queue: görsel bulunamadı (%s), satır düşürüldü", image_path)
                return True

            crop_path = record.get("crop_path") or ""
            crop_file = self._log_cfg.dir / crop_path if crop_path else None
            crop_bytes: bytes | None = None
            if crop_file is not None and crop_file.exists():
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
        except (KeyError, ValueError, TypeError):
            logger.warning("retry_queue: eksik/bozuk alan, satır düşürüldü")
            return True

        ok = self._backend.post_violation(v, img_file.read_bytes(), crop_bytes) is not None
        if ok:
            # geçici retry-kopyası artık gereksiz: backend tek kaynak oldu.
            img_file.unlink(missing_ok=True)
            if crop_file is not None:
                crop_file.unlink(missing_ok=True)
        return ok

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
