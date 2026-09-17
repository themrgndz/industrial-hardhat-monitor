import { useEffect, useState } from "react";

// Grup boyutu kontrolündeki desenle aynı: seçim hemen uygulanmaz, kullanıcı
// "Uygula"ya basınca istek atılır (yanlışlıkla model değişip birkaç
// saniyeliğine çıkarımın durmasını önlemek için).
export default function ModelSelectControl({ files, current, busy, onApply }) {
  const [selected, setSelected] = useState(current || "");
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected((prev) => (files.some((f) => f.name === prev) ? prev : current || ""));
  }, [files, current]);

  const dirty = selected && selected !== current;

  async function apply() {
    if (!dirty) return;
    setError("");
    try {
      await onApply(selected);
    } catch (err) {
      setError(err.message || "model değiştirilemedi");
    }
  }

  return (
    <div className="d-flex flex-column gap-1">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <select
          className="form-select" style={{ width: "auto", minWidth: 260 }}
          value={selected} disabled={busy || files.length === 0}
          onChange={(e) => setSelected(e.target.value)}
        >
          {files.length === 0 && <option value="">ağırlık bulunamadı</option>}
          {files.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}{f.sizeMb != null ? ` (${f.sizeMb} MB)` : ""}{f.name === current ? " — aktif" : ""}
            </option>
          ))}
        </select>
        <button
          type="button" className="btn btn-outline-secondary" onClick={apply}
          disabled={busy || !dirty} title="Modeli durdurup seçilen ağırlıkla yeniden başlatır"
        >
          {busy ? "Uygulanıyor…" : "Uygula"}
        </button>
      </div>
      {error && <span className="text-danger small">{error}</span>}
    </div>
  );
}
