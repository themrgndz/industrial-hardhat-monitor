import os

# Herhangi bir cv2 içe aktarımından ÖNCE ayarlanmalı: OpenCV'nin FFmpeg arka ucu
# RTSP'de varsayılan olarak UDP kullanır; 1080p'de paket kaybı bozuk kare ve
# hayalet tespit üretir. TCP'ye zorlanır; buffer/reorder gecikmeyi büyütmesin
# diye küçük tutulur.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|max_delay;500000|reorder_queue_size;0",
)
