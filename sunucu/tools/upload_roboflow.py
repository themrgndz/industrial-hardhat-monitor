"""ExtractedFrames klasorundeki SAHI-etiketli goruntuleri Roboflow projesine
YUKLER. Var olan ~666 etiketli/annotasyonlu goruntuyle KARISMAMASI icin:

  - Ayri bir `batch_name` ile yuklenir (Roboflow'da image kaynaklari batch'e
    gore gruplanir/filtrelenebilir; var olan gorseller farkli/varsayilan
    batch'te kalir, dokunulmaz).
  - `is_prediction=True` ile yuklenir: bu etiketler bir model tahmini olarak
    isaretlenir, "onaylanmis ground truth" olarak sayilmaz. Roboflow Annotate
    ekraninda inceleyip onaylamadan mevcut train/valid/test split'lerine ya
    da yeni bir dataset versiyonuna dahil OLMAZ.
  - Roboflow ayni icerikte (hash) bir goruntu zaten varsa "duplicate" olarak
    isaretler, UZERINE YAZMAZ / ikinci kopya olusturmaz.

Kullanim: python upload_roboflow.py
"""
from __future__ import annotations

import os

from roboflow import Roboflow

API_KEY = os.environ["ROBOFLOW_API_KEY"]
WORKSPACE = "remzi-taskin"
PROJECT = "ppe-detection-o17cs"
DATASET_DIR = r"C:\Users\Emre\Desktop\Kamera\ExtractedFrames_Yeni"  # label_frames_sahi.py'nin IMAGES_DIR'iyle AYNI klasor olmali
BATCH_NAME = "hardhat-v2-freeze0-prelabel"  # tarih/round'a gore degistir, onceki batch'lerle karismasin


def main() -> None:
    rf = Roboflow(api_key=API_KEY)
    workspace = rf.workspace(WORKSPACE)

    print(f"Yukleniyor: {DATASET_DIR} -> {WORKSPACE}/{PROJECT} (batch={BATCH_NAME}, is_prediction=True)", flush=True)
    workspace.upload_dataset(
        dataset_path=DATASET_DIR,
        project_name=PROJECT,
        batch_name=BATCH_NAME,
        is_prediction=True,
        num_workers=12,
        num_retries=2,
    )
    print("BITTI.", flush=True)


if __name__ == "__main__":
    main()
