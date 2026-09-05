from __future__ import annotations

import json
import logging
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

import cv2
import numpy as np

from . import render
from .capture_control import CaptureControl
from .config import Config
from .engine_control import EngineControl
from .events import EventBus
from .hub import CameraHub
from .metrics import GpuMonitor, SchedulerStats
from .stream import tcp_reachable

logger = logging.getLogger(__name__)

_BOUNDARY = b"ppeframe"
_SSE_KEEPALIVE_S = 15.0
_MJPEG_FIRST_FRAME_WAIT_S = 1.0
_MJPEG_NO_FRAME_LIMIT_S = 30.0
_MIN_WIDTH = 64
_MAX_WIDTH = 1920
_PROBE_TIMEOUT_S = 8.0
_PROBE_TIMEOUT_MS = 8000


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self, address, handler, cfg: Config, hub: CameraHub, bus: EventBus,
        scheduler_stats: SchedulerStats, gpu_monitor: GpuMonitor, engine_control: EngineControl,
        capture_control: CaptureControl,
    ) -> None:
        super().__init__(address, handler)
        self.cfg = cfg
        self.hub = hub
        self.bus = bus
        self.scheduler_stats = scheduler_stats
        self.gpu_monitor = gpu_monitor
        self.engine_control = engine_control
        self.capture_control = capture_control

    def handle_error(self, request, client_address) -> None:
        """MJPEG/SSE istemcisi sekmeyi kapattığında socketserver tam traceback
        basıyor; bu normal akış, hata değil."""
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            logger.debug("istemci bağlantıyı kapattı: %s", client_address)
            return
        logger.exception("http isteği başarısız: %s", client_address)


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ppe-detector"

    # ---- yardımcılar -----------------------------------------------------

    @property
    def _cfg(self) -> Config:
        return self.server.cfg  # type: ignore[attr-defined]

    @property
    def _hub(self) -> CameraHub:
        return self.server.hub  # type: ignore[attr-defined]

    @property
    def _bus(self) -> EventBus:
        return self.server.bus  # type: ignore[attr-defined]

    @property
    def _scheduler_stats(self) -> SchedulerStats:
        return self.server.scheduler_stats  # type: ignore[attr-defined]

    @property
    def _gpu_monitor(self) -> GpuMonitor:
        return self.server.gpu_monitor  # type: ignore[attr-defined]

    @property
    def _engine_control(self) -> EngineControl:
        return self.server.engine_control  # type: ignore[attr-defined]

    @property
    def _capture_control(self) -> CaptureControl:
        return self.server.capture_control  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args) -> None:
        logger.debug("http %s - %s", self.address_string(), fmt % args)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, body: dict, status: int = 200) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def _send_stream_headers(self, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()
        self.close_connection = True

    def _cameras_body(self) -> dict:
        return self._hub.cameras_body()

    def _metrics_body(self) -> dict:
        engine = self._engine_control.snapshot()
        sched = self._scheduler_stats.snapshot()
        expected_interval_ms = (
            sched["observedLapS"] * 1000.0 if sched["observedLapS"] is not None
            else sched["baseIntervalS"] * 1000.0
        )
        cameras = []
        for camera_id in self._hub.camera_ids:
            st = self._hub.state(camera_id)
            analysed = st.analysis_at != 0.0
            analysis_age_ms = (time.monotonic() - st.analysis_at) * 1000.0 if analysed else None
            avg_ms = st.inference_ms_total / st.frames_processed if st.frames_processed else None
            keeping_up = None
            if analysed and not engine["paused"]:
                keeping_up = expected_interval_ms <= 0 or analysis_age_ms <= expected_interval_ms * 2
            cameras.append({
                "id": camera_id,
                "name": st.cfg.name,
                "connected": bool(st.reader is not None and st.reader.connected),
                "framesProcessed": st.frames_processed,
                "lastInferenceMs": round(st.inference_ms) if analysed else None,
                "avgInferenceMs": round(avg_ms) if avg_ms is not None else None,
                "lastAnalysisAgeMs": round(analysis_age_ms) if analysis_age_ms is not None else None,
                "keepingUp": keeping_up,
            })
        return {
            "gpu": self._gpu_monitor.snapshot(),
            "engine": engine,
            "scheduling": sched,
            "capture": self._capture_control.snapshot(),
            "cameras": cameras,
        }

    def _width_param(self, query: dict[str, list[str]], default: int) -> int:
        raw = query.get("w", [""])[0]
        if not raw:
            return default
        try:
            value = int(raw)
        except ValueError:
            return default
        return max(_MIN_WIDTH, min(_MAX_WIDTH, value))

    # ---- yönlendirme -----------------------------------------------------

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parts = urlsplit(self.path)
        path = parts.path
        query = parse_qs(parts.query)

        if path == "/api/health":
            self._send_json({
                "status": "ok",
                "mode": self._cfg.monitoring.mode,
                "cameras": len(self._hub.camera_ids),
            })
            return
        if path == "/api/metrics":
            self._send_json(self._metrics_body())
            return
        if path == "/api/engine":
            self._send_json(self._engine_control.snapshot())
            return
        if path == "/api/cameras":
            self._send_json(self._cameras_body())
            return
        if path == "/api/settings":
            self._send_json(self._hub.display_settings_body())
            return
        if path == "/api/capture":
            self._send_json(self._capture_control.snapshot())
            return
        if path == "/api/events":
            self._handle_events()
            return

        segments = [unquote(s) for s in path.strip("/").split("/")]
        if len(segments) == 4 and segments[0] == "api" and segments[1] == "cameras":
            camera_id, leaf = segments[2], segments[3]
            if not self._hub.has(camera_id):
                self._send_json({"error": "unknown camera"}, 404)
                return
            if leaf == "snapshot.jpg":
                self._handle_snapshot(camera_id, query)
                return
            if leaf == "live.mjpg":
                self._handle_live(camera_id, query)
                return

        self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length) if length else b""
        try:
            body: dict = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "invalid json"}, 400)
            return

        path = urlsplit(self.path).path
        if path == "/api/cameras/active/release":
            self._hub.release()
            self._hub.ensure_readers()
            self._send_json({"activeCameraId": None})
            return
        if path == "/api/engine/pause":
            self._engine_control.pause()
            self._send_json(self._engine_control.snapshot())
            return
        if path == "/api/engine/resume":
            self._engine_control.resume()
            self._send_json(self._engine_control.snapshot())
            return
        if path == "/api/settings":
            raw = body.get("minConfidence")
            if not isinstance(raw, (int, float)) or isinstance(raw, bool):
                self._send_json({"error": "minConfidence sayısal olmalı"}, 400)
                return
            self._hub.set_min_confidence(float(raw))
            self._send_json(self._hub.display_settings_body())
            return
        if path == "/api/capture":
            raw = body.get("batchSize")
            if not isinstance(raw, (int, float)) or isinstance(raw, bool) or raw < 1:
                self._send_json({"error": "batchSize 1 veya üstü tam sayı olmalı"}, 400)
                return
            snapshot = self._capture_control.set_batch_size(int(raw))
            self._bus.publish("capture", snapshot)
            self._send_json(snapshot)
            return

        if path == "/api/cameras":
            try:
                cam = self._hub._store.validate(body)  # noqa: SLF001
            except ValueError as exc:
                self._send_json({"error": str(exc)}, 400)
                return
            try:
                self._hub.add(cam)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, 409)
                return
            self._send_json(self._cameras_body(), 201)
            return

        segments = [unquote(s) for s in path.strip("/").split("/")]
        if len(segments) == 4 and segments[0] == "api" and segments[1] == "cameras":
            camera_id, leaf = segments[2], segments[3]
            if leaf == "select":
                if not self._hub.has(camera_id):
                    self._send_json({"error": "unknown camera"}, 404)
                    return
                self._hub.select(camera_id)
                self._hub.ensure_readers()
                self._bus.publish("camera", self._hub.camera_event(camera_id))
                self._send_json({"activeCameraId": camera_id})
                return
            if leaf == "test":
                if not self._hub.has(camera_id):
                    self._send_json({"error": "unknown camera"}, 404)
                    return
                self._handle_camera_test(camera_id)
                return

        self._send_json({"error": "not found"}, 404)

    def do_PUT(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length) if length else b""
        try:
            body: dict = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "invalid json"}, 400)
            return

        path = urlsplit(self.path).path
        segments = [unquote(s) for s in path.strip("/").split("/")]
        if len(segments) == 3 and segments[0] == "api" and segments[1] == "cameras":
            camera_id = segments[2]
            if not self._hub.has(camera_id):
                self._send_json({"error": "unknown camera"}, 404)
                return
            try:
                cam = self._hub._store.validate(body)  # noqa: SLF001
            except ValueError as exc:
                self._send_json({"error": str(exc)}, 400)
                return
            try:
                self._hub.update(camera_id, cam)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, 409)
                return
            self._send_json(self._cameras_body())
            return
        self._send_json({"error": "not found"}, 404)

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        segments = [unquote(s) for s in path.strip("/").split("/")]
        if len(segments) == 3 and segments[0] == "api" and segments[1] == "cameras":
            camera_id = segments[2]
            try:
                self._hub.remove(camera_id)
            except KeyError:
                self._send_json({"error": "unknown camera"}, 404)
                return
            self._send_json(self._cameras_body())
            return
        self._send_json({"error": "not found"}, 404)

    # ---- uç noktalar -----------------------------------------------------

    def _handle_snapshot(self, camera_id: str, query: dict[str, list[str]]) -> None:
        self._hub.touch_viewer(camera_id)
        frame = self._hub.frame(camera_id)
        if frame is None:
            # İlk istek okuyucuyu başlatmış olur; istemci tekrar dener.
            self._send_json({"error": "no frame"}, 503)
            return
        width = self._width_param(query, self._cfg.server.preview_width)
        canvas = render.draw(frame, [], self._cfg.model.violation_class, width)
        jpg = _encode(canvas, self._cfg.server.preview_jpeg_quality)
        if jpg is None:
            self._send_json({"error": "encode failed"}, 500)
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpg)))
        self._cors()
        self.end_headers()
        self.wfile.write(jpg)

    def _handle_live(self, camera_id: str, query: dict[str, list[str]]) -> None:
        deadline = time.monotonic() + _MJPEG_FIRST_FRAME_WAIT_S
        while True:
            if not self._hub.has(camera_id):
                self._send_json({"error": "unknown camera"}, 404)
                return
            self._hub.touch_viewer(camera_id)
            if self._hub.frame(camera_id) is not None:
                break
            if time.monotonic() >= deadline:
                self._send_json({"error": "no frame"}, 503)
                return
            time.sleep(0.05)

        width = self._width_param(query, self._cfg.server.live_width)
        quality = self._cfg.server.live_jpeg_quality
        interval = 1.0 / self._cfg.server.live_fps
        violation_label = self._cfg.model.violation_class
        labels_on = query.get("labels", ["1"])[0] != "0"

        self._send_stream_headers(f"multipart/x-mixed-replace; boundary={_BOUNDARY.decode()}")
        last_frame_at = time.monotonic()
        try:
            while True:
                loop_start = time.monotonic()
                if not self._hub.has(camera_id):
                    return
                self._hub.touch_viewer(camera_id)
                frame = self._hub.frame(camera_id)
                if frame is None:
                    if loop_start - last_frame_at > _MJPEG_NO_FRAME_LIMIT_S:
                        return
                    time.sleep(interval)
                    continue
                last_frame_at = loop_start

                detections, _age_ms = self._hub.analysis(camera_id)
                if labels_on:
                    min_conf = self._hub.min_confidence
                    detections = [d for d in detections if d.confidence >= min_conf]
                else:
                    detections = []
                canvas = render.draw(frame, detections, violation_label, width)
                jpg = _encode(canvas, quality)
                if jpg is None:
                    time.sleep(interval)
                    continue

                self.wfile.write(
                    b"--" + _BOUNDARY + b"\r\nContent-Type: image/jpeg\r\nContent-Length: "
                    + str(len(jpg)).encode("ascii") + b"\r\n\r\n"
                )
                self.wfile.write(jpg)
                self.wfile.write(b"\r\n")
                self.wfile.flush()

                sleep = interval - (time.monotonic() - loop_start)
                if sleep > 0:
                    time.sleep(sleep)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return

    def _handle_camera_test(self, camera_id: str) -> None:
        """Kameranın URI'sine bağlanıp tek kare okumayı dener.

        `CAP_PROP_OPEN_TIMEOUT_MSEC` bu FFmpeg yapısında dikkate alınmıyor
        (erişilemez RTSP'de açılış 20 s'yi aşıyor), bu yüzden probe ayrı bir
        daemon thread'de çalışır ve duvar saati bütçesi burada uygulanır.
        Süre aşılırsa istek hemen yanıtlanır; thread kendi başına bitip
        yakalayıcıyı serbest bırakır.
        """
        uri = self._hub.state(camera_id).cfg.uri
        result: dict = {}
        worker = threading.Thread(
            target=_probe_uri, args=(uri, result),
            name=f"probe-{camera_id}", daemon=True,
        )
        worker.start()
        worker.join(_PROBE_TIMEOUT_S)
        if worker.is_alive():
            self._send_json({"ok": False, "error": f"zaman aşımı ({_PROBE_TIMEOUT_S:.0f} s)"})
            return
        self._send_json(result)

    def _handle_events(self) -> None:
        q = self._bus.subscribe()
        self._send_stream_headers("text/event-stream; charset=utf-8")
        try:
            self._write_event("cameras", self._cameras_body())
            self._write_event("settings", self._hub.display_settings_body())
            while True:
                try:
                    event_type, payload = q.get(timeout=_SSE_KEEPALIVE_S)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                self._write_event(event_type, payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        finally:
            self._bus.unsubscribe(q)

    def _write_event(self, event_type: str, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False)
        self.wfile.write(f"event: {event_type}\ndata: {data}\n\n".encode("utf-8"))
        self.wfile.flush()


def _encode(frame: np.ndarray, quality: int) -> bytes | None:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


def _probe_uri(uri: str, out: dict) -> None:
    """Tek kare okumayı dener; sonucu `out` sözlüğüne yazar (thread hedefi)."""
    # Erişilemez adres önce TCP ile elenir: OpenCV'nin FFmpeg arka ucu açılışı
    # serileştirdiği için ölü bir adrese yapılan `open` 30 s boyunca sırayı
    # kilitler ve o sırada ÇALIŞAN kameraların okuyucuları da açılamaz. Test
    # ucunun bir kamerayı test etmek uğruna yayını durdurması kabul edilemez.
    if not tcp_reachable(uri):
        out.update(ok=False, error="adrese TCP bağlantısı kurulamadı")
        return
    cap = cv2.VideoCapture()
    try:
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, _PROBE_TIMEOUT_MS)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, _PROBE_TIMEOUT_MS)
        # Arka uç açıkça FFMPEG olmalı: `OPENCV_FFMPEG_CAPTURE_OPTIONS`
        # (rtsp_transport;tcp) yalnız bu arka uca uygulanıyor. Seçim OpenCV'ye
        # bırakılırsa RTSP UDP ile denenip çalışan kamerada bile zaman aşımına
        # düşüyor -- StreamReader._open da aynı sebeple CAP_FFMPEG veriyor.
        cap.open(uri, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            out.update(ok=False, error="bağlantı açılamadı")
            return
        ok, frame = cap.read()
        if not ok or frame is None:
            out.update(ok=False, error="kare okunamadı")
            return
        height, width = frame.shape[:2]
        out.update(ok=True, width=width, height=height)
    except Exception as exc:  # noqa: BLE001
        out.update(ok=False, error=str(exc))
    finally:
        cap.release()


class DetectorServer:
    """Canlı görüntü + durum + olay akışı için stdlib HTTP katmanı.

    Mevcut kod tamamen bloklayan (OpenCV/torch) thread modeli üzerine kurulu;
    async çerçeve eklenmez.
    """

    def __init__(
        self, cfg: Config, hub: CameraHub, bus: EventBus,
        scheduler_stats: SchedulerStats, gpu_monitor: GpuMonitor, engine_control: EngineControl,
        capture_control: CaptureControl,
    ) -> None:
        self._cfg = cfg
        self._hub = hub
        self._bus = bus
        self._scheduler_stats = scheduler_stats
        self._gpu_monitor = gpu_monitor
        self._engine_control = engine_control
        self._capture_control = capture_control
        self._httpd: _Server | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        address = (self._cfg.server.host, self._cfg.server.port)
        self._httpd = _Server(
            address, _Handler, self._cfg, self._hub, self._bus,
            self._scheduler_stats, self._gpu_monitor, self._engine_control, self._capture_control,
        )
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        logger.info("detector API dinliyor: http://%s:%d", *address)

    def stop(self) -> None:
        if self._httpd is None:
            return
        self._httpd.shutdown()
        self._httpd.server_close()
        if self._thread is not None:
            self._thread.join(timeout=2)
        self._httpd = None
        self._thread = None
