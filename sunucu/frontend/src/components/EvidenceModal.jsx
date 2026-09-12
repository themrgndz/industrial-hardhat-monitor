import { useEffect, useRef, useState } from "react";
import { fmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

function clampZoom(z) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export default function EvidenceModal({ evidence, onClose, onReview, onAdvance }) {
  const dialogRef = useRef(null);
  const imgRef = useRef(null);
  const frameRef = useRef(null);
  const [box, setBox] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [showBox, setShowBox] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null); // { startX, startY, panX, panY } | null

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (evidence && !dialog.open) dialog.showModal();
    if (!evidence && dialog.open) dialog.close();
  }, [evidence]);

  // Modal açıkken arka sayfa hiç kaymasın: kullanıcı görüntüyü tekerlekle
  // yakınlaştırırken yanlışlıkla arkadaki sayfayı da kaydırıyordu. body'nin
  // kendi scroll'unu kilitlemek yetmiyor — sağ kenardaki dar boşluktan
  // "Canlı İhlaller" panelinin KENDİ iç listesi (.live-list) hâlâ tekerlekle
  // kayabiliyordu. Bu yüzden modal açıkken TÜM tekerlek olayları, hangi
  // öğenin üzerinde olursa olsun, pencere düzeyinde (yakalama aşamasında)
  // engellenir; olay yine de kabarcıklanmaya devam eder, dialog'un kendi
  // onWheel'i (zoom mantığı) normal şekilde çalışmaya devam eder.
  useEffect(() => {
    if (!evidence) return undefined;
    const blockScroll = (e) => e.preventDefault();
    window.addEventListener("wheel", blockScroll, { passive: false, capture: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("wheel", blockScroll, { capture: true });
      document.body.style.overflow = prevOverflow;
    };
  }, [evidence]);

  useEffect(() => {
    setImgError(false);
    setBox(null);
    setShowBox(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [evidence?.id]);

  function positionBox() {
    const img = imgRef.current;
    if (!evidence || !img || !img.naturalWidth || !img.clientWidth) {
      setBox(null);
      return;
    }
    const [x, y, w, h] = evidence.bbox;
    const sx = img.clientWidth / img.naturalWidth;
    const sy = img.clientHeight / img.naturalHeight;
    setBox({ left: x * sx, top: y * sy, width: w * sx, height: h * sy });
  }

  useEffect(() => {
    window.addEventListener("resize", positionBox);
    return () => window.removeEventListener("resize", positionBox);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence]);

  function applyZoomDelta(delta) {
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(e) {
    e.preventDefault();
    applyZoomDelta(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  function handlePointerDown(e) {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const { startX, startY, panX, panY } = dragRef.current;
    setPan({ x: panX + (e.clientX - startX), y: panY + (e.clientY - startY) });
  }

  function handlePointerUp(e) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <dialog
      ref={dialogRef} onClose={onClose} onWheel={handleWheel} className="modal-content panel-blur p-0"
      style={{ width: "min(96vw, 1800px)", maxWidth: "96vw" }}
    >
      {evidence && (
        <>
          <div className="modal-header border-bottom flex-nowrap gap-2">
            <div className="text-truncate" style={{ minWidth: 0, flex: "1 1 auto" }}>
              <strong>{evidence.cameraLabel}</strong>
              <span className="text-secondary small ms-2">{fmt.format(new Date(evidence.detectedAt))}</span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => { onReview(evidence.id, "CONFIRMED"); onAdvance(); }}>İhlal</button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { onReview(evidence.id, "REJECTED"); onAdvance(); }}>İhlal değil</button>
              <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Kapat" />
            </div>
          </div>
          <div className="modal-body d-flex flex-column align-items-center gap-2">
            <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowBox((v) => !v)}>
                {showBox ? "Orijinal Görüntü" : "Tespit Kutusunu Göster"}
              </button>
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn btn-outline-secondary" onClick={() => applyZoomDelta(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} title="Uzaklaştır">−</button>
                <button type="button" className="btn btn-outline-secondary" onClick={resetZoom} disabled={zoom === 1} title="Sıfırla">%{Math.round(zoom * 100)}</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => applyZoomDelta(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} title="Yakınlaştır">+</button>
              </div>
              <span className="text-secondary small">fare tekerleği ile yakınlaştır, sürükleyerek gezin</span>
            </div>

            <div
              ref={frameRef}
              className="evidence-frame rounded overflow-hidden bg-black"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{ cursor: zoom > 1 ? "grab" : "default" }}
            >
              {!imgError && (
                <div
                  className="evidence-zoom-content"
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                >
                  <img
                    ref={imgRef}
                    alt="ihlal tam kare"
                    src={evidenceImageUrl(evidence.id)}
                    onLoad={positionBox}
                    onError={() => setImgError(true)}
                    draggable={false}
                  />
                  {showBox && box && <div className="evidence-box" style={box} />}
                </div>
              )}
              {imgError && <p className="text-danger m-3">kanıt görseli bulunamadı</p>}
            </div>

            {evidence.hasCrop && (
              <div className="text-center">
                <div className="text-secondary small mb-1">Kırpılmış görüntü</div>
                <img
                  className="rounded border"
                  style={{ maxWidth: 180, maxHeight: 140, objectFit: "cover" }}
                  alt="ihlal kırpma"
                  src={evidenceCropUrl(evidence.id)}
                />
              </div>
            )}
          </div>
          <div className="modal-footer justify-content-start text-secondary small">
            güven %{Math.round(evidence.confidence * 100)} · track {evidence.trackId} · {new Date(evidence.detectedAt).toISOString()}
          </div>
        </>
      )}
    </dialog>
  );
}
