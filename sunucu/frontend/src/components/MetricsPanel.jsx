/* GPU/Zamanlama Gpu Takip'e, Model Ayarları'na, Kameralar Kamera Ayarları'na
   taşındı (bkz. pages/ayarlar/*). Burada kalan tek şey Tracker Görselleştirme
   — hangi sayfaya (muhtemelen Canlı Akış) taşınacağı henüz kararlaştırılmadı,
   bu dosya o zamana kadar dormant referans olarak kalıyor. */
export default function MetricsPanel({ trailsOn, onToggleTrails }) {
  return (
    <section className="card card-body mx-auto" style={{ maxWidth: 820 }}>
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
  );
}
