import { timeFmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

function Row({ v, cameraName, onReview, onOpenEvidence }) {
  return (
    <div
      className={`vrow ${v._fresh ? "fresh" : ""}`}
      title="çift tıkla → kanıt görüntüsü"
      onDoubleClick={() => {
        if (!v.backendId) return;
        onOpenEvidence({
          id: v.backendId,
          cameraLabel: cameraName,
          detectedAt: v.detectedAt,
          confidence: v.confidence,
          bbox: v.bbox,
          trackId: v.trackId,
          hasCrop: !!v.localCrop,
        });
      }}
    >
      {v.backendId ? (
        <img
          src={v.localCrop ? evidenceCropUrl(v.backendId) : evidenceImageUrl(v.backendId)}
          alt="ihlal"
        />
      ) : (
        <div className="queued">kuyrukta</div>
      )}
      <div>
        {cameraName} · {timeFmt.format(new Date(v.detectedAt))}
        {!v.backendId && <div className="muted">backend'e yazılmadı</div>}
      </div>
      <div className="vrow-actions">
        <span className="conf">%{Math.round(v.confidence * 100)}</span>
        <button
          type="button"
          className="btn-sm btn-approve"
          disabled={!v.backendId}
          title={v.backendId ? "Onayla (ihlal)" : "Henüz backend'e yazılmadı"}
          onClick={(e) => { e.stopPropagation(); onReview(v.backendId, "CONFIRMED"); }}
        >
          ✓
        </button>
        <button
          type="button"
          className="btn-sm"
          disabled={!v.backendId}
          title={v.backendId ? "Reddet" : "Henüz backend'e yazılmadı"}
          onClick={(e) => { e.stopPropagation(); onReview(v.backendId, "REJECTED"); }}
        >
          ✖
        </button>
      </div>
    </div>
  );
}

export default function ViolationsPanel({ open, rows, lastHour, cameraById, onReview, onOpenEvidence }) {
  return (
    <aside className={`panel violations-panel ${open ? "" : "collapsed"}`}>
      <h2>Canlı İhlaller <span className="muted">son 1 saat: {lastHour ?? "—"}</span></h2>
      <div className="live-list">
        {rows.map((v) => (
          <Row
            key={v._key}
            v={v}
            cameraName={cameraById(v.cameraId)?.name || v.cameraName || v.cameraId}
            onReview={onReview}
            onOpenEvidence={onOpenEvidence}
          />
        ))}
      </div>
      {rows.length === 0 && <p className="muted empty">henüz ihlal yok</p>}
    </aside>
  );
}
