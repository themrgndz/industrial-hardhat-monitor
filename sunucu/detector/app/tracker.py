from __future__ import annotations

from dataclasses import dataclass, field

from .config import TrackingConfig
from .inference import Detection


@dataclass(slots=True)
class Track:
    track_id: str
    bbox: tuple[int, int, int, int]
    label: str
    confidence: float
    last_seen_at: float = 0.0          # time.monotonic(); son eşleşme/doğuş anı
    violation_streak: int = 0
    last_reported_at: float = 0.0  # time.monotonic(); 0.0 = hiç raporlanmadı


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, aw, ah = a
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx1, by1, bw, bh = b
    bx2, by2 = bx1 + bw, by1 + bh

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


class IoUTracker:
    """Ultralytics'in yerleşik `track()`'i kullanılmaz: SAHI çıktısı onunla uyumlu
    değil."""

    def __init__(self, run_id: str, cfg: TrackingConfig, violation_label: str) -> None:
        self._run_id = run_id
        self._iou_thresh = cfg.iou_threshold
        self._max_age_seconds = cfg.max_age_seconds
        self._violation_label = violation_label
        self._tracks: dict[str, Track] = {}
        self._counter = 0

    def update(self, detections: list[Detection], now: float) -> list[Track]:
        """`now`: `time.monotonic()` — kare işleme aralığı kamera/yüke göre çok
        değişebildiğinden (tek kamera testinde ~30ms, çok kameralı üretimde
        ~4s) yaşlanma KARE SAYISI değil GEÇEN GERÇEK SÜRE ile ölçülür; böylece
        `max_age_seconds` her iki rejimde de aynı anlama gelir."""
        unmatched_dets = list(range(len(detections)))
        unmatched_tracks = set(self._tracks.keys())

        pairs: list[tuple[float, str, int]] = []
        for tid, track in self._tracks.items():
            for di, det in enumerate(detections):
                iou = _iou(track.bbox, det.bbox)
                if iou >= self._iou_thresh:
                    pairs.append((iou, tid, di))
        pairs.sort(key=lambda p: p[0], reverse=True)

        matched_tracks: set[str] = set()
        matched_dets: set[int] = set()
        for iou, tid, di in pairs:
            if tid in matched_tracks or di in matched_dets:
                continue
            matched_tracks.add(tid)
            matched_dets.add(di)
            det = detections[di]
            track = self._tracks[tid]
            track.bbox = det.bbox
            track.label = det.label
            track.confidence = det.confidence
            track.last_seen_at = now
            track.violation_streak = track.violation_streak + 1 if det.label == self._violation_label else 0
            unmatched_tracks.discard(tid)
            if di in unmatched_dets:
                unmatched_dets.remove(di)

        for di in unmatched_dets:
            det = detections[di]
            self._counter += 1
            tid = f"{self._run_id}-{self._counter}"
            self._tracks[tid] = Track(
                track_id=tid, bbox=det.bbox, label=det.label, confidence=det.confidence,
                last_seen_at=now, violation_streak=1 if det.label == self._violation_label else 0,
            )

        dead: list[str] = []
        for tid in unmatched_tracks:
            track = self._tracks[tid]
            if now - track.last_seen_at > self._max_age_seconds:
                dead.append(tid)
        for tid in dead:
            del self._tracks[tid]

        return list(self._tracks.values())
