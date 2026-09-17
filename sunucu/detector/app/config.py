from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

_SECTION_KEYS: dict[str, set[str]] = {
    "stream": {"read_fail_threshold", "reconnect_backoff_initial_s", "reconnect_backoff_max_s", "idle_timeout_s"},
    "capture": {"fps", "continuous", "batch_size"},
    "monitoring": {"mode"},
    "server": {
        "host", "port", "preview_width", "preview_jpeg_quality",
        "live_width", "live_jpeg_quality", "live_fps",
    },
    "model": {"path", "device", "violation_class", "thresholds"},
    "sahi": {
        "slice_height", "slice_width", "overlap_ratio", "postprocess_match_threshold",
        "upscale_factor", "enabled", "full_frame_pass",
    },
    "tracking": {"iou_threshold", "max_age_seconds", "confirm_frames", "cooldown_seconds", "match_distance_ratio"},
    "logging": {"dir", "jsonl_name", "crop_padding_ratio", "jpeg_quality"},
    "backend": {"enabled", "url", "api_key", "timeout_seconds", "retry_interval_seconds"},
}
_MONITORING_MODES = {"selected", "all"}


def _check_keys(d: object, prefix: str, allowed: set[str]) -> None:
    if not isinstance(d, dict):
        raise RuntimeError(f"config.yaml: {prefix.rstrip('.')} bir eşleme (mapping) olmalı")
    present = set(d.keys())
    for key in sorted(allowed - present):
        raise RuntimeError(f"config.yaml: eksik anahtar {prefix}{key}")
    for key in sorted(present - allowed):
        raise RuntimeError(f"config.yaml: bilinmeyen anahtar {prefix}{key}")


@dataclass(frozen=True, slots=True)
class CameraConfig:
    id: str
    name: str
    uri: str
    preview_uri: str

    def effective_preview_uri(self) -> str:
        """Önizleme akışı tanımlı değilse ana akış kullanılır."""
        return self.preview_uri or self.uri


@dataclass(frozen=True, slots=True)
class StreamConfig:
    read_fail_threshold: int
    reconnect_backoff_initial_s: float
    reconnect_backoff_max_s: float
    idle_timeout_s: float


@dataclass(frozen=True, slots=True)
class CaptureConfig:
    fps: float
    continuous: bool
    batch_size: int


@dataclass(frozen=True, slots=True)
class MonitoringConfig:
    mode: str


@dataclass(frozen=True, slots=True)
class ServerConfig:
    host: str
    port: int
    preview_width: int
    preview_jpeg_quality: int
    live_width: int
    live_jpeg_quality: int
    live_fps: float


@dataclass(frozen=True, slots=True)
class ModelConfig:
    path: str
    device: str
    violation_class: str
    thresholds: dict[str, float]

    def threshold_for(self, label: str) -> float:
        """Etiket -> güven eşiği. Bilinmeyen etiket sessizce yanlış eşik uygulamak
        yerine en temkinli (en düşük) eşiğe düşer."""
        return self.thresholds.get(label, min(self.thresholds.values()))


@dataclass(frozen=True, slots=True)
class SahiConfig:
    slice_height: int
    slice_width: int
    overlap_ratio: float
    postprocess_match_threshold: float
    upscale_factor: float = 1.0
    enabled: bool = True                # false → dilimleme tamamen kapalı, kare TEK GEÇİŞTE modele verilir
    full_frame_pass: bool = True         # dilimlere EK olarak tam kare geçişi de yapılsın mı


@dataclass(frozen=True, slots=True)
class TrackingConfig:
    iou_threshold: float
    max_age_seconds: float
    confirm_frames: int
    cooldown_seconds: float
    # IoU eşiği tutmazsa (yavaş kare-işleme aralığında hareketli nesne kutuları
    # örtüşmeyi kaybedebilir) merkez mesafesi köşegen ortalamasına oranla
    # ikincil eşleşme adayı sayılır; bkz. tracker.py `_match_score`.
    # 0 = devre dışı (yalnız IoU). Eski config.yaml dosyalarıyla uyum için
    # varsayılan verilir.
    match_distance_ratio: float = 1.5


@dataclass(frozen=True, slots=True)
class LoggingConfig:
    dir: Path
    jsonl_name: str
    crop_padding_ratio: float
    jpeg_quality: int

    @property
    def jsonl_path(self) -> Path:
        return self.dir / self.jsonl_name


@dataclass(frozen=True, slots=True)
class BackendConfig:
    enabled: bool
    url: str
    api_key: str
    timeout_seconds: float
    retry_interval_seconds: float


@dataclass(frozen=True, slots=True)
class Config:
    cameras_file: Path
    stream: StreamConfig
    capture: CaptureConfig
    monitoring: MonitoringConfig
    server: ServerConfig
    model: ModelConfig
    sahi: SahiConfig
    tracking: TrackingConfig
    logging: LoggingConfig
    backend: BackendConfig

    @classmethod
    def load(cls, path: Path = Path("config.yaml")) -> "Config":
        if not path.exists():
            raise RuntimeError("config.yaml bulunamadı; detector/config.example.yaml dosyasını kopyalayın")
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

        # `cameras_file` kök anahtarı; liste içeriği CameraStore tarafından doğrulanır.
        _check_keys(raw, "", set(_SECTION_KEYS) | {"cameras_file"})

        stream = StreamConfig(**raw["stream"])
        capture = CaptureConfig(**raw["capture"])
        if capture.fps <= 0:
            raise RuntimeError("config.yaml: capture.fps pozitif olmalı")
        if capture.batch_size < 1:
            raise RuntimeError("config.yaml: capture.batch_size en az 1 olmalı")
        monitoring = MonitoringConfig(**raw["monitoring"])
        if monitoring.mode not in _MONITORING_MODES:
            raise RuntimeError(
                f"config.yaml: monitoring.mode {sorted(_MONITORING_MODES)} içinden biri olmalı "
                f"(verilen: {monitoring.mode!r})"
            )
        server = ServerConfig(**raw["server"])
        if server.live_fps <= 0:
            raise RuntimeError("config.yaml: server.live_fps pozitif olmalı")
        model = ModelConfig(
            path=str(path.parent / raw["model"]["path"]),
            device=raw["model"]["device"],
            violation_class=raw["model"]["violation_class"],
            thresholds=dict(raw["model"]["thresholds"]),
        )
        if model.violation_class not in model.thresholds:
            raise RuntimeError(
                f"config.yaml: model.thresholds içinde model.violation_class "
                f"({model.violation_class!r}) için eşik yok"
            )
        sahi = SahiConfig(**raw["sahi"])
        tracking = TrackingConfig(**raw["tracking"])
        logging_cfg = LoggingConfig(
            dir=Path(raw["logging"]["dir"]),
            jsonl_name=raw["logging"]["jsonl_name"],
            crop_padding_ratio=raw["logging"]["crop_padding_ratio"],
            jpeg_quality=raw["logging"]["jpeg_quality"],
        )
        backend = BackendConfig(**raw["backend"])

        return cls(
            cameras_file=path.parent / raw["cameras_file"],
            stream=stream, capture=capture, monitoring=monitoring,
            server=server, model=model, sahi=sahi, tracking=tracking,
            logging=logging_cfg, backend=backend,
        )
