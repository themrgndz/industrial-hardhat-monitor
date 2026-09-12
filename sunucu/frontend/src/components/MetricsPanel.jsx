import { useEffect, useState } from "react";
import GpuChart from "./GpuChart.jsx";

function msText(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function cameraStatusText(cam, paused) {
  if (!cam.connected) return "bağlı değil";
  if (paused) return "duraklatıldı";
  if (cam.keepingUp == null) return "analiz bekleniyor";
  return cam.keepingUp ? "yetişiyor" : "gecikiyor";
}

function cameraStatusClass(cam, paused) {
  if (!cam.connected) return "";
  if (paused) return "warn";
  if (cam.keepingUp == null) return "warn";
  return cam.keepingUp ? "on" : "off";
}

// Hassasiyet slider'ının aksine CANLI uygulanmaz: kullanıcı değeri girer,
// yalnız "Onayla" butonuna basınca istek atılır — her hareket denemesi
// GPU'yu zorlamasın diye.
function BatchSizeControl({ value, max, busy, onCommit }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setLocal(value);
  }, [value, dirty]);

  function clamp(raw) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(max, n));
  }

  async function commit() {
    const n = clamp(local);
    setLocal(n);
    await onCommit(n);
    setDirty(false);
  }

  return (
    <li className="d-flex justify-content-between align-items-center gap-2">
      <span className="text-secondary">Grup boyutu (batch size)</span>
      <span className="input-group input-group-sm" style={{ width: 140 }}>
        <input
          type="number" className="form-control" min={1} max={max} value={local} disabled={busy}
          onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={commit} disabled={busy || !dirty} title="Yeni grup boyutunu uygula">
          Onayla
        </button>
      </span>
    </li>
  );
}

// Navbar'daki eski dropdown yerine artık Stage'in "Sistem Kullanımı" görünümü
// içinde tam genişlikte, her zaman açık gösteriliyor (bkz. Stage.jsx).
export default function MetricsPanel({ metrics, ok, gpuHistory, onSetBatchSize, batchBusy, trailsOn, onToggleTrails }) {
  if (!ok) return <p className="text-secondary small mb-0">detector'a bağlanılamıyor.</p>;
  if (!metrics) return null;

  const gpu = metrics.gpu;
  const sched = metrics.scheduling;
  const paused = !!metrics.engine?.paused;

  return (
    <div className="mx-auto" style={{ maxWidth: 820 }}>
      <div className="row g-3">
        <div className="col-md-6">
          <section className="card card-body h-100">
            <h3 className="text-uppercase text-secondary small fw-semibold mb-2">GPU</h3>
            {gpu.available ? (
              <>
                <GpuChart history={gpuHistory} />
                <ul className="list-unstyled d-flex flex-column gap-1 small mb-0 mt-2">
                  <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Kart</span><span>{gpu.name}</span></li>
                  <li className="d-flex justify-content-between gap-2">
                    <span className="text-secondary">VRAM</span>
                    <span>{gpu.memoryUsedMb} / {gpu.memoryTotalMb} MB (%{gpu.memoryPercent})</span>
                  </li>
                </ul>
              </>
            ) : (
              <p className="text-secondary small mb-0">GPU bilgisi okunamıyor (nvidia-smi yok ya da CPU modu).</p>
            )}
          </section>
        </div>

        <div className="col-md-6">
          <section className="card card-body h-100">
            <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Zamanlama</h3>
            <ul className="list-unstyled d-flex flex-column gap-1 small mb-0">
              <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Mod</span><span>{sched.mode === "all" ? "tüm kameralar" : "seçili kamera"}</span></li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Tarama biçimi</span>
                <span>{sched.continuous ? "art arda (bekleme yok)" : "sabit aralıklı"}</span>
              </li>
              <BatchSizeControl
                value={metrics.capture?.batchSize ?? sched.groupSize}
                max={metrics.capture?.max ?? sched.groupSize}
                busy={!!batchBusy}
                onCommit={onSetBatchSize}
              />
              <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Hedef tur süresi</span><span>{sched.baseIntervalS.toFixed(1)} s (en fazla)</span></li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Gerçek tur süresi</span>
                <span>{sched.observedLapS != null ? `${sched.observedLapS.toFixed(2)} s` : "ölçülüyor…"}</span>
              </li>
              {!sched.continuous && (
                <>
                  <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Kamera başı aralık</span><span>{msText(sched.tickIntervalS * 1000)}</span></li>
                  <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Son tur gecikmesi</span><span>{msText(sched.lastLagMs)}</span></li>
                </>
              )}
              <li className="d-flex justify-content-between align-items-center gap-2">
                <span className="text-secondary">Genel durum</span>
                <span className={`badge ${paused ? "text-bg-warning" : sched.keepingUp ? "text-bg-success" : "text-bg-danger"}`}>
                  {paused ? "duraklatıldı" : sched.keepingUp ? "yetişiyor" : "gecikiyor"}
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section className="card card-body mt-3">
        <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Tracker Görselleştirme</h3>
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input" type="checkbox" role="switch" id="trailsToggle"
            checked={!!trailsOn} onChange={onToggleTrails}
          />
          <label className="form-check-label small" htmlFor="trailsToggle">
            Canlı görüntüde takip izini (rota) göster
          </label>
        </div>
      </section>

      <section className="card card-body mt-3">
        <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Kameralar</h3>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th>Kamera</th>
                <th>Kare</th>
                <th>Son analiz</th>
                <th>Ort. süre</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {metrics.cameras.map((cam) => (
                <tr key={cam.id}>
                  <td>{cam.name}</td>
                  <td>{cam.framesProcessed}</td>
                  <td>{msText(cam.lastAnalysisAgeMs)} önce</td>
                  <td>{msText(cam.avgInferenceMs)}</td>
                  <td>
                    <span className={`status-dot ${cameraStatusClass(cam, paused)}`} /> {cameraStatusText(cam, paused)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
