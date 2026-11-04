import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { browserPwa, releaseInfo } from "./pwa.config";
import { browserBrand } from "./brand.config";
import { markdownWorkerAliases, markdownWorkerPlugins } from "./worker.config";

export default defineConfig(({ command }) => {
  const pwa = command === "build";
  const pwaMode = process.env.AK_PWA_MODE ?? "app";
  if (!["app", "recovery", "retired"].includes(pwaMode)) throw new Error("Invalid AK_PWA_MODE");
  const release = releaseInfo(pwaMode as "app" | "recovery" | "retired");
  return ({
  plugins: [react(), tailwindcss(), browserBrand(release.channel), {
    name: "font-licenses",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "fonts/OFL.txt",
        source: readFileSync(new URL("./licenses/OFL.txt", import.meta.url), "utf8"),
      });
    },
  }, ...(pwa ? browserPwa(release) : [])],
  publicDir: "public-browser",
  worker: { plugins: markdownWorkerPlugins },
  define: {
    __PWA_ENABLED__: JSON.stringify(pwa && pwaMode === "app"), __APP_RELEASE__: JSON.stringify(release),
  },
  build: { outDir: "dist-browser" },
  resolve: {
    alias: {
      // Dev serves workers through the client optimizer. Use the equivalent
      // DOM-free decoder there; production changes only the worker bundle.
      ...(command === "serve" ? markdownWorkerAliases : {}),
      "@alpha-kanban/shared/documentSettings": fileURLToPath(new URL("../../packages/shared/src/documentSettings.mjs", import.meta.url)),
      "@alpha-kanban/shared/documentMigration": fileURLToPath(new URL("../../packages/shared/src/documentMigration.mjs", import.meta.url)),
      "@alpha-kanban/shared/documentReferences": fileURLToPath(new URL("../../packages/shared/src/documentReferences.mjs", import.meta.url)),
      "@alpha-kanban/shared/documentMetadata": fileURLToPath(new URL("../../packages/shared/src/documentMetadata.ts", import.meta.url)),
      "@alpha-kanban/shared/documentPresentation": fileURLToPath(new URL("../../packages/shared/src/documentPresentation.mjs", import.meta.url)),
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
    port: 5187,
  },
  preview: {
    host: "127.0.0.1",
    port: 4187,
  },
}); });
