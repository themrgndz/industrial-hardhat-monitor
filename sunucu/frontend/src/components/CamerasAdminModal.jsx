import { useEffect, useRef, useState } from "react";
import { addCamera, deleteCamera, testCamera, updateCamera } from "../api/detector.js";

const EMPTY_FORM = { id: "", name: "", uri: "", previewUri: "" };

// Sahadaki kameraların tamamı aynı DVR/NVR paterninde: sadece IP'nin son
// okteti değişiyor, geri kalan (kullanıcı/şifre/port/kanal) sabit. Ekleme
// formu varsayılan olarak yalnızca bu değişen kısmı ister; id/URI otomatik
// kurulur. Farklı bir kaynak (örn. farklı DVR paterni) gerekirse "Farklı
// kaynak / URI'yi elle gir" ile tüm alanlar elle girilebilir.
// GÜVENLİK: gerçek NVR kullanıcı/şifresini/IP alt ağını BURAYA yazıp commit
// ETMEYİN — bu dosya tarayıcıya gönderilen public JS paketine gömülür.
// Kendi dağıtımınızda yerel olarak düzenleyin, deploy notlarında saklayın.
const CAMERA_URI_PATTERN = (octet) =>
  `rtsp://admin:CHANGE_ME@192.168.0.${octet}:554/cam/realmonitor?channel=1&subtype=0`;

export default function CamerasAdminModal({ open, cameras, onClose, onCamerasChanged }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [ipSuffix, setIpSuffix] = useState("");
  const [advanced, setAdvanced] = useState(false); // false = sadece IP son okteti ile ekleme
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
    setIpSuffix("");
    setAdvanced(true); // mevcut kamerayı düzenlerken her zaman tüm alanlar görünür
    setFeedback({ msg: "", error: false });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIpSuffix("");
    setAdvanced(false);
    setFeedback({ msg: "", error: false });
  }

  async function handleSubmit() {
    let payload;
    if (!editingId && !advanced) {
      // Basit mod: sadece IP'nin son okteti (değişen kısım) girilir, geri
      // kalan sabit paterne göre otomatik kurulur.
      const octet = ipSuffix.trim();
      if (!/^\d{1,3}$/.test(octet)) {
        setFeedback({ msg: "IP son okteti 1-3 haneli sayı olmalı (örn. 188).", error: true });
        return;
      }
      payload = {
        id: `cam${octet}`,
        name: form.name.trim() || `Kamera ${octet}`,
        uri: CAMERA_URI_PATTERN(octet),
        previewUri: "",
      };
    } else {
      if (!form.id.trim() || !form.name.trim() || !form.uri.trim()) {
        setFeedback({ msg: "id, ad ve URI zorunlu.", error: true });
        return;
      }
      payload = form;
    }
    setBusy(true);
    setFeedback({ msg: editingId ? "kaydediliyor…" : "ekleniyor…", error: false });
    try {
      const data = editingId ? await updateCamera(editingId, payload) : await addCamera(payload);
      setForm(EMPTY_FORM);
      setIpSuffix("");
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

  const showFull = advanced || Boolean(editingId);

  return (
    <dialog id="cameras-dialog" ref={dialogRef} onClose={onClose}>
      <div className="evidence-head">
        <strong>Kameralar</strong>
        <span className="spacer" />
        <button type="button" onClick={onClose}>Kapat</button>
      </div>
      <table>
        <thead><tr><th>Ad</th><th>URI</th><th></th><th></th><th></th></tr></thead>
        <tbody>
          {cameras.map((cam) => (
            <tr key={cam.id} className={editingId === cam.id ? "editing" : ""}>
              <td>{cam.name}</td>
              <td className="cam-uri">{cam.uri || "—"}</td>
              <td><button type="button" disabled={testing === cam.id} onClick={() => handleTest(cam.id)}>{testing === cam.id ? "deneniyor…" : "Test"}</button></td>
              <td><button type="button" onClick={() => startEdit(cam)}>Düzenle</button></td>
              <td><button type="button" onClick={() => handleDelete(cam.id)}>Sil</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cam-form">
        {!editingId && (
          <label className="cam-form-toggle">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            Farklı kaynak / URI'yi elle gir
          </label>
        )}
        {showFull ? (
          <>
            <label>Id <input type="text" placeholder="cam-4" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></label>
            <label>Ad <input type="text" placeholder="Kamera 4" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>URI <input type="text" placeholder="rtsp://..." value={form.uri} onChange={(e) => setForm({ ...form, uri: e.target.value })} /></label>
            <label>Önizleme URI <input type="text" placeholder="(opsiyonel)" value={form.previewUri} onChange={(e) => setForm({ ...form, previewUri: e.target.value })} /></label>
          </>
        ) : (
          <>
            <label>
              IP son okteti
              <input type="text" placeholder="188" value={ipSuffix} onChange={(e) => setIpSuffix(e.target.value)} />
            </label>
            <label>
              Ad (opsiyonel)
              <input
                type="text"
                placeholder={`Kamera ${ipSuffix.trim() || "…"}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <p className="muted">URI: {CAMERA_URI_PATTERN(ipSuffix.trim() || "…")}</p>
          </>
        )}
        <button type="button" disabled={busy} onClick={handleSubmit}>{editingId ? "Kaydet" : "Ekle"}</button>
        {editingId && <button type="button" onClick={cancelEdit}>İptal</button>}
      </div>
      <p className={`muted ${feedback.error ? "error" : ""}`}>{feedback.msg}</p>
    </dialog>
  );
}
