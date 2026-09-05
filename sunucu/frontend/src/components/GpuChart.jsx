// Bağımlılıksız, basit SVG çizgi/alan grafiği — GPU kullanım geçmişi 3 sn
// aralıklarla en fazla 120 örnek (bkz. useMetrics.js), bu ölçekte ayrı bir
// grafik kütüphanesi (Chart.js vb.) gereksiz; düz SVG yeterli ve temaya
// (Bootstrap CSS değişkenleri) otomatik uyuyor.
const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 8, right: 8, bottom: 20, left: 34 };
const GRID_VALUES = [0, 25, 50, 75, 100];

export default function GpuChart({ history }) {
  if (!history || history.length < 2) {
    return <p className="text-secondary small mb-0">Grafik için yeterli veri birikmedi…</p>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const first = history[0].t;
  const last = history[history.length - 1].t;
  const span = Math.max(1, last - first);

  const x = (t) => PAD.left + ((t - first) / span) * innerW;
  const y = (v) => PAD.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const linePoints = history.map((p) => `${x(p.t).toFixed(1)},${y(p.util).toFixed(1)}`).join(" ");
  const areaPoints = `${PAD.left},${(PAD.top + innerH).toFixed(1)} ${linePoints} ${x(last).toFixed(1)},${(PAD.top + innerH).toFixed(1)}`;

  const current = history[history.length - 1].util;
  const avg = Math.round(history.reduce((sum, p) => sum + p.util, 0) / history.length);
  const peak = Math.round(Math.max(...history.map((p) => p.util)));

  return (
    <div>
      <div className="d-flex align-items-baseline gap-3 mb-2">
        <span className="display-6 fw-bold">%{Math.round(current)}</span>
        <span className="text-secondary small">şu an · ortalama %{avg} · zirve %{peak}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-100"
        style={{ maxHeight: 180 }}
        role="img"
        aria-label={`GPU kullanım grafiği, şu an yüzde ${Math.round(current)}, ortalama yüzde ${avg}, zirve yüzde ${peak}`}
      >
        {GRID_VALUES.map((v) => (
          <line key={v} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--bs-border-color)" strokeWidth="1" />
        ))}
        {GRID_VALUES.map((v) => (
          <text key={v} x={PAD.left - 6} y={y(v)} fontSize="9" fill="var(--bs-secondary-color)" textAnchor="end" dominantBaseline="middle">
            %{v}
          </text>
        ))}
        <polygon points={areaPoints} fill="var(--bs-primary)" opacity="0.15" />
        <polyline points={linePoints} fill="none" stroke="var(--bs-primary)" strokeWidth="2" />
      </svg>
    </div>
  );
}
