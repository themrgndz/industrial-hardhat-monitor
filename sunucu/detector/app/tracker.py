from __future__ import annotations

import math
from dataclasses import dataclass

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


def _center(b: tuple[int, int, int, int]) -> tuple[float, float]:
    x, y, w, h = b
    return x + w / 2.0, y + h / 2.0


def _diag(b: tuple[int, int, int, int]) -> float:
    _, _, w, h = b
    return math.hypot(w, h)


def _match_score(
    a: tuple[int, int, int, int], b: tuple[int, int, int, int],
    iou_thresh: float, max_distance_ratio: float,
) -> float | None:
    """IoU eşiğini geçen çift her zaman tercih edilir (skor = iou > 0).
    Geçmezse, kare-işleme aralığı yavaşken (çok kameralı üretimde ~4s, bkz.
    InferenceEngine docstring'i) aynı kişi/nesne birkaç piksel değil, kendi
    kutu boyutunun kat kat üstünde yer değiştirebilir; IoU bu durumda 0'a
    düşer ve track kaybolup her seferinde YENİ track_id ile aynı ihlal tekrar
    raporlanır (yeni track'in `last_reported_at=0.0` olması cooldown'u
    atlatır). Bunu önlemek için IoU eşleşmezse merkez mesafesi, iki kutunun
    ortalama köşegenine oranlanarak (negatif skorla, IoU eşleşmelerinden
    HER ZAMAN düşük öncelikli) ikincil aday olarak kabul edilir."""
    iou = _iou(a, b)
    if iou >= iou_thresh:
        return iou
    if max_distance_ratio <= 0:
        return None
    ax, ay = _center(a)
    bx, by = _center(b)
    distance = math.hypot(ax - bx, ay - by)
    max_distance = max_distance_ratio * (_diag(a) + _diag(b)) / 2.0
    if max_distance > 0 and distance <= max_distance:
        return -distance
    return None


class IoUTracker:
    """Ultralytics'in yerleşik `track()`'i kullanılmaz: SAHI çıktısı onunla uyumlu
    değil."""

    def __init__(self, run_id: str, cfg: TrackingConfig, violation_label: str) -> None:
        self._run_id = run_id
        self._iou_thresh = cfg.iou_threshold
        self._max_age_seconds = cfg.max_age_seconds
        self._max_distance_ratio = cfg.match_distance_ratio
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
                score = _match_score(track.bbox, det.bbox, self._iou_thresh, self._max_distance_ratio)
                if score is not None:
                    pairs.append((score, tid, di))
        pairs.sort(key=lambda p: p[0], reverse=True)

        matched_tracks: set[str] = set()
        matched_dets: set[int] = set()
        for _score, tid, di in pairs:
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
