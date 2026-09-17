import { Link } from "react-router-dom";
import BrandNavbar from "../components/BrandNavbar.jsx";
import Particles from "../components/Particles.jsx";
import { usePageTransition } from "../context/PageTransition.jsx";
import "./Giris.css";

const BOLUMLER = [
  { to: "/ayarlar", className: "giris__panel--ayarlar", icon: "⚙", baslik: "Ayarlar", alt: "Sistem & kamera yapılandırması" },
  { to: "/canli-akis", className: "giris__panel--canli", icon: "◉", baslik: "Canlı Akış", alt: "Anlık kamera izleme" },
  { to: "/ihlaller", className: "giris__panel--ihlaller", icon: "⚠", baslik: "İhlaller", alt: "Kayıt & kanıt geçmişi" },
];

/* Giriş sayfası: içerik taşımaz, sadece diğer 3 sayfaya (Ayarlar, Canlı Akış,
   İhlaller) giden tam ekran, diyagonal 3 parçalı bir yönlendirme ekranı.
   Varsayılan olarak her parça (görsel + başlık) net/okunabilir; fareyle
   üzerine gelindiğinde diğer ikisi bulanıklaşır, üzerine gelinen daima net
   kalır ve hafifçe yakınlaşır. */
export default function Giris() {
  const goTo = usePageTransition();
  return (
    <div className="giris">
      <div style={{ position: "fixed", inset: 0, zIndex: 10, pointerEvents: "none" }}>
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

      <nav className="giris__shell" aria-label="Sayfa seçimi">
        {BOLUMLER.map((b) => (
          <Link key={b.to} to={b.to} className={`giris__panel ${b.className}`} onClick={(e) => { e.preventDefault(); goTo(b.to); }}>
            <div className="giris__bg" />
            <div className="giris__overlay" />
            <div className="giris__label">
              <span className="giris__icon">{b.icon}</span>
              {b.baslik}
              <small>{b.alt}</small>
            </div>
          </Link>
        ))}

        <svg className="giris__dividers" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="41.3" y1="0" x2="25.3" y2="100" />
          <line x1="74.6" y1="0" x2="58.6" y2="100" />
        </svg>
      </nav>
    </div>
  );
}
