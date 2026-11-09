import { defineConfig } from "vite";
import { resolve } from "node:path";

// Três páginas: página de vendas (raiz), app (/app/) e termos.
// base "./" permite publicar a pasta dist em qualquer alojamento estático (Netlify, Vercel, GitHub Pages).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        vendas: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
        termos: resolve(import.meta.dirname, "termos.html"),
      },
    },
  },
});
