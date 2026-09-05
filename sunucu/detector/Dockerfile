# Build context MUST be sunucu/ because the app is the package `detector.app`
# (imported as `from . import config` inside detector/app, run as
# `python -m detector.app.main` with cwd = sunucu/).
#
#   docker build -f detector/Dockerfile -t ppe-detector:latest sunucu/
#
# GPU sunucunun NVIDIA driver'ı CUDA 12.4'ü desteklemiyorsa (driver < 550.x,
# `nvidia-smi` çıktısındaki "CUDA Version" alanına bak), CUDA 11.8 varyantına düş:
#   docker compose build --build-arg TORCH_BASE_IMAGE=pytorch/pytorch:2.6.0-cuda11.8-cudnn9-runtime detector
# (ikisi de torch==2.6.0'ı requirements.txt ile birebir eşleşecek şekilde hazır getirir.)
ARG TORCH_BASE_IMAGE=pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime
FROM ${TORCH_BASE_IMAGE}

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

# config.docker.yaml, cameras.docker.json ve detector/models/*.pt gitignore'da
# (host/secret-specific) ama build context'e (sunucu/) mevcutlar; imaja
# gömülüyor (Docker Desktop bu makinede host bind-mount'ları bozuk döndürüyor —
# containerd snapshotter + Windows dosya paylaşımı; bkz. docker-compose.yml).
# cameras.docker.json çalışma zamanında değişebildiği için camera-state/
# named volume ile override edilir (volume boşsa Docker imajdaki içerikle
# otomatik doldurur; directory-level mount — tek dosya mount'ları burada
# yukarıdaki nedenle sorunlu).
COPY config.docker.yaml config.docker.yaml
COPY cameras.docker.json camera-state/cameras.docker.json
COPY detector/models/ detector/models/
ENV PYTHONUNBUFFERED=1
EXPOSE 8090
ENTRYPOINT ["python", "-m", "detector.app.main"]
