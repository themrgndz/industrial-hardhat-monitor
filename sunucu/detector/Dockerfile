# Build context MUST be sunucu/ because the app is the package `detector.app`
# (imported as `from . import config` inside detector/app, run as
# `python -m detector.app.main` with cwd = sunucu/).
#
#   docker build -f detector/Dockerfile -t themrgndzd/ppe-detector:latest sunucu/
#
# Tek image hem GPU sunucuda hem de GPU'suz test makinesinde çalışır: PyTorch
# cuda runtime base image'ı, cuda hiç çağrılmazsa (model.device: "cpu") NVIDIA
# driver/nvidia-container-toolkit GEREKTİRMEZ. GPU'da çalıştırmak için
# `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`
# kullanılır (host'ta nvidia-container-toolkit kurulu + `model.device: "cuda:0"`).
#
# Secret-free image: config.yaml/cameras.json BAKED DEĞİL — bu dosyalar sır
# (api_key, RTSP parolası) içerir ve public Docker Hub repo'suna gitmemeli.
# Çalışma zamanında PPE_CONFIG env'i + bind-mount edilen bir dizin (tek dosya
# DEĞİL — bazı Docker Desktop kurulumlarında single-file bind-mount bozuk
# davranıyor) ile sağlanır; bkz. docker-compose.yml.
#
# Model ağırlıkları (detector/models/*.pt) sır değil — Git LFS asset'i olarak
# imaja gömülür (`git lfs pull` sonrası build context'te hazır olmalı).
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

# opencv needs libGL/glib at the OS level; ffmpeg backs OPENCV_FFMPEG_CAPTURE_OPTIONS (RTSP/TCP).
# apt sources forced to https: some networks run a transparent http proxy that
# corrupts the plain-http Ubuntu archive downloads (Hash Sum mismatch on apt-get update).
RUN sed -i 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g; s|http://security.ubuntu.com|https://security.ubuntu.com|g' /etc/apt/sources.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/sunucu
COPY detector/requirements.txt detector/requirements.txt
RUN pip install --no-cache-dir -r detector/requirements.txt

COPY detector/__init__.py detector/__init__.py
COPY detector/app/ detector/app/
COPY detector/models/ detector/models/

ENV PYTHONUNBUFFERED=1
EXPOSE 8090
ENTRYPOINT ["python", "-m", "detector.app.main"]
