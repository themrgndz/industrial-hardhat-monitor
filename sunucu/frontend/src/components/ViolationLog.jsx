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
    <section className="violation-log-modern">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="h4 mb-1 text-white fw-bold">İhlal Kayıtları</h2>
          <p className="text-secondary small mb-0">Sistem tarafından tespit edilen ve onaylanan ihlallerin geçmişi.</p>
        </div>
        <div className="d-flex align-items-center gap-3">
          <span className="text-secondary small">satıra çift tıkla → kanıt görüntüsü</span>
          {log.paused
            ? <button type="button" className="btn btn-outline-secondary" onClick={log.resume}>↻ Yenile</button>
            : <button type="button" className="btn btn-outline-secondary" onClick={log.clearView}>Görünümü Temizle</button>}
          <button type="button" className="btn btn-outline-danger" onClick={onDeleteAll}>Tümünü Kalıcı Sil</button>
        </div>
      </div>

      <div className="violation-filters">
        <div className="row g-3 align-items-center">
          <div className="col-auto">
            <label className="form-label small text-secondary mb-1">Başlangıç</label>
            <input type="datetime-local" className="form-control form-control-sm bg-dark text-white border-secondary" value={log.from} onChange={(e) => log.setFilter({ from: e.target.value })} />
          </div>
          <div className="col-auto">
            <label className="form-label small text-secondary mb-1">Bitiş</label>
            <input type="datetime-local" className="form-control form-control-sm bg-dark text-white border-secondary" value={log.to} onChange={(e) => log.setFilter({ to: e.target.value })} />
          </div>
          <div className="col-auto">
            <label className="form-label small text-secondary mb-1">Kamera</label>
            <select className="form-select form-select-sm bg-dark text-white border-secondary" value={log.cameraId} onChange={(e) => log.setFilter({ cameraId: e.target.value })}>
              <option value="">Tümü</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="violation-table-container d-flex flex-column">
        <div className="table-responsive flex-grow-1">
          <table className="table violation-table align-middle">
            <thead>
              <tr>
                <th>Kanıt</th>
                <th>Tarih / Saat</th>
                <th>Kamera</th>
                <th>Güven Skoru</th>
                <th>Koordinatlar (Kutu)</th>
              </tr>
            </thead>
            <tbody>
              {log.content.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center text-secondary py-5">
                    Belirtilen kriterlere uygun ihlal kaydı bulunamadı.
                  </td>
                </tr>
              )}
              {log.content.map((v, i) => (
                <tr
                  key={v.id}
                  style={{ cursor: "pointer" }}
                  title="çift tıkla → kanıt görüntüsü"
                  onDoubleClick={() => onOpenEvidence(evidenceList, i)}
                >
                  <td>
                    <img src={v.hasCrop ? evidenceCropUrl(v.id) : evidenceImageUrl(v.id)} alt="ihlal" className="violation-thumbnail" />
                  </td>
                  <td className="fw-medium text-white">{fmt.format(new Date(v.detectedAt))}</td>
                  <td>{cameraById(v.cameraId)?.name || v.cameraId}</td>
                  <td>
                    <span className="violation-confidence">%{Math.round(v.confidence * 100)}</span>
                  </td>
                  <td className="text-secondary font-monospace small">
                    x:{v.bboxX} y:{v.bboxY} w:{v.bboxW} h:{v.bboxH}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {log.totalPages > 0 && (
          <div className="p-3 border-top border-secondary border-opacity-25 d-flex justify-content-between align-items-center bg-dark bg-opacity-50">
            <span className="text-secondary small">
              Toplam {log.totalPages} sayfa (Sayfa {log.page + 1})
            </span>
            <nav>
              <ul className="pagination pagination-sm pagination-modern mb-0">
                <li className={`page-item ${log.page <= 0 ? "disabled" : ""}`}>
                  <button type="button" className="page-link" onClick={() => log.setPage(log.page - 1)}>Önceki</button>
                </li>
                <li className={`page-item ${log.page + 1 >= log.totalPages ? "disabled" : ""}`}>
                  <button type="button" className="page-link" onClick={() => log.setPage(log.page + 1)}>Sonraki</button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>
    </section>
  );
}
