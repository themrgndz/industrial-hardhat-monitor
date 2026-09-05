import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectEvents, fetchCameras, fetchSettings,
  releaseCamera as apiRelease, selectCamera as apiSelect, updateMinConfidence as apiUpdateMinConfidence,
} from "../api/detector.js";

const CAMERAS_POLL_MS = 5000;

// yeşil: model bu kamerada çalışıyor (aktif + bağlı) · sarı: yayın var, model çalışmıyor
// (bağlı ama aktif değil) · kırmızı (varsayılan): hiç yayın/bağlantı yok.
export function dotClass(cam) {
  if (cam.active && cam.connected) return "on";
  if (cam.connected) return "warn";
  return "";
}

// Ham tespit listesini (label, confidence) `minConfidence` eşiğine göre sayar —
// hassasiyet ayarı sunucuda yalnız canlı akış çizimini filtreler, sayaçlar
// (chip'ler) burada aynı eşikle istemci tarafında yeniden hesaplanır.
export function countsFor(detections, minConfidence) {
  const counts = {};
  for (const d of detections || []) {
    if (d.confidence < minConfidence) continue;
    counts[d.label] = (counts[d.label] || 0) + 1;
  }
  return counts;
}

export function useCameraHub() {
  const [cameras, setCameras] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState("selected");
  const [detectorOk, setDetectorOk] = useState(false);
  // { cameraId, receivedAt, inferenceMs, detections }
  const [analysis, setAnalysis] = useState(null);
  // kamera id -> { receivedAt, inferenceMs, detections }; grid kutucuklarındaki
  // nokta overlay'i için TÜM kameraların son analizini tutar (yukarıdaki
  // `analysis` yalnız o an açık/canlı görüntülenen tek kamerayı tutar).
  const [analysisByCamera, setAnalysisByCamera] = useState({});
  const [minConfidence, setMinConfidence] = useState(0);
  const [confidenceFloor, setConfidenceFloor] = useState(0);
  const reconnectTimer = useRef(null);
  const sourceRef = useRef(null);

  const applyCameras = useCallback((data) => {
    setCameras(data.cameras || []);
    setActiveId(data.activeCameraId ?? null);
    setMode(data.mode || "selected");
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyCameras(await fetchCameras());
      setDetectorOk(true);
    } catch {
      setDetectorOk(false);
    }
  }, [applyCameras]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, CAMERAS_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    fetchSettings()
      .then((s) => { setMinConfidence(s.minConfidence); setConfidenceFloor(s.floor); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function connect() {
      const source = connectEvents({
        open: () => setDetectorOk(true),
        error: () => {
          setDetectorOk(false);
          if (source.readyState === EventSource.CLOSED && reconnectTimer.current === null) {
            reconnectTimer.current = setTimeout(() => {
              reconnectTimer.current = null;
              connect();
            }, 3000);
          }
        },
        cameras: (data) => {
          setDetectorOk(true);
          applyCameras(data);
        },
        camera: () => refresh(),
        analysis: (data) => {
          setAnalysis({
            cameraId: data.cameraId,
            receivedAt: Date.now(),
            inferenceMs: data.inferenceMs,
            detections: data.detections || [],
          });
          setAnalysisByCamera((prev) => ({
            ...prev,
            [data.cameraId]: {
              receivedAt: Date.now(),
              inferenceMs: data.inferenceMs,
              detections: data.detections || [],
            },
          }));
        },
        settings: (data) => {
          setMinConfidence(data.minConfidence);
          setConfidenceFloor(data.floor);
        },
      });
      sourceRef.current = source;
    }
    connect();
    return () => {
      sourceRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCamera = useCallback(async (id) => {
    try {
      const data = await apiSelect(id);
      setActiveId(data.activeCameraId);
      setAnalysis(null);
      await refresh();
    } catch {
      setDetectorOk(false);
    }
  }, [refresh]);

  const releaseCamera = useCallback(async () => {
    try {
      await apiRelease();
    } catch {
      setDetectorOk(false);
    }
    setActiveId(null);
    setAnalysis(null);
    await refresh();
  }, [refresh]);

  const setSensitivity = useCallback(async (value) => {
    try {
      const data = await apiUpdateMinConfidence(value);
      setMinConfidence(data.minConfidence);
      setConfidenceFloor(data.floor);
    } catch {
      // sessizce yut — kullanıcı slider'ı tekrar hareket ettirirse yeniden dener
    }
  }, []);

  const active = cameras.find((c) => c.id === activeId) || null;

  return {
    cameras, activeId, active, mode, detectorOk, analysis, analysisByCamera,
    minConfidence, confidenceFloor, setSensitivity,
    selectCamera, releaseCamera, refresh, applyCameras,
  };
}
