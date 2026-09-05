import { useEffect, useState } from "react";
import MetricsPanel from "./MetricsPanel.jsx";

function SensitivityControl({ value, floor, onCommit }) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  const min = Math.round(floor * 100);
  const pct = Math.round(local * 100);
  const commit = (e) => onCommit(Number(e.target.value) / 100);

  return (
    <label className="sensitivity" title="Ekranda gösterilen tespitler için minimum güven eşiği">
      <span>Hassasiyet: %{pct}</span>
      <input
        type="range"
        min={min}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => setLocal(Number(e.target.value) / 100)}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
      />
    </label>
  );
}

export default function Navbar({
  detectorOk,
  activeName,
  ageText,
  stats,
  metrics,
  metricsOk,
  camerasOpen,
  violationsOpen,
  minConfidence,
  confidenceFloor,
  onSensitivityChange,
  onSetBatchSize,
  batchBusy,
  onToggleCameras,
  onToggleViolations,
  onOpenCameraAdmin,
  onGenerateReport,
  reportBusy,
  onToggleEngine,
  engineBusy,
}) {
  const enginePaused = !!metrics?.engine?.paused;
  return (
    <header className="navbar">
      <div className="navbar-brand">UZMAR TEKNOLOJI</div>

      <nav className="navbar-menu">
        <button
          type="button"
          className={`menu-btn ${camerasOpen ? "on" : ""}`}
          onClick={onToggleCameras}
        >
          Kameralar
        </button>
        <button
          type="button"
          className={`menu-btn ${violationsOpen ? "on" : ""}`}
          onClick={onToggleViolations}
        >
          İhlaller
        </button>
      </nav>

      <div className="navbar-status">
        <span className={`pill ${detectorOk ? "on" : "off"}`}>
          detector: {detectorOk ? "bağlı" : "bağlantı yok"}
        </span>
        <span className={`pill ${enginePaused ? "off" : "on"}`}>
          model: {enginePaused ? "duraklatıldı" : "çalışıyor"}
        </span>
        <span className={`pill ${activeName ? "on" : ""}`}>
          aktif kamera: {activeName || "yok"}
        </span>
        <span className="pill">{ageText}</span>
        <MetricsPanel metrics={metrics} ok={metricsOk} onSetBatchSize={onSetBatchSize} batchBusy={batchBusy} />
      </div>

      <SensitivityControl value={minConfidence} floor={confidenceFloor} onCommit={onSensitivityChange} />

      <div className="navbar-stats">
        <div className="card"><div className="card-label">Bugün</div><div className="card-value">{stats.today ?? "—"}</div></div>
        <div className="card"><div className="card-label">Son 1 Saat</div><div className="card-value">{stats.lastHour ?? "—"}</div></div>
        <div className="card"><div className="card-label">Toplam</div><div className="card-value">{stats.total ?? "—"}</div></div>
      </div>

      <div className="navbar-actions">
        <button
          type="button"
          className={`menu-btn ${enginePaused ? "btn-approve" : "btn-danger"}`}
          onClick={onToggleEngine}
          disabled={engineBusy || !metricsOk}
          title={enginePaused ? "Model duraklatıldı, devam ettirmek için tıklayın" : "Modeli tüm kameralarda durdurur"}
        >
          {enginePaused ? "▶ Modeli Başlat" : "⏸ Modeli Durdur"}
        </button>
        <button type="button" className="menu-btn" onClick={onGenerateReport} disabled={reportBusy}>
          {reportBusy ? "Oluşturuluyor…" : "Rapor Oluştur"}
        </button>
        <button type="button" className="navbar-gear" onClick={onOpenCameraAdmin} title="Kamera yönetimi">
          ⚙
        </button>
      </div>
    </header>
  );
}
