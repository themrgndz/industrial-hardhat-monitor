import { useState } from "react";
import BrandNavbar from "../components/BrandNavbar.jsx";
import Particles from "../components/Particles.jsx";
import Stage from "../components/Stage.jsx";
import { useCameraHub } from "../hooks/useCameraHub.js";
import "../App.css"; // .stage/.camera-grid/.tile/.live-frame/.live-nav — eski Stage'in kendi stilleri, değiştirilmedi
import "./CanliAkis.css";

/* Canlı Akış sayfası: eski tek-sayfa uygulamasındaki Stage bileşeni (kamera
   ızgarası, tıklayınca tam ekran büyüyen tekli canlı görüntü, ihlal noktası
   overlay'i, önceki/sonraki kamera okları, tam ekran/odak modu) davranış
   olarak AYNEN korunuyor — sadece Ayarlar/Giriş ile tutarlı kabuk (BrandNavbar,
   particle arka plan, cam panel) içine alındı. Kamera yönetimi (ekle/sil/
   düzenle) artık Ayarlar > Kamera Ayarları'nda; burası yalnız izleme. */
export default function CanliAkis() {
  const hub = useCameraHub();
  const [focusMode, setFocusMode] = useState(false);

  async function handleSelect(id) {
    await hub.selectCamera(id);
  }

  async function handleClose() {
    await hub.releaseCamera();
  }

  return (
    <div className={`canli-akis ${focusMode ? "canli-akis--focus" : ""}`}>
      {!focusMode && (
        <>
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
        </>
      )}

      <div className="canli-akis__shell glass-panel">
        <Stage
          cameras={hub.cameras}
          active={hub.active}
          analysis={hub.analysis}
          analysisByCamera={hub.analysisByCamera}
          minConfidence={hub.minConfidence}
          onSelect={handleSelect}
          onClose={handleClose}
          onFullscreen={() => setFocusMode((v) => !v)}
        />
      </div>
    </div>
  );
}
