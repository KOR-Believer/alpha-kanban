/// <reference lib="webworker" />
import { PrecacheController, PrecacheRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { ASSET_LOCK, CACHE_PREFIX, PWA_PROTOCOL, SESSION_LOCK, requestWorker } from "./protocol";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null; integrity?: string }> };
const buildId = __APP_RELEASE__.buildId;
const cacheName = CACHE_PREFIX + buildId;
const precache = new PrecacheController({ cacheName });
precache.addToCacheList(self.__WB_MANIFEST);
const precacheRoute = new PrecacheRoute(precache);
registerRoute((options) => !options.url.searchParams.has("ak-repair") && precacheRoute.match(options), precacheRoute.handler);
registerRoute(new NavigationRoute(precache.createHandlerBoundToURL("/index.html"), {
  allowlist: [/^\/(?:intro|all)?\/?(?:\?.*)?$/, /^\/w\/[^/.?]+\/?(?:\?.*)?$/],
}));

const windows = async () => (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
  .filter((client) => new URL(client.url).origin === self.location.origin && /^\/(?:index\.html|intro|all|w\/[^/]+)?\/?$/.test(new URL(client.url).pathname));
let transaction: string | undefined;
let prepared: WindowClient[] = [];
let releaseTransition: (() => void) | undefined;

self.addEventListener("install", (event) => event.waitUntil(self.navigator.locks.request(ASSET_LOCK, { mode: "shared" }, () => precache.install(event))));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await precache.activate(event);
    // No unconditional claim/reload. Only clients that agreed to this transaction reload.
    for (const client of prepared) client.postMessage({ type: "AK_COMMIT", protocol: PWA_PROTOCOL, transaction });
    releaseTransition?.();
  })());
});

async function ready() {
  const cache = await caches.open(cacheName);
  for (const key of precache.getURLsToCacheKeys().values()) if (!await cache.match(key)) return false;
  return true;
}

async function apply() {
  if (transaction || !self.registration.waiting) return { ok: false, reason: "busy" };
  transaction = crypto.randomUUID();
  prepared = await windows();
  try {
    await Promise.all(prepared.map(async (client) => {
      const reply = await requestWorker<{ ok: boolean; protocol: number }>(client, "AK_PREPARE", { transaction }, 3000);
      if (!reply.ok || reply.protocol !== PWA_PROTOCOL) throw new Error("busy");
    }));
    if (!await ready()) throw new Error("incomplete");
    let decide!: (acquired: boolean) => void;
    const decision = new Promise<boolean>((resolve) => { decide = resolve; });
    const released = new Promise<void>((resolve) => { releaseTransition = resolve; });
    // An unresponsive, old or newly opened tab still holds a shared lease: fail closed.
    const lock = self.navigator.locks.request(SESSION_LOCK, { mode: "exclusive", ifAvailable: true }, async (lease) => {
      if (!lease) { decide(false); return; }
      const clients = await windows();
      if (clients.some((client) => !prepared.some((item) => item.id === client.id))) throw new Error("busy");
      await self.skipWaiting();
      decide(true);
      await released;
    });
    void lock.catch(() => { decide(false); cancel(); });
    if (!await decision) throw new Error("busy");
    return { ok: true };
  } catch (error) {
    cancel();
    return { ok: false, reason: error instanceof Error ? error.message : "busy" };
  }
}

function cancel() {
  releaseTransition?.();
  for (const client of prepared) client.postMessage({ type: "AK_RESUME", protocol: PWA_PROTOCOL, transaction });
  prepared = []; transaction = undefined;
}

async function collectOldAssets() {
  return self.navigator.locks.request(SESSION_LOCK, { mode: "shared", ifAvailable: true }, async (session) => {
    if (!session) return;
    return self.navigator.locks.request(ASSET_LOCK, { mode: "exclusive", ifAvailable: true }, async (assets) => {
      if (!assets) return;
      for (const client of await windows()) {
        try {
          const reply = await requestWorker<{ buildId: string }>(client, "AK_VERSION", {}, 1000);
          if (reply.buildId !== buildId) return;
        } catch { return; }
      }
      // Keep a prepared update too. A newly waiting worker may share this origin's caches.
      if (self.registration.waiting || self.registration.installing) return;
      for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== cacheName) await caches.delete(name);
    });
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.protocol !== PWA_PROTOCOL || !event.source || !("url" in event.source) || new URL(event.source.url).origin !== self.location.origin) return;
  const reply = (value: unknown) => event.ports[0]?.postMessage(value);
  if (event.data.type === "AK_INFO") event.waitUntil(ready().then((isReady) => reply({ protocol: PWA_PROTOCOL, buildId, ready: isReady, mode: "app", release: __APP_RELEASE__ })));
  if (event.data.type === "AK_CLIENTS") event.waitUntil(windows().then((clients) => reply({ count: clients.length })));
  if (event.data.type === "AK_APPLY") event.waitUntil(apply().then(reply));
  if (event.data.type === "AK_COLLECT") event.waitUntil(collectOldAssets().then(() => reply({ ok: true })));
});
