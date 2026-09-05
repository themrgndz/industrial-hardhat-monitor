import { useEffect, useRef, useState } from "react";
import { addCamera, deleteCamera, testCamera, updateCamera } from "../api/detector.js";

const EMPTY_FORM = { id: "", name: "", uri: "", previewUri: "" };

export default function CamerasAdminModal({ open, cameras, onClose, onCamerasChanged }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null); // null = ekleme modu, aksi hâlde düzenlenen kameranın mevcut id'si
  const [feedback, setFeedback] = useState({ msg: "", error: false });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
      onCamerasChanged(data);
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
      onCamerasChanged(data);
    } catch (err) {
      setFeedback({ msg: err.message, error: true });
    }
  }

  async function handleTest(id) {
    setTesting(id);
    setFeedback({ msg: "", error: false });
    try {
      const data = await testCamera(id);
      setFeedback(data.ok
        ? { msg: `${id}: ${data.width}×${data.height} alındı ✓`, error: false }
        : { msg: `${id}: ${data.error || "bağlantı başarısız"}`, error: true });
    } catch (err) {
      setFeedback({ msg: `${id}: ${err.message}`, error: true });
    } finally {
      setTesting(null);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="modal-content panel-blur border-0 p-0" style={{ width: 720, maxWidth: "94vw" }}>
      <div className="modal-header">
        <strong>Kameralar</strong>
        <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Kapat" />
      </div>
      <div className="modal-body d-flex flex-column gap-3">
        <section className="card card-body">
          <h3 className="text-uppercase text-secondary small fw-semibold mb-2">{editingId ? "Kamerayı Düzenle" : "Kamera Ekle"}</h3>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small text-secondary mb-1">Id</label>
              <input type="text" className="form-control form-control-sm" placeholder="cam-4" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
            </div>
            <div className="col-md-8">
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
          <div className="d-flex align-items-center gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={handleSubmit}>{editingId ? "Kaydet" : "Ekle"}</button>
            {editingId && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={cancelEdit}>İptal</button>}
            <span className={`small ${feedback.error ? "text-danger" : "text-secondary"}`}>{feedback.msg}</span>
          </div>
        </section>

        <section className="card card-body">
          <h3 className="text-uppercase text-secondary small fw-semibold mb-2">Kayıtlı Kameralar</h3>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead><tr><th>Ad</th><th>Link</th><th></th><th></th><th></th></tr></thead>
              <tbody>
                {cameras.map((cam) => (
                  <tr key={cam.id} className={editingId === cam.id ? "table-active" : ""}>
                    <td>{cam.name}</td>
                    <td className="cam-uri">{cam.uri || "—"}</td>
                    <td><button type="button" className="btn btn-sm btn-outline-secondary" disabled={testing === cam.id} onClick={() => handleTest(cam.id)}>{testing === cam.id ? "deneniyor…" : "Test"}</button></td>
                    <td><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(cam)}>Düzenle</button></td>
                    <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(cam.id)}>Sil</button></td>
                  </tr>
                ))}
                {cameras.length === 0 && (
                  <tr><td colSpan={5} className="text-secondary small">kamera yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </dialog>
  );
}
