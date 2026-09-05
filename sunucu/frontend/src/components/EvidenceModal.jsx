import { useEffect, useRef, useState } from "react";
import { fmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

export default function EvidenceModal({ evidence, onClose, onReview, onAdvance }) {
  const dialogRef = useRef(null);
  const imgRef = useRef(null);
  const [box, setBox] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (evidence && !dialog.open) dialog.showModal();
    if (!evidence && dialog.open) dialog.close();
  }, [evidence]);

  useEffect(() => {
    setImgError(false);
    setBox(null);
  }, [evidence]);

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

  return (
    <dialog ref={dialogRef} onClose={onClose} className="modal-content panel-blur p-0" style={{ width: 880, maxWidth: "94vw" }}>
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
          <div className="modal-body d-flex flex-column align-items-center gap-3">
            <div className="evidence-frame rounded overflow-hidden bg-black">
              {!imgError && (
                <img
                  ref={imgRef}
                  alt="ihlal tam kare"
                  src={evidenceImageUrl(evidence.id)}
                  onLoad={positionBox}
                  onError={() => setImgError(true)}
                />
              )}
              {box && <div className="evidence-box" style={box} />}
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
