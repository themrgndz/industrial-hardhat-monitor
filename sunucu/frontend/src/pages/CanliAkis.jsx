import { Link } from "react-router-dom";
import BrandNavbar from "../components/BrandNavbar.jsx";
import { usePageTransition } from "../context/PageTransition.jsx";

/* Yer tutucu — tasarım/talimat henüz verilmedi. */
export default function CanliAkis() {
  const goTo = usePageTransition();
  return (
    <div className="min-vh-100 d-flex flex-column">
      <BrandNavbar />
      <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center gap-3 text-secondary">
        <h1 className="h4 text-body-emphasis m-0">Canlı Akış</h1>
        <p className="m-0">Bu sayfa henüz tasarlanmadı.</p>
        <Link to="/" className="btn btn-outline-secondary btn-sm" onClick={(e) => { e.preventDefault(); goTo("/"); }}>Girişe dön</Link>
      </div>
    </div>
  );
}
