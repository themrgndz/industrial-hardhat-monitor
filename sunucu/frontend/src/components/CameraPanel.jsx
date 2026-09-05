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

  return (
    <div className="ratio ratio-16x9 rounded bg-black">
      <img ref={ref} alt="önizleme" style={{ objectFit: "cover" }} />
    </div>
  );
}

export default function CameraPanel({ open, cameras, onSelect, onOpenAdmin }) {
  return (
    <aside className={`camera-panel card panel-blur ${open ? "" : "collapsed"}`}>
      <div className="card-header d-flex align-items-center gap-2">
        <h2 className="h6 mb-0 flex-grow-1">Kameralar</h2>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onOpenAdmin} title="Kamera yönetimi">
          ⚙
        </button>
      </div>
      <div className="card-body camera-list list-group list-group-flush">
        {cameras.length === 0 && <p className="text-secondary small mb-0">kamera yok</p>}
        {cameras.map((cam) => (
          <button
            key={cam.id}
            type="button"
            className={`list-group-item list-group-item-action ${cam.active ? "border-success border-2" : ""}`}
            onClick={() => onSelect(cam.id)}
          >
            <div className="d-flex align-items-center gap-2 mb-1">
              <span className={`status-dot ${dotClass(cam)}`} />
              <span className="flex-grow-1">{cam.name}</span>
              {cam.active && <span className="badge bg-success">model</span>}
            </div>
            <Preview camId={cam.id} width={240} />
          </button>
        ))}
      </div>
    </aside>
  );
}
