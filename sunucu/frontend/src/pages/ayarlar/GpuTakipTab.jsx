import GpuChart from "../../components/GpuChart.jsx";

function StatTile({ label, value, sub }) {
  return (
    <div className="card card-body py-2 px-3 flex-fill text-center">
      <div className="text-uppercase text-secondary small fw-semibold">{label}</div>
      <div className="fs-4 fw-bold">{value}</div>
      {sub && <div className="text-secondary small">{sub}</div>}
    </div>
  );
}

const num = (v, digits = 0) => (v == null ? "—" : Math.round(v * 10 ** digits) / 10 ** digits);

/* Gpu Takip sekmesi: donanımın anlık her ölçümü (sıcaklık, güç, saat hızı,
   fan) + kullanım/VRAM geçmiş grafikleri — eskiden MetricsPanel'in "GPU"
   kartıydı, burada çok daha kapsamlı veriyle genişledi. Zamanlama (mod,
   tarama biçimi, hedef tur süresi, grup boyutu) buradan Model Ayarları
   sekmesine taşındı — çıkarım motorunun davranışını Model'le birlikte
   ayarlamak daha tutarlı bir gruplama. */
export default function GpuTakipTab({ metrics }) {
  const { metrics: data, ok, gpuHistory } = metrics;

  if (!ok) return <p className="text-secondary small mb-0">detector'a bağlanılamıyor.</p>;
  if (!data) return null;

  const gpu = data.gpu;

  if (!gpu?.available) {
    return <p className="text-secondary small mb-0">GPU bilgisi okunamıyor (nvidia-smi yok ya da CPU modu).</p>;
  }

  return (
    <div className="d-flex flex-column gap-2 h-100">
      <div className="d-flex gap-2">
        <StatTile label="Sıcaklık" value={gpu.temperatureC != null ? `${num(gpu.temperatureC)}°C` : "—"} />
        <StatTile
          label="Güç"
          value={gpu.powerDrawW != null ? `${num(gpu.powerDrawW)} W` : "—"}
          sub={gpu.powerLimitW != null ? `/ ${num(gpu.powerLimitW)} W (%${num(gpu.powerPercent)})` : null}
        />
        <StatTile label="Çekirdek Saati" value={gpu.clockGraphicsMhz != null ? `${num(gpu.clockGraphicsMhz)} MHz` : "—"} />
        <StatTile label="Bellek Saati" value={gpu.clockMemoryMhz != null ? `${num(gpu.clockMemoryMhz)} MHz` : "—"} />
        <StatTile label="Fan" value={gpu.fanPercent != null ? `%${num(gpu.fanPercent)}` : "—"} />
      </div>

      <div className="row g-2">
        <div className="col-lg-6">
          <section className="card card-body py-2 px-3">
            <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Çekirdek Kullanımı</h3>
            <GpuChart history={gpuHistory} field="util" color="var(--bs-primary)" />
            <div className="d-flex justify-content-between small text-secondary mt-2">
              <span>Kart</span><span className="text-body">{gpu.name}</span>
            </div>
          </section>
        </div>
        <div className="col-lg-6">
          <section className="card card-body py-2 px-3">
            <h3 className="text-uppercase text-secondary small fw-semibold mb-2">VRAM Kullanımı</h3>
            <GpuChart history={gpuHistory} field="mem" color="var(--bs-warning)" />
            <div className="d-flex justify-content-between small text-secondary mt-2">
              <span>Bellek</span>
              <span className="text-body">{gpu.memoryUsedMb} / {gpu.memoryTotalMb} MB (boşta {gpu.memoryFreeMb ?? "—"} MB)</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
