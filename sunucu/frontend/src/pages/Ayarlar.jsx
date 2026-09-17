import { useState } from "react";
import BrandNavbar from "../components/BrandNavbar.jsx";
import Particles from "../components/Particles.jsx";
import { useCameraHub } from "../hooks/useCameraHub.js";
import { useMetrics } from "../hooks/useMetrics.js";
import KameraAyarlariTab from "./ayarlar/KameraAyarlariTab.jsx";
import GpuTakipTab from "./ayarlar/GpuTakipTab.jsx";
import ModelAyarlariTab from "./ayarlar/ModelAyarlariTab.jsx";
import "../App.css"; // status-dot, cam-uri gibi paylaşılan yardımcı sınıflar
import "./Ayarlar.css";

const TABS = [
  { key: "kamera", label: "Kamera Ayarları" },
  { key: "gpu", label: "Gpu Takip" },
  { key: "model", label: "Model Ayarları" },
];

export default function Ayarlar() {
  const [active, setActive] = useState(TABS[0].key);
  const hub = useCameraHub();
  const metrics = useMetrics();

  return (
    <div className="ayarlar">
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

      <div className="ayarlar__shell glass-panel">
        <ul className="nav nav-tabs ayarlar__tabs">
          {TABS.map((t) => (
            <li className="nav-item" key={t.key}>
              <button
                type="button"
                className={`nav-link ${active === t.key ? "active" : ""}`}
                onClick={() => setActive(t.key)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="ayarlar__content">
          {active === "kamera" && <KameraAyarlariTab hub={hub} metrics={metrics} />}
          {active === "gpu" && <GpuTakipTab metrics={metrics} />}
          {active === "model" && <ModelAyarlariTab metrics={metrics} />}
        </div>
      </div>
    </div>
  );
}
