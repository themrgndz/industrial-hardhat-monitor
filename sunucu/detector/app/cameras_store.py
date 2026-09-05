from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from .config import CameraConfig

# Kamera id'si sunucu/dosya yollarında güvenli, kısa, küçük harf.
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
_REQUIRED_KEYS = {"id", "name", "uri"}
_ALLOWED_KEYS = {"id", "name", "uri", "preview_uri"}
_URI_SCHEMES = ("rtsp://", "http://", "https://")


class CameraStore:
    """`cameras.json` üzerinde kamera listesinin okunması/yazılması.

    Açılış hatası (bozuk dosya, yinelenen id) `RuntimeError`; API kaynaklı
    doğrulama hatası (POST /api/cameras gövdesi) `ValueError` fırlatır —
    `server.py` bunu 400'e çevirir.
    """

    def __init__(self, path: Path) -> None:
        self._path = path

    def load(self) -> list[CameraConfig]:
        if not self._path.exists():
            return []
        text = self._path.read_text(encoding="utf-8").strip()
        if not text:
            return []
        try:
            raw = json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"{self._path}: geçersiz JSON ({exc})") from exc
        if not isinstance(raw, list):
            raise RuntimeError(f"{self._path}: liste olmalı")

        cameras: list[CameraConfig] = []
        seen_ids: set[str] = set()
        for i, item in enumerate(raw):
            try:
                cam = self.validate(item)
            except ValueError as exc:
                raise RuntimeError(f"{self._path}[{i}]: {exc}") from exc
            if cam.id in seen_ids:
                raise RuntimeError(f"{self._path}: yinelenen kamera id {cam.id!r}")
            seen_ids.add(cam.id)
            cameras.append(cam)
        return cameras

    def save(self, cameras: list[CameraConfig]) -> None:
        payload = [
            {"id": c.id, "name": c.name, "uri": c.uri, "preview_uri": c.preview_uri}
            for c in cameras
        ]
        data = json.dumps(payload, ensure_ascii=False, indent=2)
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
                # Docker Desktop (Windows/macOS) tek dosya bind-mount'unda atomik
                # rename bazen "Device or resource busy" ile reddediliyor
                # (VirtioFS/gRPC-FUSE sınırlaması; ölçüldü: 12. kamera eklenirken
                # kamera canlıda çalışıyor ama dosyaya hiç yazılmıyordu — restart'ta
                # kayboluyordu). Atomiklik feda edilir, hedefe doğrudan yazılır —
                # düşük riskli bir konfig dosyası, kısa süreli kısmi yazım ihtimali
                # burada kabul edilebilir (2026-09-02).
                with open(self._path, "w", encoding="utf-8") as direct:
                    direct.write(data)
                Path(tmp_name).unlink(missing_ok=True)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    def validate(self, item: object) -> CameraConfig:
        """Tek bir kamera girdisini doğrular. Uniqueness kontrolü çağırana aittir."""
        if not isinstance(item, dict):
            raise ValueError("kamera bir nesne (obje) olmalı")
        present = set(item.keys())
        unknown = sorted(present - _ALLOWED_KEYS)
        if unknown:
            raise ValueError(f"bilinmeyen anahtar: {unknown}")
        missing = sorted(_REQUIRED_KEYS - present)
        if missing:
            raise ValueError(f"eksik anahtar: {missing}")

        cam_id = str(item["id"])
        if not _ID_RE.match(cam_id):
            raise ValueError(
                f"geçersiz id {cam_id!r}: küçük harf/rakam/tire, 1-32 karakter olmalı"
            )
        name = str(item["name"])
        if not name or len(name) > 64:
            raise ValueError(f"geçersiz name {name!r}: boş olamaz, en fazla 64 karakter")
        uri = str(item["uri"])
        self._check_uri(uri, "uri")
        preview_uri = str(item.get("preview_uri") or "")
        if preview_uri:
            self._check_uri(preview_uri, "preview_uri")
        return CameraConfig(id=cam_id, name=name, uri=uri, preview_uri=preview_uri)

    @staticmethod
    def _check_uri(uri: str, field: str) -> None:
        if not uri:
            raise ValueError(f"{field} boş olamaz")
        if uri.startswith(_URI_SCHEMES):
            return
        if Path(uri).exists():
            return
        raise ValueError(f"geçersiz {field}: {uri!r}")
