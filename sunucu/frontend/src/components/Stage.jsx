import { useEffect, useRef, useState } from "react";
import { countsFor, dotClass } from "../hooks/useCameraHub.js";
import { liveUrl, snapshotUrl } from "../api/detector.js";

const VIOLATION_LABEL = "No-Helmet Head";

// Kaynak kare her kamerada 1920x1080 (bkz. Kameralar.txt) — bbox'ları yüzdeye
// çevirip kutucuğun (aynı 16:9 oranındaki) üzerine mutlak konumlandırırız.
const SOURCE_W = 1920;
const SOURCE_H = 1080;
// Bu kadar saniyeden eski analiz varsa nokta göstermeyiz (kamera donmuş/
// kopmuşsa ekranda eski, yanıltıcı noktalar asılı kalmasın).
const STALE_MS = 15000;

function TileDots({ analysis, minConfidence }) {
  if (!analysis || Date.now() - analysis.receivedAt > STALE_MS) return null;
  const dets = (analysis.detections || []).filter((d) => d.confidence >= minConfidence);
  if (dets.length === 0) return null;
  return (
    <div className="tile-dots">
      {dets.map((d, i) => {
        const [x, y, w, h] = d.bbox;
        const cx = ((x + w / 2) / SOURCE_W) * 100;
        const cy = ((y + h / 2) / SOURCE_H) * 100;
        const bad = d.label === VIOLATION_LABEL;
        return (
          <span
            key={i}
            className={`tile-dot ${bad ? "bad" : "ok"}`}
            style={{ left: `${cx}%`, top: `${cy}%` }}
          />
        );
      })}
    </div>
  );
}

function Tile({ cam, onSelect, analysis, minConfidence }) {
  const ref = useRef(null);

  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      img.onerror = () => { img.style.visibility = "hidden"; };
      img.onload = () => { img.style.visibility = ""; };
      img.src = snapshotUrl(cam.id, 480);
    }
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cam.id]);

  return (
    <button type="button" className="tile" onClick={() => onSelect(cam.id)}>
      <img ref={ref} alt="önizleme" />
      <TileDots analysis={analysis} minConfidence={minConfidence} />
      <span className="tile-label">
        <span className={`dot ${dotClass(cam)}`} />
        <span className="nm">{cam.connected ? cam.name : `${cam.name} — bağlantı yok`}</span>
      </span>
    </button>
  );
}

function LiveCounts({ analysis, activeId, minConfidence }) {
  const relevant = analysis && analysis.cameraId === activeId;
  const counts = relevant ? countsFor(analysis.detections, minConfidence) : null;
  if (!counts || Object.keys(counts).length === 0) {
    return <span className="muted">çıkarım: {analysis ? `${analysis.inferenceMs} ms` : "—"}</span>;
  }
  return (
    <>
      <span className="chips">
        {Object.entries(counts).map(([label, n]) => (
          <span key={label} className={`chip ${label === VIOLATION_LABEL ? "bad" : ""}`}>{label}: {n}</span>
        ))}
      </span>
      <span className="muted">çıkarım: {analysis.inferenceMs} ms</span>
    </>
  );
}

export default function Stage({
  cameras, active, analysis, analysisByCamera, minConfidence, onSelect, onClose, onFullscreen,
}) {
  const liveRef = useRef(null);
  const [labelsOn, setLabelsOn] = useState(true);

  useEffect(() => {
    const img = liveRef.current;
    if (!img || !active) return;
    const key = `${active.id}:${labelsOn ? "1" : "0"}`;
    if (img.dataset.liveKey !== key) {
      img.removeAttribute("src"); // eski kameranın/moddaki MJPEG bağlantısı kapanmalı
      img.dataset.liveKey = key;
      img.src = liveUrl(active.id, labelsOn);
    }
  }, [active, labelsOn]);

  if (!active) {
    return (
      <section className="panel stage">
        <div className="grid">
          {cameras.map((cam) => (
            <Tile
              key={cam.id} cam={cam} onSelect={onSelect}
              analysis={analysisByCamera?.[cam.id]} minConfidence={minConfidence}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel stage">
      <div className="live-wrap">
        <div className="live-frame">
          <img ref={liveRef} className="live-image" alt="canlı görüntü" />
        </div>
        <div className="live-bar">
          <span className="live-name">{active.name}</span>
          <LiveCounts analysis={analysis} activeId={active.id} minConfidence={minConfidence} />
          <span className="spacer" />
          <button type="button" onClick={() => setLabelsOn((v) => !v)}>
            {labelsOn ? "Etiketleri Gizle" : "Etiketleri Göster"}
          </button>
          <button type="button" onClick={onFullscreen}>Tam ekran</button>
          <button type="button" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </section>
  );
}
