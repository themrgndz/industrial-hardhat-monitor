import { useCallback, useEffect, useRef, useState } from "react";
import { connectEvents } from "../api/detector.js";
import { deleteViolation, reviewViolation as apiReview } from "../api/backend.js";

const LIVE_LIMIT = 50;
const STORAGE_KEY = "ppe.liveViolations.v1";
const DAY_CHECK_MS = 60_000;

// Yerel takvim günü (gece yarısında değişir) — kuyruğun "gün sonu" sınırı.
function todayKey() {
  return new Date().toDateString();
}

// Sayfa yenilense/başka sekmeye geçilse de kuyruk kaybolmasın diye
// localStorage'a yazılır. Sadece BUGÜNE ait kayıt geri yüklenir — gün
// değişmişse (kullanıcı ertesi gün açtıysa) kuyruk boş başlar, eski
// ihlaller ekranda birikip kalmaz. Bu sadece görünüm kuyruğu; kalıcı
// kayıt zaten backend'de (Postgres) duruyor, burada silinen bir şey yok.
function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.day !== todayKey() || !Array.isArray(parsed.rows)) return [];
    return parsed.rows.map((r) => ({ ...r, _fresh: false }));
  } catch {
    return [];
  }
}

function persist(day, rows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day, rows }));
  } catch {
    // localStorage dolu/kapalı olabilir — sessizce yut, sadece kalıcılık kaybolur
  }
}

// SSE 'violation' olaylarıyla beslenen canlı ihlal akışı. Ayrı EventSource
// açmaz — useCameraHub zaten bağlı; burada aynı akışa ikinci bir bağlantı
// açmamak için kendi EventSource'unu tutar (basitlik için, iki bağlantı da
// detector tarafında ucuz — SSE tek yönlü, ekstra kaynak taraması yok).
export function useLiveViolations({ onChanged } = {}) {
  const [rows, setRows] = useState(loadStored);
  const sourceRef = useRef(null);
  const dayRef = useRef(todayKey());

  // Sekme açık kalıp gece yarısını geçerse kuyruk otomatik boşalır.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = todayKey();
      if (current !== dayRef.current) {
        dayRef.current = current;
        setRows([]);
      }
    }, DAY_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    persist(dayRef.current, rows);
  }, [rows]);

  useEffect(() => {
    const source = connectEvents({
      violation: (v) => {
        setRows((prev) => [...prev, { ...v, _fresh: true, _key: `${v.cameraId}-${v.detectedAt}-${v.trackId}` }].slice(-LIVE_LIMIT));
        setTimeout(() => onChanged?.(), 1500);
        setTimeout(() => {
          setRows((prev) => prev.map((r) => (r._fresh ? { ...r, _fresh: false } : r)));
        }, 1200);
      },
    });
    sourceRef.current = source;
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = useCallback(async (backendId, status) => {
    if (!backendId) return;
    try {
      // "İhlal değil" artık soft REJECTED değil, kalıcı silme — kullanıcı kararı:
      // reddedilen tespitler geçmişte/eğitim verisinde kalmasın.
      if (status === "REJECTED") {
        await deleteViolation(backendId);
      } else {
        await apiReview(backendId, status);
      }
      setRows((prev) => prev.filter((r) => r.backendId !== backendId));
      onChanged?.();
    } catch (err) {
      alert(`Ayıklama hatası: ${err.message}`);
    }
  }, [onChanged]);

  const clear = useCallback(() => setRows([]), []);

  return { rows, review, clear };
}
