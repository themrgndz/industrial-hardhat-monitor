import { useEffect, useState } from "react";

function SensitivityControl({ value, floor, onCommit }) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  const min = Math.round(floor * 100);
  const pct = Math.round(local * 100);
  const commit = (e) => onCommit(Number(e.target.value) / 100);

  return (
    <label className="d-flex flex-column small text-secondary" style={{ minWidth: 160 }} title="Ekranda gösterilen tespitler için minimum güven eşiği">
      <span>Hassasiyet: %{pct}</span>
      <input
        type="range"
        className="form-range"
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
  metrics,
  metricsOk,
  violationsOpen,
  metricsViewOpen,
  minConfidence,
  confidenceFloor,
  onSensitivityChange,
  onToggleViolations,
  onToggleMetricsView,
  onOpenAdmin,
  onToggleEngine,
  engineBusy,
  onBrandClick,
}) {
  const enginePaused = !!metrics?.engine?.paused;
  return (
    <header className="navbar panel-blur border-bottom shadow-sm px-3 py-2 d-flex flex-wrap align-items-center gap-3">
      <button
        type="button"
        className="navbar-brand fw-bold m-0 btn btn-link p-0 text-decoration-none text-reset"
        style={{ letterSpacing: "0.06em" }}
        onClick={onBrandClick}
        title="Tüm kameraların olduğu ana ekrana dön"
      >
        UZMAR
      </button>

      <nav className="d-flex gap-2">
        <button
          type="button"
          className={`btn btn-sm ${violationsOpen ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={onToggleViolations}
        >
          İhlaller
        </button>
        <button
          type="button"
          className={`btn btn-sm ${metricsViewOpen ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={onToggleMetricsView}
        >
          Sistem Kullanımı
        </button>
      </nav>

      <div className="flex-grow-1" />

      <SensitivityControl value={minConfidence} floor={confidenceFloor} onCommit={onSensitivityChange} />

      <div className="d-flex align-items-center gap-2">
        <button
          type="button"
          className={`btn btn-sm ${enginePaused ? "btn-success" : "btn-danger"}`}
          onClick={onToggleEngine}
          disabled={engineBusy || !metricsOk}
          title={enginePaused ? "Model duraklatıldı, devam ettirmek için tıklayın" : "Modeli tüm kameralarda durdurur"}
        >
          {enginePaused ? "▶ Modeli Başlat" : "⏸ Modeli Durdur"}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onOpenAdmin} title="Kamera yönetimi">
          ⚙ Kameralar
        </button>
      </div>
    </header>
  );
}
