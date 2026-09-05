import { fmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

function toEvidence(v, cameraLabel) {
  return {
    id: v.id,
    cameraLabel,
    detectedAt: v.detectedAt,
    confidence: v.confidence,
    bbox: [v.bboxX, v.bboxY, v.bboxW, v.bboxH],
    trackId: v.trackId,
    hasCrop: v.hasCrop,
  };
}

export default function ViolationLog({ log, cameras, cameraById, onOpenEvidence, onDeleteAll }) {
  const evidenceList = log.content.map((v) => toEvidence(v, cameraById(v.cameraId)?.name || v.cameraId));
  return (
    <section className="violation-log card panel-blur mx-3 mb-3">
      <details open className="card-body">
        <summary className="fw-semibold" role="button">İhlal Kayıtları</summary>

        <div className="row row-cols-auto g-2 align-items-end my-3">
          <div className="col">
            <label className="form-label small text-secondary mb-1">Başlangıç</label>
            <input type="datetime-local" className="form-control form-control-sm" value={log.from} onChange={(e) => log.setFilter({ from: e.target.value })} />
          </div>
          <div className="col">
            <label className="form-label small text-secondary mb-1">Bitiş</label>
            <input type="datetime-local" className="form-control form-control-sm" value={log.to} onChange={(e) => log.setFilter({ to: e.target.value })} />
          </div>
          <div className="col">
            <label className="form-label small text-secondary mb-1">Kamera</label>
            <select className="form-select form-select-sm" value={log.cameraId} onChange={(e) => log.setFilter({ cameraId: e.target.value })}>
              <option value="">tümü</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col flex-grow-1" />
          <div className="col">
            {log.paused
              ? <button type="button" className="btn btn-sm btn-outline-secondary" onClick={log.resume}>↻ Yenile</button>
              : <button type="button" className="btn btn-sm btn-outline-secondary" onClick={log.clearView}>Görünümü Temizle</button>}
          </div>
          <div className="col">
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={onDeleteAll}>Tümünü Kalıcı Sil</button>
          </div>
          <div className="col d-flex align-items-center">
            <span className="text-secondary small">satıra çift tıkla → kanıt görüntüsü</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Tarih/Saat</th>
                <th>Kamera</th>
                <th>Güven</th>
                <th>Kutu</th>
                <th>Kanıt</th>
              </tr>
            </thead>
            <tbody>
              {log.content.map((v, i) => (
                <tr
                  key={v.id}
                  style={{ cursor: "pointer" }}
                  title="çift tıkla → kanıt görüntüsü"
                  onDoubleClick={() => onOpenEvidence(evidenceList, i)}
                >
                  <td>{fmt.format(new Date(v.detectedAt))}</td>
                  <td>{cameraById(v.cameraId)?.name || v.cameraId}</td>
                  <td>%{Math.round(v.confidence * 100)}</td>
                  <td>{v.bboxX},{v.bboxY} {v.bboxW}×{v.bboxH}</td>
                  <td><img src={v.hasCrop ? evidenceCropUrl(v.id) : evidenceImageUrl(v.id)} alt="ihlal" className="rounded" style={{ width: 56, height: 36, objectFit: "cover" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <nav className="d-flex justify-content-center mt-2">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${log.page <= 0 ? "disabled" : ""}`}>
              <button type="button" className="page-link" onClick={() => log.setPage(log.page - 1)}>‹ Önceki</button>
            </li>
            <li className="page-item disabled"><span className="page-link">{log.totalPages === 0 ? 0 : log.page + 1} / {log.totalPages}</span></li>
            <li className={`page-item ${log.page + 1 >= log.totalPages ? "disabled" : ""}`}>
              <button type="button" className="page-link" onClick={() => log.setPage(log.page + 1)}>Sonraki ›</button>
            </li>
          </ul>
        </nav>
      </details>
    </section>
  );
}
