from __future__ import annotations

import logging
import socket
import threading
import time
from urllib.parse import urlsplit

import cv2
import numpy as np

from .config import StreamConfig

logger = logging.getLogger(__name__)

_DEFAULT_PORTS = {"rtsp": 554, "rtsps": 322, "http": 80, "https": 443}

# RTSP açılışı OpenCV'nin FFmpeg arka ucunda SERİLEŞTİRİLİYOR: erişilemez bir
# adres, OpenCV'nin sabit 30 s'lik interrupt zaman aşımı dolana kadar sırayı
# kilitliyor ve bu süre boyunca ÇALIŞAN kameralar da açılamıyor.
# Ölçüm (2 ölü + 1 yerel kamera eşzamanlı): ölü1 30,1 s -> ölü2 60,1 s ->
# yerel ilk kare 62,9 s; ölü kamera yokken yerel ilk kare 1,8 s.
# FFmpeg'in `timeout`/`stimeout` seçeneği bu callback'i etkilemiyor (denendi).
# Bu yüzden açılıştan önce ucuz bir TCP el sıkışması yapılır; ulaşılamayan
# adres hiç `VideoCapture`'a girmez ve kimseyi geciktirmez.
PREFLIGHT_TIMEOUT_S = 2.0


def tcp_reachable(uri: str, timeout: float = PREFLIGHT_TIMEOUT_S) -> bool:
    """Ağ tabanlı kaynak için TCP el sıkışması denemesi.

    Ana bilgisayarı olmayan kaynaklar (dosya yolu) için her zaman `True`:
    ön filtre yalnız ağ adreslerine uygulanır.
    """
    parts = urlsplit(uri)
    if not parts.hostname:
        return True
    try:
        port = parts.port or _DEFAULT_PORTS.get(parts.scheme, 554)
    except ValueError:          # bozuk port alanı: açılışı cv2 reddetsin
        return True
    try:
        with socket.create_connection((parts.hostname, port), timeout):
            return True
    except OSError:
        return False


class StreamReader:
    """Tek arka plan thread'inde `read()` döngüsü; son kareyi kopyasız tutar.

    `grab()`/`retrieve()` çifti aynı `VideoCapture` üzerinde thread'ler arası
    bölünemediği için tek thread'de `read()` + son kare tutma kullanılır.
    Kuyruk yoktur; gecikme birikmez.

    `start()`/`stop()` çifti yeniden çağrılabilir: CameraHub izleyici olmayan
    kameraların okuyucusunu kapatıp gerektiğinde yeniden açar.
    """

    def __init__(self, uri: str, cfg: StreamConfig) -> None:
        self._uri = uri
        self._fail_threshold = cfg.read_fail_threshold
        self._backoff_initial = cfg.reconnect_backoff_initial_s
        self._backoff_max = cfg.reconnect_backoff_max_s
        self._cap: cv2.VideoCapture | None = None
        self._latest: np.ndarray | None = None
        self._seq = 0
        self._last_frame_at = 0.0        # time.monotonic(); 0.0 = hiç kare yok
        self._connected = False
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    @property
    def uri(self) -> str:
        return self._uri

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _open(self) -> cv2.VideoCapture | None:
        """Açılabilirse `VideoCapture`, adres erişilemezse `None`.

        `None` dönüşü `_run` döngüsünde başarısız okuma gibi işlenir; mevcut
        backoff mantığı yeniden denemeyi zamanlar.
        """
        if not tcp_reachable(self._uri):
            logger.debug("stream(%s): adres erişilemez, açılış denenmiyor", self._uri)
            return None
        return cv2.VideoCapture(self._uri, cv2.CAP_FFMPEG)

    def _run(self) -> None:
        self._cap = self._open()
        fail_streak = 0
        reconnect_attempts = 0
        while not self._stop.is_set():
            ok, frame = self._cap.read() if self._cap is not None else (False, None)
            if ok and frame is not None:
                with self._lock:
                    self._latest = frame
                    self._seq += 1
                    self._last_frame_at = time.monotonic()
                    self._connected = True
                fail_streak = 0
                reconnect_attempts = 0
                continue

            fail_streak += 1
            with self._lock:
                self._connected = False
            if fail_streak >= self._fail_threshold:
                logger.warning(
                    "stream(%s): %d ardışık başarısız okuma, yeniden bağlanılıyor (deneme %d)",
                    self._uri, self._fail_threshold, reconnect_attempts + 1,
                )
                if self._cap is not None:
                    self._cap.release()
                backoff = min(self._backoff_initial * (2 ** reconnect_attempts), self._backoff_max)
                if self._stop.wait(backoff):
                    break
                self._cap = self._open()
                reconnect_attempts += 1
                fail_streak = 0
            else:
                time.sleep(0.05)

    def latest(self) -> np.ndarray | None:
        with self._lock:
            return self._latest

    def latest_with_seq(self) -> tuple[np.ndarray | None, int]:
        with self._lock:
            return self._latest, self._seq

    def last_frame_age_ms(self) -> float | None:
        with self._lock:
            if self._last_frame_at == 0.0:
                return None
            return (time.monotonic() - self._last_frame_at) * 1000.0

    @property
    def connected(self) -> bool:
        with self._lock:
            return self._connected

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        self._thread = None
        if thread is not None:
            thread.join(timeout=2)
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        with self._lock:
            self._connected = False
