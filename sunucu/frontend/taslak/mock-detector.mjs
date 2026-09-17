// TEST AMAÇLI, GEÇİCİ mock — gerçek detector backend'i (sunucu/detector, torch/ultralytics
// gerektirir) bu ortamda çalışmıyor. Ayarlar sekmelerini gerçek verilerle görsel olarak
// doğrulamak için /api/cameras, /api/metrics, /api/capture, /api/scheduling,
// /api/models/select'i taklit eder. Node http ile yazıldı (bu makinede bun.exe PATH'te
// değil). Gerçek şema: sunucu/frontend/src/api/detector.js
import { createServer } from "node:http";

const PORT = 8090;

const CAMERAS = [
  { id: "cam-2", name: "Rıhtım / Sahil Kamerası", uri: "rtsp://127.0.0.1:8554/2", previewUri: "", active: false, connected: true },
  { id: "cam-5", name: "Gemi İnşa Hangarı (Orta)", uri: "rtsp://127.0.0.1:8554/5", previewUri: "", active: true, connected: true },
  { id: "cam-iconorta", name: "Gemi Gövde Bloğu", uri: "rtsp://127.0.0.1:8554/iconorta", previewUri: "", active: false, connected: true },
  { id: "cam-9", name: "Hangar Genel Görünüm", uri: "rtsp://127.0.0.1:8554/9", previewUri: "", active: false, connected: false },
  { id: "cam-12", name: "Hangar Depolama Alanı", uri: "rtsp://127.0.0.1:8554/12", previewUri: "", active: false, connected: true },
];

const MODEL_FILES = [
  { name: "epoch70.pt", sizeMb: 148.3 },
  { name: "bestGüncel.pt", sizeMb: 115.2 },
  { name: "best.pt", sizeMb: 38.6 },
  { name: "bestEski.pt", sizeMb: 38.7 },
];

// Gerçek SchedulingControl/CaptureControl/ModelControl'ün taklidi — canlı
// değiştirilebilir, kalıcılık yok (mock sadece bu oturum için).
const STATE = {
  mode: "all",
  continuous: true,
  fps: 1.0,
  batchSize: 8,
  batchMax: 8,
  modelCurrent: "epoch70.pt",
};

const activeCameraId = "cam-5";

function camerasPayload() {
  return { cameras: CAMERAS, activeCameraId, mode: "selected" };
}

function metricsPayload() {
  const t = Date.now() / 1000;
  const util = Math.round(50 + Math.sin(t / 8) * 25 + Math.random() * 5);
  const memUsed = 1500 + Math.round(Math.sin(t / 15) * 400 + Math.random() * 100);
  const memTotal = 8188;
  const baseIntervalS = 1 / STATE.fps;
  const tickIntervalS = baseIntervalS / Math.max(1, STATE.batchSize);
  return {
    gpu: {
      available: true,
      name: "NVIDIA GeForce RTX 4060 Laptop GPU",
      utilizationPercent: util,
      memoryUtilizationPercent: Math.round(util * 0.7),
      memoryUsedMb: memUsed,
      memoryTotalMb: memTotal,
      memoryFreeMb: memTotal - memUsed,
      memoryPercent: Math.round((memUsed / memTotal) * 1000) / 10,
      temperatureC: Math.round(58 + Math.sin(t / 20) * 8),
      powerDrawW: Math.round(35 + Math.sin(t / 10) * 15),
      powerLimitW: 80,
      powerPercent: Math.round(((35 + Math.sin(t / 10) * 15) / 80) * 1000) / 10,
      clockGraphicsMhz: 1800 + Math.round(Math.sin(t / 12) * 200),
      clockMemoryMhz: 8001,
      fanPercent: Math.round(40 + Math.sin(t / 18) * 20),
    },
    scheduling: {
      mode: STATE.mode,
      continuous: STATE.continuous,
      groupSize: STATE.batchSize,
      baseIntervalS,
      observedLapS: baseIntervalS * 0.85,
      keepingUp: true,
      tickIntervalS,
      lastLagMs: 8,
    },
    engine: { paused: false },
    capture: { batchSize: STATE.batchSize, max: STATE.batchMax },
    models: { files: MODEL_FILES, current: STATE.modelCurrent },
    cameras: CAMERAS.map((c, i) => ({
      id: c.id,
      name: c.name,
      framesProcessed: 180 + i * 7,
      lastAnalysisAgeMs: c.connected ? 40 + i * 6 : null,
      avgInferenceMs: c.connected ? 22 + i * 4 : null,
      connected: c.connected,
      keepingUp: c.connected ? i !== 3 : null,
    })),
  };
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/cameras" && req.method === "GET") {
    return sendJson(res, camerasPayload());
  }
  if (url.pathname === "/api/cameras" && req.method === "POST") {
    const body = await readBody(req);
    CAMERAS.push({ id: body.id, name: body.name, uri: body.uri, previewUri: body.preview_uri || "", active: false, connected: false });
    return sendJson(res, camerasPayload());
  }
  const camMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)$/);
  if (camMatch && req.method === "PUT") {
    const body = await readBody(req);
    const cam = CAMERAS.find((c) => c.id === decodeURIComponent(camMatch[1]));
    if (cam) Object.assign(cam, { id: body.id, name: body.name, uri: body.uri, previewUri: body.preview_uri || "" });
    return sendJson(res, camerasPayload());
  }
  if (camMatch && req.method === "DELETE") {
    const idx = CAMERAS.findIndex((c) => c.id === decodeURIComponent(camMatch[1]));
    if (idx >= 0) CAMERAS.splice(idx, 1);
    return sendJson(res, camerasPayload());
  }
  const testMatch = url.pathname.match(/^\/api\/cameras\/([^/]+)\/test$/);
  if (testMatch && req.method === "POST") {
    const cam = CAMERAS.find((c) => c.id === decodeURIComponent(testMatch[1]));
    if (cam?.connected) return sendJson(res, { ok: true, width: 1920, height: 1080 });
    return sendJson(res, { ok: false, error: "bağlantı zaman aşımına uğradı" });
  }
  if (url.pathname === "/api/metrics" && req.method === "GET") {
    return sendJson(res, metricsPayload());
  }
  if (url.pathname === "/api/settings" && req.method === "GET") {
    return sendJson(res, { minConfidence: 0.5, floor: 0.3 });
  }
  if (url.pathname === "/api/capture" && req.method === "POST") {
    const body = await readBody(req);
    STATE.batchSize = Math.max(1, Math.min(STATE.batchMax, Math.round(body.batchSize)));
    return sendJson(res, { batchSize: STATE.batchSize, max: STATE.batchMax });
  }
  if (url.pathname === "/api/scheduling" && req.method === "POST") {
    const body = await readBody(req);
    if (body.mode === "all" || body.mode === "selected") STATE.mode = body.mode;
    if (typeof body.continuous === "boolean") STATE.continuous = body.continuous;
    if (typeof body.fps === "number" && body.fps > 0) STATE.fps = Math.max(0.05, Math.min(30, body.fps));
    return sendJson(res, { mode: STATE.mode, continuous: STATE.continuous, fps: STATE.fps });
  }
  if (url.pathname === "/api/models/select" && req.method === "POST") {
    const body = await readBody(req);
    if (!MODEL_FILES.some((f) => f.name === body.file)) {
      return sendJson(res, { error: "bilinmeyen ağırlık dosyası" }, 400);
    }
    STATE.modelCurrent = body.file;
    return sendJson(res, { current: STATE.modelCurrent, files: MODEL_FILES });
  }
  sendJson(res, { error: "not found" }, 404);
});

server.listen(PORT, () => console.log(`mock-detector: http://127.0.0.1:${PORT} üzerinde dinliyor`));
