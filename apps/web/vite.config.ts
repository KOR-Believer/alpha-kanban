import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), {
    name: "font-licenses",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "fonts/OFL.txt",
        source: readFileSync(new URL("./licenses/OFL.txt", import.meta.url), "utf8"),
      });
    },
  }],
  publicDir: mode === "browser" ? "public-browser" : "public",
  define: { "import.meta.env.VITE_STORAGE_MODE": JSON.stringify(mode === "browser" ? "browser" : "server") },
  build: { outDir: mode === "browser" ? "dist-browser" : "dist" },
  resolve: {
    alias: {
      "@alpha-kanban/shared/ticketMarkdown": fileURLToPath(new URL("../../packages/shared/src/ticketMarkdown.ts", import.meta.url)),
      "@alpha-kanban/shared/documents": fileURLToPath(new URL("../../packages/shared/src/documents.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@alpha-kanban/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: mode === "browser" ? undefined : {
      "/api": {
        target: "http://127.0.0.1:5174",
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
}));
