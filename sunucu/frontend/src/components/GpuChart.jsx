// Bağımlılıksız, basit SVG çizgi/alan grafiği — GPU kullanım geçmişi 3 sn
// aralıklarla en fazla 120 örnek (bkz. useMetrics.js), bu ölçekte ayrı bir
// grafik kütüphanesi (Chart.js vb.) gereksiz; düz SVG yeterli ve temaya
// (Bootstrap CSS değişkenleri) otomatik uyuyor. `field`/`color` ile aynı
// geçmiş dizisinden farklı seriler (çekirdek kullanımı, VRAM %) çizilebilir.
const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 8, right: 8, bottom: 20, left: 34 };
const GRID_VALUES = [0, 25, 50, 75, 100];

export default function GpuChart({ history, field = "util", color = "var(--bs-primary)", title }) {
  if (!history || history.length < 2) {
    return <p className="text-secondary small mb-0">Grafik için yeterli veri birikmedi…</p>;
  }

  const values = history.map((p) => p[field]).filter((v) => v != null);
  if (values.length < 2) {
    return <p className="text-secondary small mb-0">Grafik için yeterli veri birikmedi…</p>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const first = history[0].t;
  const last = history[history.length - 1].t;
  const span = Math.max(1, last - first);

  const x = (t) => PAD.left + ((t - first) / span) * innerW;
  const y = (v) => PAD.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const points = history.filter((p) => p[field] != null);
  const linePoints = points.map((p) => `${x(p.t).toFixed(1)},${y(p[field]).toFixed(1)}`).join(" ");
  const areaPoints = `${x(points[0].t).toFixed(1)},${(PAD.top + innerH).toFixed(1)} ${linePoints} ${x(points[points.length - 1].t).toFixed(1)},${(PAD.top + innerH).toFixed(1)}`;

  const current = points[points.length - 1][field];
  const avg = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const peak = Math.round(Math.max(...values));

  return (
    <div>
      <div className="d-flex align-items-baseline gap-3 mb-2">
        <span className="display-6 fw-bold">%{Math.round(current)}</span>
        <span className="text-secondary small">şu an · ortalama %{avg} · zirve %{peak}{title ? ` · ${title}` : ""}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-100"
        style={{ maxHeight: 180 }}
        role="img"
        aria-label={`${title || "GPU"} grafiği, şu an yüzde ${Math.round(current)}, ortalama yüzde ${avg}, zirve yüzde ${peak}`}
      >
        {GRID_VALUES.map((v) => (
          <line key={v} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--bs-border-color)" strokeWidth="1" />
        ))}
        {GRID_VALUES.map((v) => (
          <text key={v} x={PAD.left - 6} y={y(v)} fontSize="9" fill="var(--bs-secondary-color)" textAnchor="end" dominantBaseline="middle">
            %{v}
          </text>
        ))}
        <polygon points={areaPoints} fill={color} opacity="0.15" />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" />
      </svg>
    </div>
  );
}
