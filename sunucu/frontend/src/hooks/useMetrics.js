import { useCallback, useEffect, useState } from "react";
import { fetchMetrics, pauseEngine, resumeEngine, updateBatchSize } from "../api/detector.js";

const METRICS_POLL_MS = 3000;
// 3 saniyelik aralıkla 120 örnek = son 6 dakikalık GPU geçmişi.
const HISTORY_LIMIT = 120;

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [ok, setOk] = useState(false);
  const [gpuHistory, setGpuHistory] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
      setOk(true);
      if (data.gpu?.available) {
        setGpuHistory((prev) => [
          ...prev,
          { t: Date.now(), util: data.gpu.utilizationPercent, mem: data.gpu.memoryPercent },
        ].slice(-HISTORY_LIMIT));
      }
    } catch {
      setOk(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, METRICS_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const toggleEngine = useCallback(async () => {
    if (metrics?.engine?.paused) await resumeEngine();
    else await pauseEngine();
    await refresh();
  }, [metrics, refresh]);

  const setBatchSize = useCallback(async (value) => {
    await updateBatchSize(value);
    await refresh();
  }, [refresh]);

  return { metrics, ok, gpuHistory, refresh, toggleEngine, setBatchSize };
}
