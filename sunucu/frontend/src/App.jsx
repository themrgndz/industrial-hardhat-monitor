import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { useCameraHub } from "./hooks/useCameraHub.js";
import { useMetrics } from "./hooks/useMetrics.js";
import { useLiveViolations } from "./hooks/useLiveViolations.js";
import { useViolationLog } from "./hooks/useViolationLog.js";
import { downloadReportPdf, fetchStats } from "./api/backend.js";
import Navbar from "./components/Navbar.jsx";
import CameraPanel from "./components/CameraPanel.jsx";
import Stage from "./components/Stage.jsx";
import ViolationsPanel from "./components/ViolationsPanel.jsx";
import ViolationLog from "./components/ViolationLog.jsx";
import EvidenceModal from "./components/EvidenceModal.jsx";
import CamerasAdminModal from "./components/CamerasAdminModal.jsx";

const STATS_POLL_MS = 10000;

export default function App() {
  const hub = useCameraHub();
  const metrics = useMetrics();
  const log = useViolationLog();
  const [stats, setStats] = useState({});
  const [camerasOpen, setCamerasOpen] = useState(false);
  const [violationsOpen, setViolationsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [evidenceQueue, setEvidenceQueue] = useState(null); // { items: [...], index } | null
  const [adminOpen, setAdminOpen] = useState(false);
  const [metricsView, setMetricsView] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await fetchStats());
    } catch (err) {
      console.warn("stats/summary alınamadı", err);
    }
  }, []);

  const live = useLiveViolations({
    onChanged: () => { refreshStats(); if (log.page === 0) log.refresh(); },
  });

  useEffect(() => {
    refreshStats();
    const timer = setInterval(refreshStats, STATS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStats]);

  function cameraById(id) {
    return hub.cameras.find((c) => c.id === id) || null;
  }

  const evidence = evidenceQueue ? evidenceQueue.items[evidenceQueue.index] : null;

  function openEvidence(items, index) {
    if (index < 0 || index >= items.length) return;
    setEvidenceQueue({ items, index });
  }

  function closeEvidence() {
    setEvidenceQueue(null);
  }

  function advanceEvidence() {
    setEvidenceQueue((q) => {
      if (!q) return null;
      const next = q.index + 1;
      return next < q.items.length ? { ...q, index: next } : null;
    });
  }

  async function handleSelect(id) {
    setMetricsView(false);
    await hub.selectCamera(id);
    log.setCameraId(id);
  }

  async function handleClose() {
    setMetricsView(false);
    await hub.releaseCamera();
    log.setCameraId("");
  }

  async function handleToggleEngine() {
    setEngineBusy(true);
    try {
      await metrics.toggleEngine();
    } finally {
      setEngineBusy(false);
    }
  }

  async function handleSetBatchSize(value) {
    setBatchBusy(true);
    try {
      await metrics.setBatchSize(value);
    } finally {
      setBatchBusy(false);
    }
  }

  function review(id, status) {
    live.review(id, status);
    log.refresh();
    refreshStats();
  }

  async function handleDeleteAllHistory() {
    if (!confirm("Tüm ihlal geçmişi (kayıtlar + kanıt görselleri) KALICI olarak silinecek. Emin misiniz?")) return;
    try {
      const deleted = await log.deleteAll();
      live.clear();
      refreshStats();
      alert(`${deleted} ihlal kaydı kalıcı olarak silindi.`);
    } catch (err) {
      alert(`Silme hatası: ${err.message}`);
    }
  }

  async function handleGenerateReport() {
    setReportBusy(true);
    try {
      const cameraNames = Object.fromEntries(hub.cameras.map((c) => [c.id, c.name]));
      await downloadReportPdf(cameraNames);
    } catch (err) {
      alert(`Rapor oluşturulamadı: ${err.message}`);
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className={`app ${focusMode ? "focus-mode" : ""}`}>
      <div className="app-viewport">
        {!focusMode && (
          <Navbar
            metrics={metrics.metrics}
            metricsOk={metrics.ok}
            camerasOpen={camerasOpen}
            violationsOpen={violationsOpen}
            metricsViewOpen={metricsView}
            minConfidence={hub.minConfidence}
            confidenceFloor={hub.confidenceFloor}
            onSensitivityChange={hub.setSensitivity}
            onToggleCameras={() => setCamerasOpen((v) => !v)}
            onToggleViolations={() => setViolationsOpen((v) => !v)}
            onToggleMetricsView={() => setMetricsView((v) => !v)}
            onGenerateReport={handleGenerateReport}
            reportBusy={reportBusy}
            onToggleEngine={handleToggleEngine}
            engineBusy={engineBusy}
            onBrandClick={handleClose}
          />
        )}

        <main className={`layout ${camerasOpen ? "cam-open" : ""} ${violationsOpen ? "vio-open" : ""}`}>
          {!focusMode && (
            <CameraPanel
              open={camerasOpen}
              cameras={hub.cameras}
              onSelect={handleSelect}
              onOpenAdmin={() => setAdminOpen(true)}
            />
          )}

          <Stage
            cameras={hub.cameras}
            active={hub.active}
            analysis={hub.analysis}
            analysisByCamera={hub.analysisByCamera}
            minConfidence={hub.minConfidence}
            onSelect={handleSelect}
            onClose={handleClose}
            onFullscreen={() => setFocusMode((v) => !v)}
            metricsView={metricsView}
            metrics={metrics.metrics}
            metricsOk={metrics.ok}
            gpuHistory={metrics.gpuHistory}
            onSetBatchSize={handleSetBatchSize}
            batchBusy={batchBusy}
          />

          {!focusMode && (
            <ViolationsPanel
              open={violationsOpen}
              rows={live.rows}
              lastHour={stats.lastHour}
              cameraById={cameraById}
              onReview={review}
              onOpenEvidence={openEvidence}
            />
          )}
        </main>
      </div>

      {!focusMode && (
        <ViolationLog
          log={log}
          cameras={hub.cameras}
          cameraById={cameraById}
          onOpenEvidence={openEvidence}
          onDeleteAll={handleDeleteAllHistory}
        />
      )}

      <EvidenceModal evidence={evidence} onClose={closeEvidence} onReview={review} onAdvance={advanceEvidence} />
      <CamerasAdminModal
        open={adminOpen}
        cameras={hub.cameras}
        onClose={() => setAdminOpen(false)}
        onCamerasChanged={hub.applyCameras}
      />
    </div>
  );
}
