import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  // Limita o scan de dependências ao código-fonte. Sem isso, o vite varre a
  // pasta android/ (cópia de build antigo do Capacitor) e tenta resolver deps
  // que não existem no projeto web (ex.: @emotion/is-prop-valid), poluindo o dev.
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
}));
