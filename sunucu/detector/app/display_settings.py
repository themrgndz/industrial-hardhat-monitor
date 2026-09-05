from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


class DisplaySettingsStore:
    """`display_settings.json` üzerinde canlı görünüm hassasiyet eşiğinin
    okunması/yazılması (cameras_store.py ile aynı atomik yazım deseni).

    Eşik, modelin kendi iç eşiğinin (`floor`, config.yaml'daki en düşük
    per-sınıf threshold) ALTINA asla inemez — o zaten model çıktısında hiç
    üretilmeyen tespitler, ekranda ek filtre olarak gösterilecek bir şey yok.
    """

    def __init__(self, path: Path, floor: float) -> None:
        self._path = path
        self._floor = floor

    def load(self) -> float:
        """Kayıtlı min_confidence değeri; dosya yoksa/bozuksa `floor` (ek filtre kapalı)."""
        if not self._path.exists():
            return self._floor
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            value = float(raw["min_confidence"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError):
            return self._floor
        return max(self._floor, min(1.0, value))

    def save(self, min_confidence: float) -> None:
        data = json.dumps({"min_confidence": min_confidence}, ensure_ascii=False, indent=2)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=str(self._path.parent), prefix=f".{self._path.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(data)
            os.replace(tmp_name, self._path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise
