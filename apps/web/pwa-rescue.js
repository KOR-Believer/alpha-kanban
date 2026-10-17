/* Always publish at /sw.js. Recovery has no fetch handler or imported app code. */
const mode = "__RESCUE_MODE__";
const prefix = "alpha-kanban-app-v1-";
const appClients = async () => (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
  .filter((client) => new URL(client.url).origin === self.location.origin && /^\/(?:index\.html|intro|all|w\/[^/]+)?\/?$/.test(new URL(client.url).pathname));

async function finishRetirement() {
  try {
    const response = await fetch("/release.json", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const release = await response.json();
    if (!response.ok || release.app !== "alpha-kanban" || release.mode !== "retired" || release.protocol !== 1) return;
    await self.navigator.locks.request("alpha-kanban:pwa-session-v1", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await self.navigator.locks.request("alpha-kanban:pwa-assets-v1", { ifAvailable: true }, async (assets) => {
        if (!assets || self.registration.installing || self.registration.waiting) return;
        for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
        await self.registration.unregister();
      });
    });
  } catch { /* Offline or busy: retain registration and the last complete app. */ }
}

let fallback;
async function completeOfflineCache() {
  for (const name of (await caches.keys()).reverse()) {
    if (!name.startsWith(prefix)) continue;
    const cache = await caches.open(name);
    const marker = await cache.match("/offline-ready.json");
    if (!marker) continue;
    const { keys } = await marker.json();
    if (Array.isArray(keys) && keys.length && (await Promise.all(keys.map((key) => cache.match(key)))).every(Boolean)) return cache;
  }
}

if (mode === "retired") {
  self.addEventListener("activate", (event) => event.waitUntil(finishRetirement()));
  // A tombstone downloaded online may activate after going offline. Delay retirement
  // instead of stranding the user; this fallback disappears on verified online retirement.
  self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    const navigation = event.request.mode === "navigate" && /^\/(?:index\.html|intro|all|w\/[^/]+)?\/?$/.test(url.pathname);
    if (!navigation && !/^\/(assets|icons|fonts|downloads)\//.test(url.pathname)) return;
    if (navigation) event.waitUntil(finishRetirement());
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch (error) {
        fallback ??= completeOfflineCache();
        const cache = await fallback;
        const response = await cache?.match(navigation ? "/index.html" : event.request, { ignoreSearch: true });
        if (response) return response;
        throw error;
      }
    })());
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.protocol !== 1 || !event.source || !("url" in event.source) || new URL(event.source.url).origin !== self.location.origin) return;
  const reply = (value) => event.ports[0]?.postMessage(value);
  if (event.data.type === "AK_INFO") reply({ protocol: 1, mode, ready: false, buildId: mode });
  if (event.data.type === "AK_CLIENTS") event.waitUntil(appClients().then((clients) => reply({ count: clients.length })));
  if (event.data.type === "AK_APPLY") event.waitUntil((async () => {
    // A broken app need not respond: the operator can ask the user to close its windows.
    if ((await appClients()).length) { reply({ ok: false, reason: "busy" }); return; }
    await self.skipWaiting();
    reply({ ok: true });
  })());
});
