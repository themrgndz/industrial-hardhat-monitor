import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build çıktısı doğrudan Spring backend'in statik klasörüne yazılır — tek jar,
// tek deploy modeli (bkz. OTURUM-NOTU.md). Eski el yazımı static/ dosyaları
// bu build tarafından üretilenlerle değiştirilir.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // Backend REST API (:8080) — detector (:8090) ayrı, mutlak URL ile çağrılıyor.
      '/api/v1': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: '../backend/src/main/resources/static',
    emptyOutDir: true,
  },
})
