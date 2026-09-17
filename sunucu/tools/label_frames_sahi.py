"""ExtractedFrames klasorundeki tum goruntuleri, YENI fine-tune edilmis
hardhat_v2_freeze0 modeliyle (production'daki best.pt DEGIL) etiketler ve
Roboflow'a yuklenebilecek YOLO-Darknet formatinda (.txt, sinif_id xc yc w h -
normalize) ciktilari kaynak goruntulerin yaninda kaydeder.

AMAC: elle etiketlemeye yardimci "on-etiketleme" (model-assisted labeling).
Bu yuzden esikler production'dakinden (0.35/0.30) BILEREK cok dusuk tutuldu:
amac yanlis alarmi azaltmak degil, gercek ihlalleri KACIRMAMAK. Roboflow'da
inceleme sirasinda fazla/yanlis kutuyu silmek, gozden kacan bir kutuyu sifirdan
bulup cizmekten cok daha ucuz - o yuzden dusuk esikle "adaylari" bolca uretip
sonra elemek daha hizli.

SAHI bu calistirmada ACIK (config.yaml'daki uretim ayarindan farkli olarak
kullanicinin istegiyle enabled=True) kullanilir.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import cv2

REPO_ROOT = Path(__file__).resolve().parents[1]  # sunucu/
sys.path.insert(0, str(REPO_ROOT / "detector"))

from app.config import ModelConfig, SahiConfig  # noqa: E402
from app.inference import InferenceEngine  # noqa: E402

# --- BURAYI DUZENLE ---
IMAGES_DIR = Path(r"C:\Users\Emre\Desktop\Kamera\ExtractedFrames_Yeni")  # <-- kalan ~2700 etiketsiz karenin oldugu klasor
MODEL_PATH = REPO_ROOT / "detector" / "models" / "hardhat_v2_freeze0.pt"  # <-- Colab'dan indirdigin dosyayi buraya koy (best.pt'ye DOKUNMA)

LABEL_TO_ID = {"Helmet": 0, "No-Helmet Head": 1}
CLASSES_TXT = IMAGES_DIR / "classes.txt"

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def build_engine() -> InferenceEngine:
    model_cfg = ModelConfig(
        path=str(MODEL_PATH),
        device="cuda:0",
        violation_class="No-Helmet Head",
        # Production esikleri (0.35/0.30) DEGIL: on-etiketleme icin bilerek dusuk.
        # Recall'i maksimize et -> zayif/belirsiz adaylar da kutu olarak cikar,
        # inceleme sirasinda gozle elenir. Model No-Helmet Head'de zaten zayif
        # (R=0.415) oldugu icin bu sinifta ozellikle agresif dusuk tutuldu.
        thresholds={"No-Helmet Head": 0.10, "Helmet": 0.15},
    )
    sahi_cfg = SahiConfig(
        slice_height=768,
        slice_width=768,
        overlap_ratio=0.2,
        postprocess_match_threshold=0.5,
        upscale_factor=1.0,
        enabled=True,          # <-- kullanicinin istegi: SAHI acik
        full_frame_pass=True,  # buyuk/yakin nesneler icin ek tam kare gecisi
    )
    return InferenceEngine(model_cfg, sahi_cfg)


def to_yolo_line(label: str, bbox_xywh_px: tuple[int, int, int, int], frame_w: int, frame_h: int) -> str:
    class_id = LABEL_TO_ID[label]
    x, y, w, h = bbox_xywh_px
    xc = (x + w / 2) / frame_w
    yc = (y + h / 2) / frame_h
    nw = w / frame_w
    nh = h / frame_h
    return f"{class_id} {xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}"


def main() -> None:
    if not MODEL_PATH.exists():
        raise SystemExit(f"Model bulunamadi: {MODEL_PATH}")
    if not IMAGES_DIR.exists():
        raise SystemExit(f"Klasor bulunamadi: {IMAGES_DIR}")

    engine = build_engine()

    CLASSES_TXT.write_text("Helmet\nNo-Helmet Head\n", encoding="utf-8")

    files = sorted(p for p in IMAGES_DIR.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    total = len(files)
    print(f"Toplam {total} goruntu bulundu. SAHI enabled=True, slice=768x768, overlap=0.2", flush=True)

    t0 = time.time()
    n_with_detections = 0
    n_boxes = 0
    n_errors = 0

    for i, path in enumerate(files, start=1):
        frame = cv2.imread(str(path))
        if frame is None:
            n_errors += 1
            print(f"[{i}/{total}] OKUNAMADI: {path.name}", flush=True)
            continue

        frame_h, frame_w = frame.shape[:2]
        detections = engine.predict(frame)

        lines = [to_yolo_line(d.label, d.bbox, frame_w, frame_h) for d in detections]
        out_path = path.with_suffix(".txt")
        out_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

        if lines:
            n_with_detections += 1
            n_boxes += len(lines)

        if i % 100 == 0 or i == total:
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            eta = (total - i) / rate if rate > 0 else 0
            print(
                f"[{i}/{total}] {rate:.2f} img/s, ETA {eta/60:.1f} dk, "
                f"tespitli={n_with_detections}, toplam_kutu={n_boxes}, hata={n_errors}",
                flush=True,
            )

    elapsed = time.time() - t0
    print(
        f"BITTI. {total} goruntu, {elapsed/60:.1f} dk. "
        f"Tespit iceren goruntu: {n_with_detections}, toplam kutu: {n_boxes}, okunamayan: {n_errors}",
        flush=True,
    )
    print(f"Etiketler kaydedildi: {IMAGES_DIR} (her goruntu icin ayni adda .txt), sinif listesi: {CLASSES_TXT}")


if __name__ == "__main__":
    main()
