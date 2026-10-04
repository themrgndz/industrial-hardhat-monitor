#!/usr/bin/env bash
# GPU sunucuda Docker dağıtımı için ön kontrol: GPU, NVIDIA driver, CUDA, Docker,
# nvidia-container-toolkit durumunu tek seferde toplar ve ekrana yazdırır.
# Çıktının TAMAMINI kopyalayıp gönderin.
#
#   bash gpu-check.sh

section() { echo ""; echo "==== $1 ===="; }

section "İşletim Sistemi"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "$PRETTY_NAME"
fi
uname -a

section "CPU / RAM"
if command -v lscpu >/dev/null 2>&1; then
    lscpu | grep -E "Model name|CPU\(s\):|Thread|Core"
fi
if [ -f /proc/meminfo ]; then
    grep MemTotal /proc/meminfo
fi

section "NVIDIA driver / CUDA (nvidia-smi)"
if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi
else
    echo "nvidia-smi bulunamadı — NVIDIA driver kurulu değil veya PATH'te yok."
fi

section "Docker"
if command -v docker >/dev/null 2>&1; then
    docker --version
    docker compose version
else
    echo "docker bulunamadı."
fi

section "nvidia-container-toolkit"
if command -v nvidia-ctk >/dev/null 2>&1; then
    nvidia-ctk --version
else
    echo "nvidia-ctk bulunamadı (nvidia-container-toolkit kurulu olmayabilir)."
fi

section "Docker + GPU testi"
if command -v docker >/dev/null 2>&1 && command -v nvidia-smi >/dev/null 2>&1; then
    echo "Test ediliyor: docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi"
    docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi 2>&1
else
    echo "Atlandı (docker ve/veya nvidia-smi yok)."
fi

echo ""
echo "==== BİTTİ — yukarıdaki TÜM çıktıyı kopyalayıp gönderin ===="
