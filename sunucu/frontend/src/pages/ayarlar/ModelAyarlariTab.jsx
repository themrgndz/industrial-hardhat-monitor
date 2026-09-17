import { useState } from "react";
import ModelSelectControl from "../../components/ModelSelectControl.jsx";
import BatchSizeControl from "../../components/BatchSizeControl.jsx";
import { msText } from "../../format.js";

/* Model Ayarları sekmesi: aktif model ağırlığını canlı değiştirme + çıkarım
   döngüsünün zamanlaması (mod, tarama biçimi, hedef tur süresi, grup boyutu)
   — Zamanlama, Gpu Takip'ten buraya taşındı, çünkü ikisi de aynı çıkarım
   davranışını (hangi kameralar, ne sıklıkla, ne kadar grup halinde) belirliyor. */
export default function ModelAyarlariTab({ metrics }) {
  const [modelBusy, setModelBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [schedBusy, setSchedBusy] = useState(false);
  const { metrics: data, ok, changeModel, setBatchSize, setScheduling } = metrics;

  if (!ok) return <p className="text-secondary small mb-0">detector'a bağlanılamıyor.</p>;
  if (!data) return null;

  const sched = data.scheduling;
  const paused = !!data.engine?.paused;

  async function withBusy(setBusy, fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex flex-column gap-3 h-100 mx-auto w-100" style={{ maxWidth: 720, fontSize: "1.05rem" }}>
      <section className="card card-body py-3 px-4 flex-grow-0">
        <h3 className="text-uppercase text-secondary fw-semibold mb-3" style={{ fontSize: "0.9rem", letterSpacing: ".04em" }}>Model</h3>
        <ModelSelectControl
          files={data.models?.files ?? []}
          current={data.models?.current ?? null}
          busy={modelBusy}
          onApply={(file) => withBusy(setModelBusy, () => changeModel(file))}
        />
        <p className="text-secondary mb-0 mt-3">
          Uygula'ya basınca model geçici olarak durur, seçilen ağırlık yüklenir ve tüm kameralarda kaldığı yerden devam eder.
        </p>
      </section>

      <section className="card card-body py-3 px-4 flex-grow-0">
        <h3 className="text-uppercase text-secondary fw-semibold mb-3" style={{ fontSize: "0.9rem", letterSpacing: ".04em" }}>Zamanlama</h3>
        <ul className="list-unstyled d-flex flex-column gap-3 mb-0">
          <li className="d-flex justify-content-between align-items-center gap-2">
            <span className="text-secondary">Mod</span>
            <select
              className="form-select" style={{ width: "auto" }}
              value={sched.mode} disabled={schedBusy}
              onChange={(e) => withBusy(setSchedBusy, () => setScheduling({ mode: e.target.value }))}
            >
              <option value="all">tüm kameralar</option>
              <option value="selected">seçili kamera</option>
            </select>
          </li>
          <li className="d-flex justify-content-between align-items-center gap-2">
            <span className="text-secondary">Tarama biçimi</span>
            <select
              className="form-select" style={{ width: "auto" }}
              value={sched.continuous ? "continuous" : "fixed"} disabled={schedBusy}
              onChange={(e) => withBusy(setSchedBusy, () => setScheduling({ continuous: e.target.value === "continuous" }))}
            >
              <option value="continuous">art arda (bekleme yok)</option>
              <option value="fixed">belirli bir fps'de 1 (sabit aralıklı)</option>
            </select>
          </li>
          <BatchSizeControl
            value={data.capture?.batchSize ?? sched.groupSize}
            max={data.capture?.max ?? sched.groupSize}
            busy={batchBusy}
            onCommit={(value) => withBusy(setBatchBusy, () => setBatchSize(value))}
          />
          <li className="d-flex justify-content-between gap-2">
            <span className="text-secondary">Gerçek tur süresi</span>
            <span>{sched.observedLapS != null ? `${sched.observedLapS.toFixed(2)} s` : "ölçülüyor…"}</span>
          </li>
          <li className="d-flex justify-content-between gap-2">
            <span className="text-secondary">Azami tur süresi</span>
            <span>1.00 s</span>
          </li>
          {!sched.continuous && (
            <>
              <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Kamera başı aralık</span><span>{msText(sched.tickIntervalS * 1000)}</span></li>
              <li className="d-flex justify-content-between gap-2"><span className="text-secondary">Son tur gecikmesi</span><span>{msText(sched.lastLagMs)}</span></li>
            </>
          )}
          <li className="d-flex justify-content-between align-items-center gap-2">
            <span className="text-secondary">Genel durum</span>
            <span className={`badge fs-6 ${paused ? "text-bg-warning" : sched.keepingUp ? "text-bg-success" : "text-bg-danger"}`}>
              {paused ? "duraklatıldı" : sched.keepingUp ? "yetişiyor" : "gecikiyor"}
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
