import { useEffect, useRef } from "react";
import { dotClass } from "../hooks/useCameraHub.js";
import { snapshotUrl } from "../api/detector.js";

function Preview({ camId, width }) {
  const ref = useRef(null);

  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      img.onerror = () => { img.style.visibility = "hidden"; };
      img.onload = () => { img.style.visibility = ""; };
      img.src = snapshotUrl(camId, width);
    }
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [camId, width]);

  return <img ref={ref} alt="önizleme" />;
}

export default function CameraPanel({ open, cameras, onSelect }) {
  return (
    <aside className={`panel camera-panel ${open ? "" : "collapsed"}`}>
      <h2>Kameralar</h2>
      <div className="camera-list">
        {cameras.length === 0 && <p className="muted">kamera yok</p>}
        {cameras.map((cam) => (
          <button
            key={cam.id}
            type="button"
            className={`cam-card ${cam.active ? "active" : ""}`}
            onClick={() => onSelect(cam.id)}
          >
            <div className="cam-head">
              <span className={`dot ${dotClass(cam)}`} />
              <span className="nm">{cam.name}</span>
              {cam.active && <span className="cam-tag">model</span>}
            </div>
            <Preview camId={cam.id} width={240} />
          </button>
        ))}
      </div>
    </aside>
  );
}
