import { useState } from "react";
import { addCamera, deleteCamera, updateCamera } from "../../api/detector.js";
import { dotClass } from "../../hooks/useCameraHub.js";
import { msText, cameraStatusText, cameraStatusClass } from "../../format.js";

const EMPTY_FORM = { id: "", name: "", uri: "", previewUri: "" };

/* Kamera Ayarları sekmesi: solda kompakt ekle/düzenle formu, sağda TEK tablo
   (kayıt + bağlantı durumu + görüntü/akış sağlığı birleşik — eskiden iki ayrı,
   neredeyse aynı kamera listesini tekrar eden tabloydu). Yan yana yerleşim +
   sıkı boşluklar: sekme içeriği kayan panelin (.ayarlar__content) yüksekliğini
   aşmasın, kaydırma çubuğu çıkmasın diye. */
export default function KameraAyarlariTab({ hub, metrics }) {
  const { cameras, applyCameras } = hub;
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null); // null = ekleme modu, aksi hâlde düzenlenen kameranın mevcut id'si
  const [feedback, setFeedback] = useState({ msg: "", error: false });
  const [busy, setBusy] = useState(false);

  function startEdit(cam) {
    setEditingId(cam.id);
    setForm({ id: cam.id, name: cam.name, uri: cam.uri || "", previewUri: cam.previewUri || "" });
    setFeedback({ msg: "", error: false });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFeedback({ msg: "", error: false });
  }

  async function handleSubmit() {
    if (!form.id.trim() || !form.name.trim() || !form.uri.trim()) {
      setFeedback({ msg: "id, ad ve URI (link) zorunlu.", error: true });
      return;
    }
    setBusy(true);
    setFeedback({ msg: editingId ? "kaydediliyor…" : "ekleniyor…", error: false });
    try {
      const data = editingId ? await updateCamera(editingId, form) : await addCamera(form);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFeedback({ msg: editingId ? "Kamera güncellendi." : "Kamera eklendi.", error: false });
      applyCameras(data);
    } catch (err) {
      setFeedback({ msg: err.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm(`"${id}" kamerasını silmek istediğinizden emin misiniz?`)) return;
    setFeedback({ msg: "siliniyor…", error: false });
    try {
      const data = await deleteCamera(id);
      if (editingId === id) cancelEdit();
      setFeedback({ msg: "Kamera silindi.", error: false });
      applyCameras(data);
    } catch (err) {
      setFeedback({ msg: err.message, error: true });
    }
  }

  const paused = !!metrics.metrics?.engine?.paused;
  const health = metrics.ok ? (metrics.metrics?.cameras ?? []) : [];
  const healthById = Object.fromEntries(health.map((h) => [h.id, h]));

  return (
    <div className="row g-3 h-100">
      <div className="col-lg-4">
        <section className="card card-body py-2 px-3 h-100">
          <h3 className="text-uppercase text-secondary small fw-semibold mb-2">{editingId ? "Kamerayı Düzenle" : "Kamera Ekle"}</h3>
          <div className="row g-2">
            <div className="col-5">
              <label className="form-label small text-secondary mb-1">Id</label>
              <input type="text" className="form-control form-control-sm" placeholder="cam-4" value={form.id} disabled={!!editingId} onChange={(e) => setForm({ ...form, id: e.target.value })} />
            </div>
            <div className="col-7">
              <label className="form-label small text-secondary mb-1">Ad</label>
              <input type="text" className="form-control form-control-sm" placeholder="Kamera 4" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small text-secondary mb-1">Link (URI)</label>
              <input type="text" className="form-control form-control-sm" placeholder="rtsp://kullanici:sifre@ip:port/..." value={form.uri} onChange={(e) => setForm({ ...form, uri: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small text-secondary mb-1">Önizleme linki (opsiyonel)</label>
              <input type="text" className="form-control form-control-sm" placeholder="(boş bırakılırsa ana link kullanılır)" value={form.previewUri} onChange={(e) => setForm({ ...form, previewUri: e.target.value })} />
            </div>
          </div>
          <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={handleSubmit}>{editingId ? "Kaydet" : "Ekle"}</button>
            {editingId && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cancelEdit}>İptal</button>}
            <span className={`small ${feedback.error ? "text-danger" : "text-secondary"}`}>{feedback.msg}</span>
          </div>
        </section>
      </div>

      <div className="col-lg-8">
        <section className="card card-body py-2 px-3 h-100 d-flex flex-column">
          <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Aktif Ekli Kameralar — Görüntü ve Akış Bilgisi</h3>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Durum</th>
                  <th>Ad</th>
                  <th>Kare</th>
                  <th>Son analiz</th>
                  <th>Ort. süre</th>
                  <th>Sağlık</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((cam) => {
                  const h = healthById[cam.id];
                  return (
                    <tr key={cam.id} className={editingId === cam.id ? "table-active" : ""}>
                      <td><span className={`status-dot ${dotClass(cam)}`} title={cam.connected ? (cam.active ? "aktif + bağlı" : "bağlı, model çalışmıyor") : "bağlantı yok"} /></td>
                      <td>
                        <div>{cam.name}</div>
                        <div className="cam-uri text-secondary small">{cam.uri || "—"}</div>
                      </td>
                      <td>{h ? h.framesProcessed : "—"}</td>
                      <td>{h ? `${msText(h.lastAnalysisAgeMs)} önce` : "—"}</td>
                      <td>{h ? msText(h.avgInferenceMs) : "—"}</td>
                      <td>{h ? (<><span className={`status-dot ${cameraStatusClass(h, paused)}`} /> {cameraStatusText(h, paused)}</>) : "—"}</td>
                      <td><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(cam)}>Düzenle</button></td>
                      <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(cam.id)}>Sil</button></td>
                    </tr>
                  );
                })}
                {cameras.length === 0 && (
                  <tr><td colSpan={8} className="text-secondary small">kamera yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!metrics.ok && <p className="text-secondary small mb-0 mt-1">detector'a bağlanılamıyor — sağlık sütunları boş kalır.</p>}
        </section>
      </div>
    </div>
  );
}
