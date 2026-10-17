import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FolderKanban } from "lucide-react";
import { Resvg } from "@resvg/resvg-js";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const web = import.meta.dirname;
export const appManifest = {
  id: "/", name: "Alpha Kanban", short_name: "Alpha Kanban", lang: "ko",
  start_url: "/", scope: "/", display: "standalone" as const,
  background_color: "#ffffff", theme_color: "#ffffff",
  icons: [192, 512].map((size) => ({ src: `/icons/app-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" as const })),
};

export function releaseInfo(mode: "app" | "recovery" | "retired" = "app") {
  const hash = createHash("sha256");
  const downloads = resolve(web, "public-browser/downloads");
  const skill = JSON.parse(readFileSync(resolve(downloads, "manifest.json"), "utf8"));
  function add(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (path === downloads && item.name.endsWith(".zip") && item.name !== skill.archive) continue;
      const file = resolve(path, item.name);
      if (item.isDirectory()) add(file);
      else { hash.update(file.slice(web.length)); hash.update(readFileSync(file)); }
    }
  }
  add(resolve(web, "src"));
  add(resolve(web, "public-browser"));
  add(resolve(web, "../../packages/shared/src"));
  for (const file of ["vite.config.ts", "pwa.config.ts", "pwa-rescue.js", "package.json", "../../pnpm-lock.yaml"]) hash.update(readFileSync(resolve(web, file)));
  hash.update(mode);
  hash.update(process.env.AK_RELEASE_REVISION ?? "");
  return {
    app: "alpha-kanban", mode, protocol: 1, buildId: hash.digest("hex").slice(0, 16), storageSchema: 1,
    skillBundle: skill.version as string,
    // Semantic skill/format contracts belong to AKL-10..13, not a guessed PWA version.
    skillVersion: null, documentFormat: null,
    notes: {
      ko: ["앱 설치와 오프라인 실행", "작업을 보호하는 업데이트와 앱 복구"],
      en: ["App installation and offline access", "Updates and app repair that protect your work"],
    },
  };
}

export function browserPwa(release: ReturnType<typeof releaseInfo>): Plugin[] {
  let outDir = resolve(web, "dist-browser");
  const assets: Plugin = {
    name: "alpha-kanban-pwa-assets", apply: "build",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    transformIndexHtml() { return [{ tag: "link", attrs: { rel: "icon", href: "/icons/app-192.png", type: "image/png" }, injectTo: "head" }]; },
    generateBundle() {
      // The existing Lucide brand mark, inside the maskable icon's safe area.
      const mark = renderToStaticMarkup(createElement(FolderKanban, { x: 112, y: 112, width: 288, height: 288, color: "#171810", strokeWidth: 1.6 }));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#9ee600"/>${mark}</svg>`;
      for (const size of [192, 512]) this.emitFile({ type: "asset", fileName: `icons/app-${size}.png`, source: new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng() });
      this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify(release) });
      if (release.mode !== "app") this.emitFile({ type: "asset", fileName: "sw.js", source: readFileSync(resolve(web, "pwa-rescue.js"), "utf8").replace('"__RESCUE_MODE__"', JSON.stringify(release.mode)) });
    },
  };
  if (release.mode !== "app") return [assets];
  return [assets, ...VitePWA({
    strategies: "injectManifest", srcDir: "src/pwa", filename: "sw.ts",
    injectRegister: false, manifest: appManifest, devOptions: { enabled: false },
    includeManifestIcons: false,
    injectManifest: {
      globPatterns: ["index.html", "manifest.webmanifest", "assets/**/*.{js,css,woff2}", "icons/*.png", "fonts/OFL.txt", `downloads/implementation-ledger-${release.skillBundle}.zip`, "downloads/manifest.json", "downloads/INSTALL.txt"],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      rollupFormat: "iife",
      manifestTransforms: [async (entries) => {
        const manifest = entries.map((entry) => ({ ...entry, integrity: "sha256-" + createHash("sha256").update(readFileSync(resolve(outDir, entry.url))).digest("base64") }));
        const offlineInventory = JSON.stringify({ keys: manifest.map((entry) => {
          const key = new URL(entry.url, "https://app.invalid/");
          if (entry.revision) key.searchParams.set("__WB_REVISION__", entry.revision);
          return key.pathname + key.search;
        }) });
        writeFileSync(resolve(outDir, "offline-ready.json"), offlineInventory);
        manifest.push({ url: "offline-ready.json", revision: null, size: Buffer.byteLength(offlineInventory), integrity: "sha256-" + createHash("sha256").update(offlineInventory).digest("base64") });
        writeFileSync(resolve(outDir, "offline-assets.json"), JSON.stringify({ buildId: release.buildId, assets: manifest }));
        return { manifest, warnings: [] };
      }],
    },
  })];
}
