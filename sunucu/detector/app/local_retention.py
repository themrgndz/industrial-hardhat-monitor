from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from .config import LoggingConfig

logger = logging.getLogger(__name__)


class LocalRetentionWorker:
    """`logging.dir` altındaki kanıt görsellerini (`*.jpg`) yaş + boyut tabanlı
    periyodik olarak temizler — backend tarafındaki `ViolationRetentionScheduler`
    ile AYNI politika, aynı nedenle: geçmiş süresiz birikmesin, disk sınırsız
    dolmasın.

    Normal akışta (backend açık + POST başarılı) `logging.dir`'e hiç kalıcı
    dosya yazılmaz (bkz. `ViolationLogger.record`): bu yalnız backend kapalıyken
    ya da uzun süre erişilemez olduğunda (POST başarısız → retry kuyruğu)
    diskte kalan görseller için bir güvenlik ağıdır. Bir görsel retention
    penceresinden eski olduğu için silinirse ve `retry_queue.jsonl`'da hâlâ
    bekliyorsa, `RetryWorker` dosyayı bulamayınca o satırı sessizce düşürür
    (bkz. `backend_client.RetryWorker._retry_once`) — kabul edilen tradeoff:
    backend bu süreden uzun kapalı kaldıysa zaten kalıcı saymıyoruz.

    `violations.jsonl` / `retry_queue.jsonl` bu temizliğin kapsamı DIŞINDADIR:
    onlar kalıcı metin tabanlı denetim kaydı, boyutları (görsellere kıyasla)
    ihmal edilebilir.
    """

    def __init__(self, cfg: LoggingConfig) -> None:
        self._cfg = cfg
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name="local-retention", daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        # İlk taramayı hemen yap (backend dünden beri kapalıysa bekletmeden
        # başlasın), sonra her `cleanup_interval_seconds`'ta bir tekrarla.
        self._cleanup_once()
        while not self._stop.wait(self._cfg.cleanup_interval_seconds):
            self._cleanup_once()

    def _cleanup_once(self) -> None:
        cfg = self._cfg
        root = cfg.dir
        if not root.is_dir():
            return

        try:
            entries = self._scan(root)
        except OSError:
            logger.exception("yerel kanıt taraması başarısız: %s", root)
            return

        cutoff = time.time() - cfg.retention_hours * 3600.0
        kept: list[tuple[Path, float, int]] = []
        deleted_age = 0
        for path, mtime, size in entries:
            if mtime < cutoff:
                if self._unlink(path):
                    deleted_age += 1
                continue
            kept.append((path, mtime, size))
        if deleted_age:
            logger.info(
                "yerel kanıt yaş temizliği: %.1f saatten eski %d görsel silindi",
                cfg.retention_hours, deleted_age,
            )

        total = sum(size for _, _, size in kept)
        if total > cfg.max_bytes:
            kept.sort(key=lambda item: item[1])  # en eski (mtime) önce
            freed = 0
            deleted_size = 0
            for path, _mtime, size in kept:
                if freed >= cfg.free_bytes:
                    break
                if self._unlink(path):
                    freed += size
                    deleted_size += 1
            if deleted_size:
                logger.info(
                    "yerel kanıt deposu tavanı aşıldı (kullanılan=%d bayt, tavan=%d bayt): "
                    "en eskiden %d bayt (%d dosya) silindi",
                    total, cfg.max_bytes, freed, deleted_size,
                )

        self._prune_empty_dirs(root)

    @staticmethod
    def _scan(root: Path) -> list[tuple[Path, float, int]]:
        entries: list[tuple[Path, float, int]] = []
        for jpg in root.rglob("*.jpg"):
            try:
                st = jpg.stat()
            except OSError:
                continue
            entries.append((jpg, st.st_mtime, st.st_size))
        return entries

    @staticmethod
    def _unlink(path: Path) -> bool:
        try:
            path.unlink(missing_ok=True)
            return True
        except OSError:
            logger.exception("yerel kanıt dosyası silinemedi: %s", path)
            return False

    @staticmethod
    def _prune_empty_dirs(root: Path) -> None:
        """`{gün}/{kamera}/` alt klasörlerinden temizlik sonrası boş kalanları
        siler ki yüzlerce boş gün/kamera klasörü kalıcı olarak birikmesin."""
        if not root.is_dir():
            return
        for day_dir in list(root.iterdir()):
            if not day_dir.is_dir():
                continue
            for cam_dir in list(day_dir.iterdir()):
                if cam_dir.is_dir() and not any(cam_dir.iterdir()):
                    try:
                        cam_dir.rmdir()
                    except OSError:
                        pass
            if day_dir.is_dir() and not any(day_dir.iterdir()):
                try:
                    day_dir.rmdir()
                except OSError:
                    pass
