import { useEffect, useRef, useState } from "react";
import { fmt } from "../format.js";
import { evidenceCropUrl, evidenceImageUrl } from "../api/backend.js";

export default function EvidenceModal({ evidence, onClose, onReview }) {
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
    <dialog id="evidence" ref={dialogRef} onClose={onClose}>
      {evidence && (
        <>
          <div className="evidence-head">
            <strong>{evidence.cameraLabel} — {fmt.format(new Date(evidence.detectedAt))}</strong>
            <span className="spacer" />
            <button type="button" onClick={() => { onReview(evidence.id, "CONFIRMED"); onClose(); }}>İhlal</button>
            <button type="button" onClick={() => { onReview(evidence.id, "REJECTED"); onClose(); }}>İhlal değil</button>
            <button type="button" onClick={onClose}>Kapat</button>
          </div>
          <div className="evidence-body">
            <div className="evidence-frame">
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
              {imgError && <p className="error">kanıt görseli bulunamadı</p>}
            </div>
            {evidence.hasCrop && <img className="evidence-crop" alt="ihlal kırpma" src={evidenceCropUrl(evidence.id)} />}
          </div>
          <div className="evidence-meta">
            kamera: {evidence.cameraLabel} · {new Date(evidence.detectedAt).toISOString()} · güven %{Math.round(evidence.confidence * 100)} · track {evidence.trackId}
          </div>
        </>
      )}
    </dialog>
  );
}
