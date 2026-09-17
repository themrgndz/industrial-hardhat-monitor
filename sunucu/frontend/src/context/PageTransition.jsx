import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PageTransition.css";

const TransitionContext = createContext(null);

/* Karartma (fade-to-black) süresi; gidiş ve dönüş için ayrı ayrı uygulanır
   (toplam geçiş ~2x bu süre). "Hızlıca" istendiği için kısa tutuluyor. */
const FADE_MS = 220;

/* Tüm route değişimlerinin geçtiği tek nokta: tıklanan panelde hemen
   navigate etmek yerine önce ekranı siyaha karartır, karanlıktayken route
   değişir, sonra yeni sayfa karanlıktan aydınlığa açılır. Overlay <Routes>
   dışında, App seviyesinde yaşadığı için route değişse de sökülüp
   yeniden kurulmaz — geçiş kesintisiz kalır. */
export function PageTransitionProvider({ children }) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const timeoutRef = useRef(null);
  const goTo = useCallback((to) => {
    clearTimeout(timeoutRef.current);
    setDark(true);
    timeoutRef.current = setTimeout(() => {
      navigate(to);
      // Yeni rota bir kare boyansın, sonra karanlıktan aç.
      requestAnimationFrame(() => requestAnimationFrame(() => setDark(false)));
    }, FADE_MS);
  }, [navigate]);

  return (
    <TransitionContext.Provider value={goTo}>
      {children}
      <div className={`page-fade${dark ? " page-fade--dark" : ""}`} aria-hidden="true" />
    </TransitionContext.Provider>
  );
}

export function usePageTransition() {
  const goTo = useContext(TransitionContext);
  if (!goTo) throw new Error("usePageTransition, PageTransitionProvider içinde kullanılmalı");
  return goTo;
}
