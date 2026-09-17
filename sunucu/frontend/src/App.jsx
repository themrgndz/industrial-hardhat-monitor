import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PageTransitionProvider } from "./context/PageTransition.jsx";
import Giris from "./pages/Giris.jsx";
import Ayarlar from "./pages/Ayarlar.jsx";
import CanliAkis from "./pages/CanliAkis.jsx";
import Ihlaller from "./pages/Ihlaller.jsx";

/* Uygulama artık tek ekranlık modal yapısı yerine 4 ayrı route: Giriş (yönlendirme
   ekranı), Ayarlar, Canlı Akış, İhlaller. Eski tek-sayfa gövdesi (App.css +
   src/components/*) kaldırılmadı; her sayfa kendi talimatıyla tasarlanınca oradaki
   bileşenler (Stage, MetricsPanel, ViolationLog, CamerasAdminModal...) ilgili
   sayfaya taşınacak. PageTransitionProvider useNavigate kullandığı için
   Router'ın İÇİNDE, ama Routes'un dışında sarmalıyor — böylece karartma
   overlay'i route değişiminde sökülüp yeniden kurulmuyor. */
export default function App() {
  return (
    <BrowserRouter>
      <PageTransitionProvider>
        <Routes>
          <Route path="/" element={<Giris />} />
          <Route path="/ayarlar" element={<Ayarlar />} />
          <Route path="/canli-akis" element={<CanliAkis />} />
          <Route path="/ihlaller" element={<Ihlaller />} />
        </Routes>
      </PageTransitionProvider>
    </BrowserRouter>
  );
}
