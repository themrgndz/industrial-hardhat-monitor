import { useCallback, useEffect, useState } from "react";
import { deleteAllViolations, fetchViolations } from "../api/backend.js";

const LOGS_POLL_MS = 10000;

export function useViolationLog({ cameraId: initialCameraId } = {}) {
  const [page, setPage] = useState(0);
  const [size] = useState(25);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cameraId, setCameraId] = useState(initialCameraId || "");
  const [content, setContent] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  // Görünümü Temizle: sunucuya dokunmadan tabloyu boşaltır, kullanıcı filtre
  // değiştirene/Yenile'ye basana kadar otomatik yenileme de durur.
  const [paused, setPaused] = useState(false);

  const refresh = useCallback(async () => {
    if (paused) return;
    try {
      // "reddedilen" artık kalıcı siliniyor (bkz. reject akışı) — geriye yalnız
      // onaylı kayıt kaldığı için durum filtresine gerek yok, hep "confirmed".
      const data = await fetchViolations({ page, size, from, to, cameraId, status: "confirmed" });
      setContent(data.content);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.warn("violations listesi alınamadı", err);
    }
  }, [page, size, from, to, cameraId, paused]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Kullanıcı sayfa 0'da değilse otomatik yenileme satırları kaydırmasın.
      if (page === 0) refresh();
    }, LOGS_POLL_MS);
    return () => clearInterval(timer);
  }, [page, refresh]);

  function setFilter(patch) {
    setPage(0);
    setPaused(false);
    if ("from" in patch) setFrom(patch.from);
    if ("to" in patch) setTo(patch.to);
    if ("cameraId" in patch) setCameraId(patch.cameraId);
  }

  function clearView() {
    setPaused(true);
    setContent([]);
    setTotalPages(0);
  }

  function resume() {
    setPaused(false);
    refresh();
  }

  async function deleteAll() {
    const { deleted } = await deleteAllViolations();
    setPaused(false);
    setContent([]);
    setTotalPages(0);
    setPage(0);
    return deleted;
  }

  return {
    page, size, from, to, cameraId, content, totalPages, paused,
    setPage, setFilter, refresh, clearView, resume, deleteAll,
    setCameraId: (id) => setFilter({ cameraId: id }),
  };
}
