import { memo, useEffect, useRef, useState } from "react";
import { countsFor, dotClass } from "../hooks/useCameraHub.js";
import { liveUrl, snapshotUrl } from "../api/detector.js";
import MetricsPanel from "./MetricsPanel.jsx";

const VIOLATION_LABEL = "No-Helmet Head";

// Kaynak kare her kamerada 1920x1080 (bkz. Kameralar.txt) — bbox'ları yüzdeye
// çevirip kutucuğun (aynı 16:9 oranındaki) üzerine mutlak konumlandırırız.
const SOURCE_W = 1920;
const SOURCE_H = 1080;
// Bu kadar saniyeden eski analiz varsa nokta göstermeyiz (kamera donmuş/
// kopmuşsa ekranda eski, yanıltıcı noktalar asılı kalmasın).
const STALE_MS = 15000;
// Kamera ızgarası kutucuklarının kaç ms'de bir yeni kare çekeceği — sunucunun
// `server.live_fps` ayarıyla (varsayılan 10 fps) eşleşir (bkz. Tile bileşeni).
const POLL_INTERVAL_MS = 100;

// Kutucuk resmi object-fit:cover ile gösteriliyor — kutucuğun en/boy oranı
// kaynak karenin (16:9) oranından farklıysa görüntü kırpılıp ortalanır.
// Nokta konumunu düz yüzdeyle (x/SOURCE_W) hesaplamak bu kırpmayı yok
// sayıyordu, bu yüzden küçük kutucuklarda noktalar kişilerden bağımsız,
// kaymış yerlerde görünüyordu. Burada gerçek kutucuk boyutuna göre görünen
// (kırpılmış) kaynak alanını hesaplayıp noktayı ona göre ölçekliyoruz.
function TileDots({ analysis, minConfidence, tileW, tileH }) {
  if (!analysis || Date.now() - analysis.receivedAt > STALE_MS) return null;
  const dets = (analysis.detections || []).filter((d) => d.confidence >= minConfidence);
  if (dets.length === 0 || !tileW || !tileH) return null;

  const sourceAspect = SOURCE_W / SOURCE_H;
  const tileAspect = tileW / tileH;
  let visW = SOURCE_W, visH = SOURCE_H, offX = 0, offY = 0;
  if (tileAspect > sourceAspect) {
    // kutucuk kaynaktan daha geniş oranlı -> üst/alt kırpılır
    visH = SOURCE_W / tileAspect;
    offY = (SOURCE_H - visH) / 2;
  } else {
    // kutucuk kaynaktan daha dar oranlı -> sağ/sol kırpılır
    visW = SOURCE_H * tileAspect;
    offX = (SOURCE_W - visW) / 2;
  }

  return (
    <div className="tile-dots">
      {dets.map((d, i) => {
        const [x, y, w, h] = d.bbox;
        const cx = ((x + w / 2 - offX) / visW) * 100;
        const cy = ((y + h / 2 - offY) / visH) * 100;
        const bad = d.label === VIOLATION_LABEL;
        return (
          <span
            key={i}
            className={`tile-dot ${bad ? "bad" : "ok"}`}
            style={{ left: `${cx}%`, top: `${cy}%` }}
          />
        );
      })}
    </div>
  );
}

// Detector'dan saniyede birkaç kez "analysis" SSE olayı geliyor (her kamera
// için ayrı), her seferinde TÜM analysisByCamera nesnesi yeniden yaratılıyor
// (bkz. useCameraHub.js). memo olmadan bu, 8-12 kutucuğun TAMAMININ her
// olayda yeniden render edilmesine yol açıyordu — ana ekranda gözle görülür
// takılma ("5 fps gibi") buradan geliyordu. memo + özel karşılaştırıcı ile
// yalnız verisi gerçekten değişen kutucuk yeniden render edilir. onSelect
// kasıtlı olarak karşılaştırmaya dahil değil: App'teki handleSelect her
// render'da yeniden yaratılıyor ama içindeki hub.selectCamera/log.setCameraId
// çağrıları zaten kararlı state setter'lara dayanıyor, "eski" bir kapanış
// kullanmak tıklama davranışını bozmaz.
function tilePropsEqual(prev, next) {
  return (
    prev.analysis === next.analysis &&
    prev.minConfidence === next.minConfidence &&
    prev.cam.id === next.cam.id &&
    prev.cam.name === next.cam.name &&
    prev.cam.connected === next.cam.connected &&
    prev.cam.active === next.cam.active
  );
}

const Tile = memo(function Tile({ cam, onSelect, analysis, minConfidence }) {
  const btnRef = useRef(null);
  const imgRef = useRef(null);
  const [tileSize, setTileSize] = useState({ w: 0, h: 0 });
  const [requestWidth, setRequestWidth] = useState(320);

  // Kutucuk boyutu kamera sayısına/pencere genişliğine göre değişir (grid 4
  // sütun sabit, satır sayısı adapte olur) — sabit büyük genişlik (ör. 1920)
  // az kamerada gereksiz, çok kamerada (8-12) eşzamanlı büyük JPEG isteği
  // detector'ı ve tarayıcıyı zorlayıp akışı kasıtıyordu. Gerçek render
  // boyutuna (device pixel ratio dahil) göre istek atarak hem net hem hafif
  // kalır; kamera sayısı arttıkça kutucuk küçülür, istek boyutu da otomatik
  // küçülür. Aynı ölçüm, nokta overlay'inin kırpma hesabı için de kullanılır.
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const dpr = window.devicePixelRatio || 1;
    function measure() {
      const w = Math.round(btn.clientWidth * dpr);
      if (w > 0) setRequestWidth(Math.min(SOURCE_W, Math.max(160, w)));
      setTileSize({ w: btn.clientWidth, h: btn.clientHeight });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    return () => ro.disconnect();
  }, []);

  // Ana ekrandaki kutucuklar sürekli MJPEG akışı (live.mjpg) YERİNE hızlı
  // tekil-kare (snapshot.jpg) yoklaması kullanır — denendi: her kutucuk
  // kendi MJPEG bağlantısını açık tutunca tarayıcının aynı origin'e HTTP/1.1
  // eşzamanlı bağlantı sınırına (Chrome'da 6) takılıp 8 kutucuktan 2'si hiç
  // kare almadan siyah kaldı (ölçüldü).
  //
  // Sabit `setInterval` de denendi ve BOZUK çıktı: 8 kutucuk aynı 6
  // bağlantılık havuzu paylaşınca bir isteğin gerçek gidiş-dönüşü
  // `POLL_INTERVAL_MS`'den uzun sürüyor; bir sonraki tick `img.src`'yi
  // henüz yüklenmemiş isteğin ÜSTÜNE yazıp onu iptal ediyordu — hiçbir
  // istek asla `onload`'a ulaşamadığı için kutucuklar sürekli siyah kaldı
  // (ölçüldü). Çözüm: bir sonraki isteği ancak mevcut istek bitince
  // (onload/onerror) planla — böylece hiçbir istek kendinden önceki
  // tarafından iptal edilmez, hız sunucu/ağ gerçek gidiş-dönüşüne göre
  // kendiliğinden ayarlanır (art arda bağlantı sıkışması varsa otomatik
  // yavaşlar, asla tıkanıp kilitlenmez). `POLL_INTERVAL_MS`, sunucunun
  // `server.live_fps` ayarıyla (varsayılan 10 fps) eşleşecek şekilde
  // seçilen ardışık istekler arası minimum bekleme.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;
    let timer = null;
    function tick() {
      if (cancelled) return;
      img.onerror = () => {
        img.style.visibility = "hidden";
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      };
      img.onload = () => {
        img.style.visibility = "";
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      };
      img.src = snapshotUrl(cam.id, requestWidth);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      img.onerror = null;
      img.onload = null;
    };
  }, [cam.id, requestWidth]);

  return (
    <button type="button" ref={btnRef} className="tile" onClick={() => onSelect(cam.id)}>
      <img ref={imgRef} alt="önizleme" />
      <TileDots analysis={analysis} minConfidence={minConfidence} tileW={tileSize.w} tileH={tileSize.h} />
      <span className="tile-label">
        <span className={`status-dot ${dotClass(cam)}`} />
        <span>{cam.connected ? cam.name : `${cam.name} — bağlantı yok`}</span>
      </span>
    </button>
  );
}, tilePropsEqual);

function LiveCounts({ analysis, activeId, minConfidence }) {
  const relevant = analysis && analysis.cameraId === activeId;
  const counts = relevant ? countsFor(analysis.detections, minConfidence) : null;
  if (!counts || Object.keys(counts).length === 0) {
    return <span className="text-secondary small">çıkarım: {analysis ? `${analysis.inferenceMs} ms` : "—"}</span>;
  }
  return (
    <>
      {Object.entries(counts).map(([label, n]) => (
        <span key={label} className={`badge ${label === VIOLATION_LABEL ? "text-bg-danger" : "text-bg-success"}`}>
          {label} × {n}
        </span>
      ))}
    </>
  );
}

export default function Stage({
  cameras, active, analysis, analysisByCamera, minConfidence, onSelect, onClose, onFullscreen,
  metricsView, metrics, metricsOk, gpuHistory, onSetBatchSize, batchBusy,
}) {
  const liveRef = useRef(null);
  const [labelsOn, setLabelsOn] = useState(true);

  useEffect(() => {
    const img = liveRef.current;
    if (!img || !active) return;
    const key = `${active.id}:${labelsOn ? "1" : "0"}`;
    if (img.dataset.liveKey !== key) {
      img.removeAttribute("src"); // eski kameranın/moddaki MJPEG bağlantısı kapanmalı
      img.dataset.liveKey = key;
      img.src = liveUrl(active.id, labelsOn);
    }
  }, [active, labelsOn]);

  if (metricsView) {
    return (
      <section className="card stage" style={{ alignItems: "stretch", justifyContent: "flex-start", overflowY: "auto" }}>
        <h2 className="h5 mb-3">Sistem Kullanımı</h2>
        <MetricsPanel metrics={metrics} ok={metricsOk} gpuHistory={gpuHistory} onSetBatchSize={onSetBatchSize} batchBusy={batchBusy} />
      </section>
    );
  }

  if (!active) {
    const cols = 4;
    const rows = Math.min(4, Math.max(1, Math.ceil(cameras.length / cols)));
    return (
      <section className="card stage">
        <div className="camera-grid" style={{ "--grid-cols": cols, "--grid-rows": rows }}>
          {cameras.map((cam) => (
            <Tile
              key={cam.id} cam={cam} onSelect={onSelect}
              analysis={analysisByCamera?.[cam.id]} minConfidence={minConfidence}
            />
          ))}
        </div>
      </section>
    );
  }

  const activeIdx = active ? cameras.findIndex((c) => c.id === active.id) : -1;
  const prevCam = activeIdx >= 0 && cameras.length > 1
    ? cameras[(activeIdx - 1 + cameras.length) % cameras.length] : null;
  const nextCam = activeIdx >= 0 && cameras.length > 1
    ? cameras[(activeIdx + 1) % cameras.length] : null;

  return (
    <section className="card stage">
      <div className="d-flex flex-column gap-2 w-100 align-items-center">
        <div className="live-frame rounded position-relative">
          <img ref={liveRef} className="live-image" alt="canlı görüntü" />
          <button type="button" className="btn btn-sm btn-outline-light live-close" onClick={onClose} title="Kapat, tüm kameralara dön">
            ✕
          </button>
          {prevCam && (
            <button
              type="button" className="btn btn-outline-light live-nav live-nav-prev"
              onClick={() => onSelect(prevCam.id)} title={`Önceki kamera: ${prevCam.name}`}
            >
              ‹
            </button>
          )}
          {nextCam && (
            <button
              type="button" className="btn btn-outline-light live-nav live-nav-next"
              onClick={() => onSelect(nextCam.id)} title={`Sonraki kamera: ${nextCam.name}`}
            >
              ›
            </button>
          )}
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap w-100" style={{ maxWidth: 960 }}>
          <span className="fw-semibold">{active.name}</span>
          <LiveCounts analysis={analysis} activeId={active.id} minConfidence={minConfidence} />
          <span className="flex-grow-1" />
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setLabelsOn((v) => !v)}>
            {labelsOn ? "Etiketleri Gizle" : "Etiketleri Göster"}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onFullscreen}>Tam ekran</button>
        </div>
      </div>
    </section>
  );
}
