import { timeFmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

function toEvidence(v, cameraName) {
  return {
    id: v.backendId,
    cameraLabel: cameraName,
    detectedAt: v.detectedAt,
    confidence: v.confidence,
    bbox: v.bbox,
    trackId: v.trackId,
    hasCrop: !!v.localCrop,
  };
}

function Row({ v, cameraName, evidenceList, evidenceIndex, onReview, onOpenEvidence }) {
  return (
    <div
      className={`list-group-item d-flex align-items-center gap-2 ${v._fresh ? "border-danger border-2" : ""}`}
      title="çift tıkla → kanıt görüntüsü"
      onDoubleClick={() => {
        if (!v.backendId) return;
        onOpenEvidence(evidenceList, evidenceIndex);
      }}
    >
      {v.backendId ? (
        <img
          src={v.localCrop ? evidenceCropUrl(v.backendId) : evidenceImageUrl(v.backendId)}
          alt="ihlal"
          className="rounded"
          style={{ width: 56, height: 40, objectFit: "cover" }}
        />
      ) : (
        <div className="border border-danger rounded d-flex align-items-center justify-content-center text-danger text-center" style={{ width: 56, height: 40, fontSize: 10 }}>
          kuyrukta
        </div>
      )}
      <div className="flex-grow-1 small">
        {cameraName} · {timeFmt.format(new Date(v.detectedAt))}
        {!v.backendId && <div className="text-secondary">backend'e yazılmadı</div>}
      </div>
      <div className="d-flex align-items-center gap-1">
        <span className="badge text-bg-danger">%{Math.round(v.confidence * 100)}</span>
        <button
          type="button"
          className="btn btn-sm btn-outline-success"
          disabled={!v.backendId}
          title={v.backendId ? "Onayla (ihlal)" : "Henüz backend'e yazılmadı"}
          onClick={(e) => { e.stopPropagation(); onReview(v.backendId, "CONFIRMED"); }}
        >
          ✓
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
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
  const nameFor = (v) => cameraById(v.cameraId)?.name || v.cameraName || v.cameraId;
  const openable = rows.filter((v) => v.backendId);
  const evidenceList = openable.map((v) => toEvidence(v, nameFor(v)));
  return (
    <aside className={`violations-panel card panel-blur ${open ? "" : "collapsed"}`}>
      <div className="card-header d-flex align-items-baseline gap-2">
        <h2 className="h6 mb-0">Canlı İhlaller</h2>
        <span className="text-secondary small">son 1 saat: {lastHour ?? "—"}</span>
      </div>
      <div className="card-body live-list list-group list-group-flush d-flex flex-column gap-2">
        {rows.map((v) => (
          <Row
            key={v._key}
            v={v}
            cameraName={nameFor(v)}
            evidenceList={evidenceList}
            evidenceIndex={openable.indexOf(v)}
            onReview={onReview}
            onOpenEvidence={onOpenEvidence}
          />
        ))}
        {rows.length === 0 && <p className="text-secondary small mb-0">henüz ihlal yok</p>}
      </div>
    </aside>
  );
}
