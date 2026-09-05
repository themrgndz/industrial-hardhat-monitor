import { useEffect, useRef, useState } from "react";

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

// Genel özet: model duraklatılmışsa nötr (gri), GPU okunamıyorsa ya da
// zamanlama/kamera gecikiyorsa kırmızı, hepsi normalse yeşil.
function overallOk(metrics) {
  if (!metrics) return null;
  if (metrics.engine?.paused) return null;
  if (!metrics.scheduling.keepingUp) return false;
  return !metrics.cameras.some((c) => c.connected && c.keepingUp === false);
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
    <li>
      <span>Grup boyutu (batch size)</span>
      <span className="batch-size-control">
        <input
          type="number" min={1} max={max} value={local} disabled={busy}
          onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
        />
        <button type="button" onClick={commit} disabled={busy || !dirty} title="Yeni grup boyutunu uygula">
          Onayla
        </button>
      </span>
    </li>
  );
}

export default function MetricsPanel({ metrics, ok, onSetBatchSize, batchBusy }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const gpu = metrics?.gpu;
  const sched = metrics?.scheduling;
  const summaryOk = ok && overallOk(metrics);

  const paused = !!metrics?.engine?.paused;
  const pillText = !ok
    ? "metrik yok"
    : paused
      ? "Model: duraklatıldı"
      : !gpu?.available
        ? "GPU: kullanılamıyor"
        : `GPU: %${Math.round(gpu.utilizationPercent)} · VRAM %${Math.round(gpu.memoryPercent)}`;

  return (
    <div className="metrics-status" ref={rootRef}>
      <button
        type="button"
        className={`pill metrics-pill ${summaryOk === true ? "on" : summaryOk === false ? "off" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="GPU ve zamanlama detayları"
      >
        {pillText}
      </button>

      {open && (
        <div className="metrics-dropdown panel">
          {!ok && <p className="muted">detector'a bağlanılamıyor.</p>}
          {ok && metrics && (
            <>
              <h2>Sistem Kullanımı</h2>
              <section className="metrics-section">
                <h3>GPU</h3>
                {gpu.available ? (
                  <ul className="metrics-kv">
                    <li><span>Kart</span><span>{gpu.name}</span></li>
                    <li><span>Kullanım</span><span>%{Math.round(gpu.utilizationPercent)}</span></li>
                    <li>
                      <span>VRAM</span>
                      <span>{gpu.memoryUsedMb} / {gpu.memoryTotalMb} MB (%{gpu.memoryPercent})</span>
                    </li>
                  </ul>
                ) : (
                  <p className="muted">GPU bilgisi okunamıyor (nvidia-smi yok ya da CPU modu).</p>
                )}
              </section>

              <section className="metrics-section">
                <h3>Zamanlama</h3>
                <ul className="metrics-kv">
                  <li><span>Mod</span><span>{sched.mode === "all" ? "tüm kameralar" : "seçili kamera"}</span></li>
                  <li>
                    <span>Tarama biçimi</span>
                    <span>{sched.continuous ? "art arda (bekleme yok)" : "sabit aralıklı"}</span>
                  </li>
                  <BatchSizeControl
                    value={metrics.capture?.batchSize ?? sched.groupSize}
                    max={metrics.capture?.max ?? sched.groupSize}
                    busy={!!batchBusy}
                    onCommit={onSetBatchSize}
                  />
                  <li><span>Hedef tur süresi</span><span>{sched.baseIntervalS.toFixed(1)} s (en fazla)</span></li>
                  <li>
                    <span>Gerçek tur süresi</span>
                    <span>{sched.observedLapS != null ? `${sched.observedLapS.toFixed(2)} s` : "ölçülüyor…"}</span>
                  </li>
                  {!sched.continuous && (
                    <>
                      <li><span>Kamera başı aralık</span><span>{msText(sched.tickIntervalS * 1000)}</span></li>
                      <li><span>Son tur gecikmesi</span><span>{msText(sched.lastLagMs)}</span></li>
                    </>
                  )}
                  <li>
                    <span>Genel durum</span>
                    <span className={paused ? "chip warn" : sched.keepingUp ? "chip" : "chip bad"}>
                      {paused ? "duraklatıldı" : sched.keepingUp ? "yetişiyor" : "gecikiyor"}
                    </span>
                  </li>
                </ul>
              </section>

              <section className="metrics-section">
                <h3>Kameralar</h3>
                <table className="metrics-table">
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
                          <span className={`dot ${cameraStatusClass(cam, paused)}`} /> {cameraStatusText(cam, paused)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
