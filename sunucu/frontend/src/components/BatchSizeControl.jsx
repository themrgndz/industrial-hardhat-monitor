import { useEffect, useState } from "react";

// Hassasiyet slider'ının aksine CANLI uygulanmaz: kullanıcı değeri girer,
// yalnız "Onayla" butonuna basınca istek atılır — her hareket denemesi
// GPU'yu zorlamasın diye.
export default function BatchSizeControl({ value, max, busy, onCommit }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setLocal(value);
  }, [value, dirty]);

  function clamp(raw) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(max, n));
  }

  async function commit() {
    const n = clamp(local);
    setLocal(n);
    await onCommit(n);
    setDirty(false);
  }

  return (
    <li className="d-flex justify-content-between align-items-center gap-2">
      <span className="text-secondary">Grup boyutu (batch size)</span>
      <span className="input-group" style={{ width: 160 }}>
        <input
          type="number" className="form-control" min={1} max={max} value={local} disabled={busy}
          onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={commit} disabled={busy || !dirty} title="Yeni grup boyutunu uygula">
          Onayla
        </button>
      </span>
    </li>
  );
}
