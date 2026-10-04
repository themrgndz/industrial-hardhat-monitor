import { Link, useLocation } from "react-router-dom";
import { usePageTransition } from "../context/PageTransition.jsx";
import "./BrandNavbar.css";

const LINKS = [
  { to: "/ayarlar", label: "Ayarlar" },
  { to: "/canli-akis", label: "Canlı Akış" },
  { to: "/ihlaller", label: "İhlaller" },
];

/* Sayfaların üstünde yüzen, olabildiğince şeffaf marka çubuğu. "UZMAR" yazısı
   artık tek başına navigasyon değil — yöneticinin uyarısı üzerine ("herkes
   logoya tıklayınca ana sayfaya döneceğini anlamaz") yanına açık metinli
   sayfa linkleri eklendi: Ayarlar/Canlı Akış/İhlaller, her sayfadan
   birbirine doğrudan geçiş. Ana ekrana dönüş hâlâ "UZMAR" yazısından —
   kasıtlı tekrar yok. Bulunulan sayfa vurgulanır. Diğer route
   değişimleriyle aynı karart/aç geçişi (usePageTransition) kullanılır. */
export default function BrandNavbar() {
  const goTo = usePageTransition();
  const location = useLocation();
  return (
    <header className="brand-navbar">
      <Link to="/" className="brand-navbar__brand" onClick={(e) => { e.preventDefault(); goTo("/"); }}>UZMAR</Link>
      <nav className="brand-navbar__nav" aria-label="Sayfa geçişi">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`brand-navbar__link${location.pathname === l.to ? " is-active" : ""}`}
            onClick={(e) => { e.preventDefault(); goTo(l.to); }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
