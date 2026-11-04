import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { describe, expect, it, vi } from "vitest";

type Channel = "stable" | "canary";
const release = (channel: Channel) => ({ app: "alpha-kanban", protocol: 1, mode: "app", channel, buildId: "a".repeat(16), storageSchema: 1, skillBundle: "1234567890ab", skillVersion: null, documentFormat: null, notes: { ko: [], en: [] } });
const compiled = new Map<Channel, Promise<string>>();
function workerSource(channel: Channel) {
  if (!compiled.has(channel)) compiled.set(channel, build({
    entryPoints: [fileURLToPath(new URL("./sw.ts", import.meta.url))], bundle: true, write: false, format: "iife",
    define: { __APP_RELEASE__: JSON.stringify(release(channel)) },
    plugins: [{ name: "workbox-fixture", setup(builder) {
      builder.onResolve({ filter: /^workbox-/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        export class PrecacheController { addToCacheList() {} getURLsToCacheKeys() { return new Map(); } createHandlerBoundToURL() { return () => {}; } install() {} activate() {} }
        export class PrecacheRoute { match() {} handler() {} }
        export class NavigationRoute {}
        export function registerRoute() {}
      ` }));
    } }],
  }).then((result) => result.outputFiles![0]!.text));
  return compiled.get(channel)!;
}
function harness(source: string, remoteChannel?: string, origin = "https://app.test") {
  const handlers = new Map<string, (event: any) => void>();
  const skipWaiting = vi.fn(async () => {}), remove = vi.fn(), unregister = vi.fn();
  const cache = { match: vi.fn(async () => undefined) };
  const self = {
    __WB_MANIFEST: [], location: { origin },
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
    registration: { waiting: {}, installing: null, unregister }, skipWaiting,
    clients: { matchAll: async () => [] },
    navigator: { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) } },
  };
  runInNewContext(source, { self, URL, crypto, setTimeout, clearTimeout, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ app: "alpha-kanban", protocol: 1, mode: "retired", channel: remoteChannel }) }),
    caches: { open: async () => cache, keys: async () => ["alpha-kanban-app-v1-old", "other-app"], delete: remove },
  });
  async function dispatch(type: string, data?: unknown) {
    let work: Promise<unknown> | undefined;
    const reply = vi.fn();
    handlers.get(type)!({ data, source: { url: origin + "/" }, ports: [{ postMessage: reply }], waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
    return reply.mock.calls[0]?.[0];
  }
  return { dispatch, skipWaiting, remove, unregister, self };
}

describe("worker-side channel enforcement", () => {
  for (const channel of ["stable", "canary"] as const) {
    it(`${channel} worker reports its compiled channel and refuses cross-channel activation`, async () => {
      const h = harness(await workerSource(channel));
      expect(await h.dispatch("message", { type: "AK_INFO", protocol: 1 })).toMatchObject({ channel, release: release(channel) });
      expect(await h.dispatch("message", { type: "AK_APPLY", protocol: 1, channel: channel === "stable" ? "canary" : "stable" })).toMatchObject({ ok: false });
      expect(h.skipWaiting).not.toHaveBeenCalled();
      expect(await h.dispatch("message", { type: "AK_APPLY", protocol: 1, channel })).toMatchObject({ ok: true });
      expect(h.skipWaiting).toHaveBeenCalledOnce();
      await h.dispatch("activate");
    });
    it(`${channel} applies legacy messages only for stable`, async () => {
      const h = harness(await workerSource(channel));
      expect(await h.dispatch("message", { type: "AK_APPLY", protocol: 1 })).toMatchObject({ ok: channel === "stable" });
      if (channel === "stable") await h.dispatch("activate");
      else expect(h.skipWaiting).not.toHaveBeenCalled();
    });
    it(`${channel} rejects installation on the other channel's canonical origin`, async () => {
      const origin = channel === "stable" ? "https://kanban-canary.giveit2.me" : "https://kanban.giveit2.me";
      const h = harness(await workerSource(channel), undefined, origin);
      await expect(h.dispatch("install")).rejects.toThrow(/channel/);
    });
  }
});

describe("standalone rescue channel enforcement", () => {
  function source(mode: string, channel: Channel) {
    return readFileSync(new URL("../../pwa-rescue.js", import.meta.url), "utf8")
      .replace('"__RESCUE_MODE__"', JSON.stringify(mode))
      .replace('"__RELEASE_CHANNEL__"', JSON.stringify(channel))
      .replace('"__OTHER_CHANNEL_ORIGINS__"', JSON.stringify([channel === "stable" ? "https://kanban-canary.giveit2.me" : "https://kanban.giveit2.me"]))
      .replace('"__RESCUE_BUILD_ID__"', JSON.stringify("a".repeat(16)));
  }
  for (const channel of ["stable", "canary"] as const) {
    it(`${channel} recovery reports channel/build and checks activation messages`, async () => {
      const h = harness(source("recovery", channel));
      expect(await h.dispatch("message", { type: "AK_INFO", protocol: 1 })).toMatchObject({ channel, mode: "recovery", buildId: "a".repeat(16) });
      expect(await h.dispatch("message", { type: "AK_APPLY", protocol: 1, channel: channel === "stable" ? "canary" : "stable" })).toMatchObject({ ok: false });
      expect(h.skipWaiting).not.toHaveBeenCalled();
      expect(await h.dispatch("message", { type: "AK_APPLY", protocol: 1, channel })).toMatchObject({ ok: true });
    });
    it(`${channel} rescue cannot install on the other public origin`, async () => {
      const other = channel === "stable" ? "https://kanban-canary.giveit2.me" : "https://kanban.giveit2.me";
      await expect(harness(source("recovery", channel), undefined, other).dispatch("install")).rejects.toThrow(/channel/);
    });
    for (const remote of ["stable", "canary", undefined]) it(`${channel} retirement against ${remote ?? "legacy"} metadata`, async () => {
      const h = harness(source("retired", channel), remote);
      h.self.registration.waiting = null as any;
      await h.dispatch("activate");
      if ((remote ?? "stable") === channel) {
        expect(h.remove).toHaveBeenCalledExactlyOnceWith("alpha-kanban-app-v1-old");
        expect(h.unregister).toHaveBeenCalledOnce();
      } else { expect(h.remove).not.toHaveBeenCalled(); expect(h.unregister).not.toHaveBeenCalled(); }
    });
  }
});
