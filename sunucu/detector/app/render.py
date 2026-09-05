from __future__ import annotations

import cv2
import numpy as np

from .inference import Detection

_VIOLATION_COLOR = (0, 0, 255)
_OK_COLOR = (0, 200, 0)
_FONT = cv2.FONT_HERSHEY_SIMPLEX
_FONT_SCALE = 0.4
_THICKNESS = 2


def draw(
    frame: np.ndarray,
    detections: list[Detection],
    violation_label: str,
    out_width: int,
) -> np.ndarray:
    """Kareyi `out_width` genişliğine küçültür ve bbox'ları ölçekleyip çizer.

    Kaynak kare asla yerinde değiştirilmez (aynı numpy tamponu StreamReader'ın
    canlı `_latest` referansıdır).
    """
    src_h, src_w = frame.shape[:2]
    if src_w <= 0 or src_h <= 0:
        return frame.copy()

    scale = 1.0
    if 0 < out_width < src_w:
        scale = out_width / src_w
        out_h = max(1, int(round(src_h * scale)))
        canvas = cv2.resize(frame, (out_width, out_h), interpolation=cv2.INTER_AREA)
    else:
        canvas = frame.copy()

    if not detections:
        return canvas

    canvas_h, canvas_w = canvas.shape[:2]
    for det in detections:
        x, y, w, h = det.bbox
        x1 = int(round(x * scale))
        y1 = int(round(y * scale))
        x2 = int(round((x + w) * scale))
        y2 = int(round((y + h) * scale))
        x1 = max(0, min(canvas_w - 1, x1))
        y1 = max(0, min(canvas_h - 1, y1))
        x2 = max(0, min(canvas_w - 1, x2))
        y2 = max(0, min(canvas_h - 1, y2))
        if x2 <= x1 or y2 <= y1:
            continue

        color = _VIOLATION_COLOR if det.label == violation_label else _OK_COLOR
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, _THICKNESS)

        text = f"{det.label} {det.confidence:.2f}"
        (tw, th), baseline = cv2.getTextSize(text, _FONT, _FONT_SCALE, 1)
        # Etiket kutunun üstüne sığmıyorsa kutunun içine kaydırılır.
        top = y1 - th - baseline - 2
        if top < 0:
            top = y1 + 1
        bottom = min(canvas_h - 1, top + th + baseline + 2)
        right = min(canvas_w - 1, x1 + tw + 4)
        cv2.rectangle(canvas, (x1, top), (right, bottom), color, -1)
        cv2.putText(
            canvas, text, (x1 + 2, bottom - baseline),
            _FONT, _FONT_SCALE, (255, 255, 255), 1, cv2.LINE_AA,
        )
    return canvas
