from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .config import ModelConfig, SahiConfig


@dataclass(slots=True)
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]  # x, y, w, h (piksel, tam kare koordinatı)


class InferenceEngine:
    """YOLO (Ultralytics) + SAHI dilimli çıkarım; uzak/küçük nesnelerde
    fullframe'e göre belirgin daha iyi (bkz. OTURUM-NOTU.md).

    Dilimler orijinal çözünürlükte kesilir (SAHI'nin dahili `get_sliced_prediction`'ı
    yerine manuel döngü kullanılır) — böylece inference çağrı sayısı `upscale_factor`'dan
    etkilenmez. `upscale_factor != 1.0` ise her dilim modele verilmeden önce ayrı ayrı
    LANCZOS4 ile büyütülür; sonuç bbox'ları orijinal kare ölçeğine geri indirilir.
    Tam kare (dilimsiz) ek geçiş büyük nesneleri yakalamak için orijinal ölçekte yapılır.

    Bir karenin dilimleri + tam kare, GPU'ya TEK bir `perform_batch_inference`
    çağrısıyla verilir (N+1 ayrı sıralı çağrı yerine). `predict_batch` bunu bir
    adım öteye taşır: BİRDEN FAZLA kameranın kareleri (main.py'de round-robin
    grup) de aynı tek çağrıda birleştirilir — küçük batch=1 çağrılarının
    kernel-launch/host-round-trip yükü GPU'yu boşta bırakıyordu (ölçüldü: %9
    GPU kullanımı, 12 kamerada %48'e, tur süresi hâlâ hedefi aşıyordu). Ham
    model ileri-geçişi paylaşılır; postprocess/eşik filtresi HER KARE için
    ayrı uygulanır — farklı kameraların koordinat uzayları asla karışmaz
    (2026-09-02).
    """

    def __init__(self, model_cfg: ModelConfig, sahi_cfg: SahiConfig) -> None:
        from sahi import AutoDetectionModel
        from sahi.postprocess.combine import GreedyNMMPostprocess
        from sahi.prediction import ObjectPrediction
        from sahi.slicing import slice_image

        self._model_cfg = model_cfg
        self._sahi_cfg = sahi_cfg
        self._slice_image = slice_image
        self._object_prediction_cls = ObjectPrediction
        self._model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=model_cfg.path,
            confidence_threshold=min(model_cfg.thresholds.values()),
            device=model_cfg.device,
        )
        self._postprocess = GreedyNMMPostprocess(
            match_threshold=sahi_cfg.postprocess_match_threshold,
            match_metric="IOS",
            class_agnostic=False,
        )

    def predict(self, frame: np.ndarray) -> list[Detection]:
        """Tek kare için çıkarım; bkz. `predict_batch`."""
        return self.predict_batch([frame])[0]

    def predict_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        """Birden fazla karenin (farklı kameralardan olabilir) dilim+tam-kare
        görüntüleri TEK bir GPU çağrısında birleştirilir; sonuçlar kareye göre
        ayrıştırılıp postprocess/eşik filtresi her kare için ayrı uygulanır."""
        if not frames:
            return []
        cfg = self._sahi_cfg
        factor = cfg.upscale_factor

        batch_images: list[np.ndarray] = []
        # kare başına: (batch_images içindeki başlangıç indeksi, dilim sayısı,
        # [(shift_x, shift_y), ...], kare_h, kare_w)
        frame_meta: list[tuple[int, int, list[tuple[int, int]], int, int]] = []

        for frame in frames:
            frame_h, frame_w = frame.shape[:2]
            start_idx = len(batch_images)
            shifts: list[tuple[int, int]] = []
            if cfg.enabled:
                slice_result = self._slice_image(
                    image=frame,
                    slice_height=cfg.slice_height, slice_width=cfg.slice_width,
                    overlap_height_ratio=cfg.overlap_ratio, overlap_width_ratio=cfg.overlap_ratio,
                )
                for slice_img, (shift_x, shift_y) in zip(slice_result.images, slice_result.starting_pixels):
                    infer_img = slice_img
                    if factor != 1.0:
                        infer_img = cv2.resize(slice_img, None, fx=factor, fy=factor, interpolation=cv2.INTER_LANCZOS4)
                    batch_images.append(np.ascontiguousarray(infer_img))
                    shifts.append((shift_x, shift_y))
            n_slices = len(shifts)
            # `enabled=False` iken dilim yok, bu geçiş zaten tek kare oluyor; `full_frame_pass=False`
            # iken (dilimler varken) ek tam-kare geçişi atlanır — yalnız dilimlerin performansı ölçülür.
            if not cfg.enabled or cfg.full_frame_pass:
                batch_images.append(np.ascontiguousarray(frame))
                shifts.append((0, 0))
            frame_meta.append((start_idx, n_slices, shifts, frame_h, frame_w))

        self._model.perform_batch_inference(batch_images)
        self._model.convert_original_predictions(
            shift_amount=[[0, 0]] * len(batch_images),
            full_shape=[[img.shape[0], img.shape[1]] for img in batch_images],
        )
        per_image_predictions = self._model.object_prediction_list_per_image

        results: list[list[Detection]] = []
        for start_idx, n_slices, shifts, frame_h, frame_w in frame_meta:
            object_predictions = []
            for local_idx, (shift_x, shift_y) in enumerate(shifts):
                is_slice = local_idx < n_slices
                for pred in per_image_predictions[start_idx + local_idx]:
                    x1, y1, x2, y2 = pred.bbox.to_xyxy()
                    if is_slice and factor != 1.0:
                        x1, y1, x2, y2 = x1 / factor, y1 / factor, x2 / factor, y2 / factor
                    object_predictions.append(self._object_prediction_cls(
                        bbox=[x1 + shift_x, y1 + shift_y, x2 + shift_x, y2 + shift_y],
                        category_id=pred.category.id, category_name=pred.category.name,
                        score=pred.score.value, shift_amount=[0, 0], full_shape=[frame_h, frame_w],
                    ))

            if len(object_predictions) > 1:
                object_predictions = self._postprocess(object_predictions)

            detections: list[Detection] = []
            for pred in object_predictions:
                label = pred.category.name
                conf = float(pred.score.value)
                if conf < self._model_cfg.threshold_for(label):
                    continue
                x1, y1, x2, y2 = pred.bbox.to_xyxy()
                detections.append(Detection(label, conf, (int(x1), int(y1), int(x2 - x1), int(y2 - y1))))
            results.append(detections)
        return results
