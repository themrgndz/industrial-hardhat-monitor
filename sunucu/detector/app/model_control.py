from __future__ import annotations

import dataclasses
import json
import logging
import os
import tempfile
import threading
from pathlib import Path

from .config import ModelConfig, SahiConfig
from .inference import InferenceEngine

logger = logging.getLogger(__name__)

_WEIGHT_SUFFIXES = {".pt"}


class ModelControl:
    """Model ağırlığının (`detector/models/*.pt`) arayüzden canlı değiştirilmesi.

    `capture_control.py` ile aynı desen: bellekte thread-safe tutulur (döngü
    thread'i `engine` property'sini okur, HTTP thread'i `select()` ile
    değiştirir), `model_settings.json`'a kalıcı yazılır — servis/container
    yeniden başlasa da (config.yaml'daki başlangıç dosyası yerine) son
    seçilen ağırlık korunur.

    Yeni ağırlığın GPU'ya yüklenmesi (birkaç saniye sürebilir) `select()`
    çağrısını (yani HTTP isteğini) bloklar; çağıran taraf (server.py) bu süre
    boyunca çıkarım döngüsünü `EngineControl.pause()` ile durdurmalı — aksi
    halde eski ve yeni model kısa süre birlikte GPU belleğinde olur ve
    döngü, swap tamamlanana kadar hâlâ eski nesneyle çalışmaya devam eder
    (zararsız ama gereksiz VRAM kullanımı).
    """

    def __init__(self, model_cfg: ModelConfig, sahi_cfg: SahiConfig, settings_path: Path) -> None:
        self._dir = Path(model_cfg.path).resolve().parent
        self._model_cfg = model_cfg
        self._sahi_cfg = sahi_cfg
        self._settings_path = settings_path
        self._lock = threading.Lock()

        default_name = Path(model_cfg.path).name
        available = self._available_filenames()
        saved = self._load_saved_filename()
        initial = saved if saved and saved in available else default_name
        if initial not in available and default_name not in available:
            # models/ dizininde beklenen dosya bile yoksa açık hatayla dur —
            # sessizce yanlış bir ağırlıkla başlamaktan iyidir.
            raise RuntimeError(f"model.path dosyası bulunamadı: {model_cfg.path}")
        if initial not in available:
            initial = default_name

        self._filename = initial
        self._engine = InferenceEngine(
            dataclasses.replace(model_cfg, path=str(self._dir / initial)), sahi_cfg,
        )

    def _available_filenames(self) -> list[str]:
        if not self._dir.is_dir():
            return []
        return sorted(
            p.name for p in self._dir.iterdir()
            if p.is_file() and p.suffix.lower() in _WEIGHT_SUFFIXES
        )

    def _load_saved_filename(self) -> str | None:
        if not self._settings_path.exists():
            return None
        try:
            raw = json.loads(self._settings_path.read_text(encoding="utf-8"))
            value = str(raw["filename"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError):
            return None
        return value or None

    def _save(self, filename: str) -> None:
        data = json.dumps({"filename": filename}, ensure_ascii=False, indent=2)
        self._settings_path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=str(self._settings_path.parent), prefix=f".{self._settings_path.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(data)
            try:
                os.replace(tmp_name, self._settings_path)
            except OSError:
                # Docker Desktop bind-mount kısıtı (bkz. cameras_store.py:save) —
                # atomiklik feda edilir, hedefe doğrudan yazılır.
                with open(self._settings_path, "w", encoding="utf-8") as direct:
                    direct.write(data)
                Path(tmp_name).unlink(missing_ok=True)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    @property
    def engine(self) -> InferenceEngine:
        with self._lock:
            return self._engine

    @property
    def current_filename(self) -> str:
        with self._lock:
            return self._filename

    def select(self, filename: str) -> None:
        """Yeni ağırlığı GPU'ya yükler, etkin motoru değiştirir ve seçimi kalıcı yapar.

        Bilinmeyen/eksik dosya adı için `ValueError`; model yüklemesi
        başarısız olursa (bozuk dosya, uyumsuz mimari vb.) yükleme
        istisnası olduğu gibi yükselir — eski motor DEĞİŞMEDEN kalır.
        """
        name = Path(filename).name  # yol geçişini (path traversal) engelle
        if name not in self._available_filenames():
            raise ValueError(f"bilinmeyen model dosyası: {filename!r}")
        logger.info("model ağırlığı değiştiriliyor: %s -> %s", self._filename, name)
        new_engine = InferenceEngine(
            dataclasses.replace(self._model_cfg, path=str(self._dir / name)), self._sahi_cfg,
        )
        with self._lock:
            self._engine = new_engine
            self._filename = name
        self._save(name)
        logger.info("model ağırlığı değiştirildi: %s", name)

    def snapshot(self) -> dict:
        current = self.current_filename
        files = []
        for name in self._available_filenames():
            try:
                size = (self._dir / name).stat().st_size
            except OSError:
                size = None
            files.append({
                "name": name,
                "sizeMb": round(size / (1024 * 1024), 1) if size is not None else None,
                "current": name == current,
            })
        return {"current": current, "files": files}
