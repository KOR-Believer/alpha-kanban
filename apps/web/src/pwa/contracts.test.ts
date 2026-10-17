import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { appManifest } from "../../pwa.config";
import { parseRelease } from "./client";
import { BROWSER_DATABASE_NAME, BROWSER_SCHEMA_VERSION } from "../browser/storage";

describe("PWA asset and data contracts", () => {
  it("keeps origin-relative, stable app identity and maskable raster icons", () => {
    expect(appManifest).toMatchObject({ id: "/", scope: "/", start_url: "/", display: "standalone" });
    expect(appManifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
    expect(new URL(appManifest.id, "https://kanban.giveit2.me").origin).not.toBe(new URL(appManifest.id, "http://127.0.0.1:4189").origin);
  });
  it("separates build metadata from skill semantics and durable schema", () => {
    expect(BROWSER_DATABASE_NAME).toBe("alpha-kanban.browser.v1");
    expect(BROWSER_SCHEMA_VERSION).toBe(1);
    const release = { app: "alpha-kanban", protocol: 1, mode: "app", buildId: "1234567890abcdef", storageSchema: 1, skillBundle: "hash", skillVersion: null, documentFormat: null, notes: { ko: [], en: [] } };
    expect(parseRelease(release)).toEqual(release);
    for (const invalid of [undefined, "<html>", { ...release, buildId: "latest" }, { ...release, notes: {} }, { ...release, protocol: 2 }]) expect(() => parseRelease(invalid)).toThrow();
  });
  it("keeps recovery independent and limits cleanup to app-owned caches", () => {
    const rescue = readFileSync(new URL("../../pwa-rescue.js", import.meta.url), "utf8");
    const repair = readFileSync(new URL("../../public-browser/repair.js", import.meta.url), "utf8");
    expect(rescue).not.toMatch(/clients\.claim|importScripts/);
    const events: string[] = [];
    runInNewContext(rescue.replace('"__RESCUE_MODE__"', '"recovery"'), { self: { addEventListener: (type: string) => events.push(type) } });
    expect(events).not.toContain("fetch");
    for (const source of [rescue, repair]) {
      expect(source).not.toMatch(/localStorage\.clear|deleteDatabase|Clear-Site-Data/);
      expect(source).toContain("alpha-kanban-app-v1-");
    }
    expect(repair).toContain("if (!navigator.onLine)");
    const headers = readFileSync(new URL("../../public-browser/_headers", import.meta.url), "utf8");
    expect(headers).toContain("connect-src 'self'");
    expect(headers).toContain("worker-src 'self'");
    for (const path of ["/sw.js", "/release.json", "/offline-assets.json", "/repair.html", "/repair.js"]) expect(headers).toContain(`${path}\n  Cache-Control: no-store`);
  });

  it("does not retire caches or registration while another worker is installing assets", async () => {
    const source = readFileSync(new URL("../../pwa-rescue.js", import.meta.url), "utf8");
    const events = new Map<string, (event: { waitUntil: (work: Promise<void>) => void }) => void>();
    const remove = vi.fn(); const unregister = vi.fn();
    runInNewContext(source.replace('"__RESCUE_MODE__"', '"retired"'), {
      self: {
        addEventListener: (type: string, handler: (event: { waitUntil: (work: Promise<void>) => void }) => void) => events.set(type, handler),
        registration: { unregister },
        navigator: { locks: { request: async (name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => callback(name.endsWith("assets-v1") ? null : {}) } },
      },
      fetch: async () => ({ ok: true, json: async () => ({ app: "alpha-kanban", mode: "retired", protocol: 1 }) }),
      AbortSignal,
      caches: { keys: async () => ["alpha-kanban-app-v1-old"], delete: remove },
    });
    let work!: Promise<void>;
    events.get("activate")!({ waitUntil: (promise) => { work = promise; } });
    await work;
    expect(remove).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
  });
});
