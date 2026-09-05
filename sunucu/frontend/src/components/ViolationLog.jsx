import { fmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

export default function ViolationLog({ log, cameras, cameraById, onOpenEvidence, onDeleteAll }) {
  return (
    <section className="panel violation-log">
      <details open>
        <summary>İhlal Kayıtları</summary>
        <div className="filters">
          <label>Başlangıç
            <input type="datetime-local" value={log.from} onChange={(e) => log.setFilter({ from: e.target.value })} />
          </label>
          <label>Bitiş
            <input type="datetime-local" value={log.to} onChange={(e) => log.setFilter({ to: e.target.value })} />
          </label>
          <label>Kamera
            <select value={log.cameraId} onChange={(e) => log.setFilter({ cameraId: e.target.value })}>
              <option value="">tümü</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <span className="spacer" />
          {log.paused
            ? <button type="button" onClick={log.resume}>↻ Yenile</button>
            : <button type="button" onClick={log.clearView}>Görünümü Temizle</button>}
          <button type="button" className="btn-danger" onClick={onDeleteAll}>Tümünü Kalıcı Sil</button>
          <span className="muted">satıra çift tıkla → kanıt görüntüsü</span>
        </div>

        <table>
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
            {log.content.map((v) => (
              <tr
                key={v.id}
                title="çift tıkla → kanıt görüntüsü"
                onDoubleClick={() => onOpenEvidence({
                  id: v.id,
                  cameraLabel: cameraById(v.cameraId)?.name || v.cameraId,
                  detectedAt: v.detectedAt,
                  confidence: v.confidence,
                  bbox: [v.bboxX, v.bboxY, v.bboxW, v.bboxH],
                  trackId: v.trackId,
                  hasCrop: v.hasCrop,
                })}
              >
                <td>{fmt.format(new Date(v.detectedAt))}</td>
                <td>{cameraById(v.cameraId)?.name || v.cameraId}</td>
                <td>%{Math.round(v.confidence * 100)}</td>
                <td>{v.bboxX},{v.bboxY} {v.bboxW}×{v.bboxH}</td>
                <td><img src={v.hasCrop ? evidenceCropUrl(v.id) : evidenceImageUrl(v.id)} alt="ihlal" /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pager">
          <button type="button" disabled={log.page <= 0} onClick={() => log.setPage(log.page - 1)}>‹ Önceki</button>
          <span>{log.totalPages === 0 ? 0 : log.page + 1} / {log.totalPages}</span>
          <button type="button" disabled={log.page + 1 >= log.totalPages} onClick={() => log.setPage(log.page + 1)}>Sonraki ›</button>
        </div>
      </details>
    </section>
  );
}
