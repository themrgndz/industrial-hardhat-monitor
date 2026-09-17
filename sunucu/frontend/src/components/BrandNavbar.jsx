import { Link } from "react-router-dom";
import { usePageTransition } from "../context/PageTransition.jsx";
import "./BrandNavbar.css";

/* Sayfaların üstünde yüzen, olabildiğince şeffaf marka çubuğu. Sadece "UZMAR"
   yazısını taşır — navigasyon/aksiyon barı değil, sayfa içeriğini gölgelemek
   için değil sadece marka kimliği için var. Tıklanınca Giriş'e döner (diğer
   route değişimleriyle aynı karart/aç geçişiyle). */
export default function BrandNavbar() {
  const goTo = usePageTransition();
  return (
    <header className="brand-navbar">
      <Link to="/" className="brand-navbar__brand" onClick={(e) => { e.preventDefault(); goTo("/"); }}>UZMAR</Link>
    </header>
  );
}
