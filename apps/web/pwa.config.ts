import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { parseHistory, type ReleaseInfo } from "./src/pwa/releases";
import { RELEASE_CHANNELS, releaseChannel, resolveReleaseChannel } from "./release-channel.mjs";
import { brandColors } from "./brand.config";

const web = import.meta.dirname;
export const appManifest = {
  id: "/", name: "Alpha Kanban", short_name: "Alpha Kanban", lang: "ko",
  start_url: "/", scope: "/", display: "standalone" as const,
  background_color: "#ffffff", theme_color: "#ffffff",
  icons: [192, 512].map((size) => ({ src: `/icons/app-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" as const })),
};

export function releaseInfo(mode: "app" | "recovery" | "retired" = "app") {
  const channel = resolveReleaseChannel(process.env);
  const history = parseHistory(JSON.parse(readFileSync(process.env.AK_RELEASE_NOTES_FILE || resolve(web, channel.historyFile), "utf8")));
  const current = history.at(-1)!;
  const hash = createHash("sha256");
  const downloads = resolve(web, "public-browser/downloads");
  const skill = JSON.parse(readFileSync(resolve(downloads, "manifest.json"), "utf8"));
  if (skill.channel !== channel.channel || skill.canonicalOrigin !== channel.origin) throw new Error("Packaged assets belong to another channel. Run the root build to package this channel first.");
  function add(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (path === downloads && item.name.endsWith(".zip") && item.name !== skill.archive) continue;
      if (path === downloads && /^implementation-ledger-.*\.json$/.test(item.name) && item.name !== `implementation-ledger-${skill.version}.json`) continue;
      const file = resolve(path, item.name);
      if (item.isDirectory()) add(file);
      else { hash.update(file.slice(web.length)); hash.update(readFileSync(file)); }
    }
  }
  add(resolve(web, "src"));
  add(resolve(web, "public-browser"));
  add(resolve(web, "../../packages/shared/src"));
  for (const file of ["vite.config.ts", "worker.config.ts", "pwa.config.ts", "brand.config.ts", "release-channel.mjs", "pwa-rescue.js", "package.json", "../../pnpm-lock.yaml"]) hash.update(readFileSync(resolve(web, file)));
  hash.update(JSON.stringify(channel));
  hash.update(mode);
  hash.update(JSON.stringify(history));
  hash.update(process.env.AK_RELEASE_REVISION ?? "");
  return {
    app: "alpha-kanban", mode, channel: channel.channel, canonicalOrigin: channel.origin, protocol: 1, buildId: hash.digest("hex").slice(0, 16), storageSchema: 1,
    skillBundle: skill.version as string,
    skillPayload: skill.payloadSha256 as string,
    skillArchive: skill.archiveSha256 as string,
    // Semantic skill/format contracts belong to AKL-10..13, not a guessed PWA version.
    skillVersion: null, documentFormat: null,
    releaseId: current.id, history, notes: current.notes,
  };
}

export function browserPwa(release: ReleaseInfo): Plugin[] {
  const channel = RELEASE_CHANNELS[releaseChannel(release.channel)];
  const blockedOrigins = Object.values(RELEASE_CHANNELS).filter((item) => item !== channel).flatMap((item) => [item.origin, `https://${item.pagesProject}.pages.dev`]);
  const channelTemplate = (source: string) => source.replace('"__RELEASE_CHANNEL__"', JSON.stringify(channel.channel)).replace('"__OTHER_CHANNEL_ORIGINS__"', JSON.stringify(blockedOrigins));
  let outDir = resolve(web, "dist-browser");
  const assets: Plugin = {
    name: "alpha-kanban-pwa-assets", apply: "build",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify(release) });
      this.emitFile({ type: "asset", fileName: "repair.js", source: channelTemplate(readFileSync(resolve(web, "public-browser/repair.js"), "utf8")) });
      if (release.mode !== "app") this.emitFile({ type: "asset", fileName: "sw.js", source: channelTemplate(readFileSync(resolve(web, "pwa-rescue.js"), "utf8")).replace('"__RESCUE_MODE__"', JSON.stringify(release.mode)).replace('"__RESCUE_BUILD_ID__"', JSON.stringify(release.buildId)) });
    },
  };
  if (release.mode !== "app") return [assets];
  return [assets, ...VitePWA({
    strategies: "injectManifest", srcDir: "src/pwa", filename: "sw.ts",
    injectRegister: false, manifest: { ...appManifest, name: channel.name, short_name: channel.name, background_color: brandColors(channel.channel).surface, theme_color: brandColors(channel.channel).surface }, devOptions: { enabled: false },
    includeManifestIcons: false,
    injectManifest: {
      globPatterns: ["index.html", "manifest.webmanifest", "assets/**/*.{js,css,woff2}", "icons/*.png", "fonts/OFL.txt", `downloads/implementation-ledger-${release.skillBundle}.zip`, `downloads/implementation-ledger-${release.skillBundle}.json`, "downloads/manifest.json", "downloads/INSTALL.txt"],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      rollupFormat: "iife",
      manifestTransforms: [async (entries) => {
        const manifest = entries.map((entry) => ({ ...entry, integrity: "sha256-" + createHash("sha256").update(readFileSync(resolve(outDir, entry.url))).digest("base64") }));
        const offlineInventory = JSON.stringify({ channel: channel.channel, buildId: release.buildId, keys: manifest.map((entry) => {
          const key = new URL(entry.url, "https://app.invalid/");
          if (entry.revision) key.searchParams.set("__WB_REVISION__", entry.revision);
          return key.pathname + key.search;
        }) });
        writeFileSync(resolve(outDir, "offline-ready.json"), offlineInventory);
        manifest.push({ url: "offline-ready.json", revision: null, size: Buffer.byteLength(offlineInventory), integrity: "sha256-" + createHash("sha256").update(offlineInventory).digest("base64") });
        writeFileSync(resolve(outDir, "offline-assets.json"), JSON.stringify({ channel: channel.channel, buildId: release.buildId, assets: manifest }));
        return { manifest, warnings: [] };
      }],
    },
  })];
}
