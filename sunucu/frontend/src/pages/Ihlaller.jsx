import { useState } from "react";
import BrandNavbar from "../components/BrandNavbar.jsx";
import Particles from "../components/Particles.jsx";
import ViolationLog from "../components/ViolationLog.jsx";
import EvidenceModal from "../components/EvidenceModal.jsx";
import { useCameraHub } from "../hooks/useCameraHub.js";
import { useViolationLog } from "../hooks/useViolationLog.js";
import { useLiveViolations } from "../hooks/useLiveViolations.js";
import ViolationsPanel from "../components/ViolationsPanel.jsx";
import { reviewViolation } from "../api/backend.js";
import "./Ihlaller.css";

export default function Ihlaller() {
  const hub = useCameraHub();
  const log = useViolationLog();
  const live = useLiveViolations({ onChanged: () => log.refresh() });
  const [evidenceList, setEvidenceList] = useState(null);
  const [evidenceIndex, setEvidenceIndex] = useState(0);

  function handleOpenEvidence(list, index) {
    setEvidenceList(list);
    setEvidenceIndex(index);
  }

  function handleCloseEvidence() {
    setEvidenceList(null);
  }

  function handleAdvance() {
    if (evidenceList && evidenceIndex < evidenceList.length - 1) {
      setEvidenceIndex(evidenceIndex + 1);
    } else {
      handleCloseEvidence();
    }
  }

  async function handleReview(id, status) {
    try {
      await reviewViolation(id, status);
      log.refresh();
      // If we reviewed from the modal and it was a live one, remove it from live
      live.review(id, status);
    } catch (err) {
      console.error("İhlal durumu güncellenemedi:", err);
      alert("İhlal güncellenemedi.");
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Seçili filtrelere uyan tüm kayıtlar kalıcı olarak silinecek. Onaylıyor musunuz?")) {
      return;
    }
    try {
      const deleted = await log.deleteAll();
      alert(`${deleted} adet kayıt silindi.`);
    } catch (err) {
      console.error("Kayıtlar silinemedi:", err);
      alert("Kayıtlar silinemedi.");
    }
  }

  const evidence = evidenceList ? evidenceList[evidenceIndex] : null;

  return (
    <div className="ihlaller">
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <Particles
          particleColors={["#ffffff"]}
          particleCount={580}
          particleSpread={4}
          speed={0.035}
          particleBaseSize={100}
          sizeRandomness={0.25}
          cameraDistance={12}
          moveParticlesOnHover={false}
          particleHoverFactor={0}
          alphaParticles
          disableRotation={false}
        />
      </div>
      <BrandNavbar />
      <div className="ihlaller__shell glass-panel">
        <div className="container-fluid px-0 h-100" style={{ maxWidth: 1600 }}>
          <div className="row h-100 g-3">
            {/* Sol Taraf: Onay Bekleyen Canlı İhlaller */}
            <div className="col-12 col-xl-3 d-flex flex-column h-100">
              <div className="flex-grow-1 position-relative">
                 {/* ViolationsPanel kendi içinde absolute/aside mantığında olabilir,
                     ama burada normal bir div gibi davranmasını sağlayabiliriz veya doğrudan
                     çağırabiliriz. Panel 'open' prop'u ile çalışıyor. */}
                 <div className="h-100 overflow-hidden rounded glass-panel-inner p-0 d-flex flex-column" style={{ background: "rgba(0,0,0,0.2)" }}>
                   <ViolationsPanel 
                     open={true} 
                     rows={live.rows} 
                     lastHour={null} 
                     cameraById={(id) => hub.cameras.find((c) => c.id === id)}
                     onReview={live.review}
                     onOpenEvidence={handleOpenEvidence}
                   />
                 </div>
              </div>
            </div>
            
            {/* Sağ Taraf: Ana Onaylı İhlaller Tablosu */}
            <div className="col-12 col-xl-9">
              <ViolationLog
                log={log}
                cameras={hub.cameras}
                cameraById={(id) => hub.cameras.find((c) => c.id === id)}
                onOpenEvidence={handleOpenEvidence}
                onDeleteAll={handleDeleteAll}
              />
            </div>
          </div>
        </div>
      </div>
      <EvidenceModal
        evidence={evidence}
        onClose={handleCloseEvidence}
        onReview={handleReview}
        onAdvance={handleAdvance}
      />
    </div>
  );
}
