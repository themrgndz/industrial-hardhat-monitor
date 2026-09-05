import { useCallback, useEffect, useState } from "react";
import { fetchMetrics, pauseEngine, resumeEngine, updateBatchSize } from "../api/detector.js";

const METRICS_POLL_MS = 3000;

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [ok, setOk] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMetrics(await fetchMetrics());
      setOk(true);
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

  return { metrics, ok, refresh, toggleEngine, setBatchSize };
}
