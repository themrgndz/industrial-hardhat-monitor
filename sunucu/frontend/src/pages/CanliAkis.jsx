import { useState } from "react";
import BrandNavbar from "../components/BrandNavbar.jsx";
import Particles from "../components/Particles.jsx";
import Stage from "../components/Stage.jsx";
import { useLiveViolations } from "../hooks/useLiveViolations.js";
import { useCameraHub } from "../hooks/useCameraHub.js";
import "../App.css"; // .stage/.camera-grid/.tile/.live-frame/.live-nav — eski Stage'in kendi stilleri, değiştirilmedi
import "./CanliAkis.css";

/* Canlı Akış sayfası: eski tek-sayfa uygulamasındaki Stage bileşeni (kamera
   ızgarası, tıklayınca tam ekran büyüyen tekli canlı görüntü, ihlal noktası
   overlay'i, önceki/sonraki kamera okları, tam ekran/odak modu) davranış
   olarak AYNEN korunuyor — sadece Ayarlar/Giriş ile tutarlı kabuk (BrandNavbar,
   particle arka plan, cam panel) içine alındı. Kamera yönetimi (ekle/sil/
   düzenle) artık Ayarlar > Kamera Ayarları'nda; burası yalnız izleme.

   Grid/tekli görünüm geçişi BİLEREK hub.active'e değil, bu sayfaya özel
   `viewingId` state'ine bağlı: hub.activeId sunucudaki "zamanlamanın o an
   işlediği kamera" bilgisini tutar ve sayfa her mount olduğunda (veya 5 sn'lik
   pollde) sunucudan gelen eski bir seçimle dolu olabilir — bu yüzden hub.active
   kullanılsaydı sayfa bazen istemeden doğrudan tekli görünümle açılırdı.
   Burada varsayılan HER ZAMAN genel ızgara (viewingId=null); bir kutucuğa
   tıklanınca hem yerel görünüm hem de sunucudaki seçim güncellenir. */
export default function CanliAkis() {
  const hub = useCameraHub();
  const [focusMode, setFocusMode] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [bubble, setBubble] = useState(false);

  useLiveViolations({
    onChanged: () => {
      setBubble(true);
      setTimeout(() => setBubble(false), 3000);
    }
  });

  function handleSelect(id) {
    setViewingId(id);
    hub.selectCamera(id);
  }

  function handleClose() {
    setViewingId(null);
    hub.releaseCamera();
  }

  const viewing = viewingId ? hub.cameras.find((c) => c.id === viewingId) || null : null;

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
          active={viewing}
          analysis={hub.analysis}
          analysisByCamera={hub.analysisByCamera}
          minConfidence={hub.minConfidence}
          onSelect={handleSelect}
          onClose={handleClose}
          onFullscreen={() => setFocusMode((v) => !v)}
        />
      </div>

      {/* İhlal Bildirim Baloncuğu */}
      {bubble && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          backgroundColor: "#dc3545",
          color: "white",
          padding: "12px 20px",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          zIndex: 9999,
          animation: "popIn 0.3s ease-out forwards",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontWeight: "500"
        }}>
          <span style={{ fontSize: "1.2rem" }}>⚠️</span>
          Yeni İhlal Tespit Edildi!
        </div>
      )}
    </div>
  );
}
