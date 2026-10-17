export const PWA_PROTOCOL = 1;
export const SESSION_LOCK = "alpha-kanban:pwa-session-v1";
export const ASSET_LOCK = "alpha-kanban:pwa-assets-v1";
export const CACHE_PREFIX = "alpha-kanban-app-v1-";
export const SW_PATH = "/sw.js";
export const CHECK_INTERVAL = 30 * 60_000;
export const FOCUS_INTERVAL = 5 * 60_000;
export type WorkerInfo = { protocol: number; buildId: string; ready: boolean; mode: "app" | "recovery" | "retired"; release?: typeof __APP_RELEASE__ };
export type Reply = { ok: boolean; reason?: string };

export function requestWorker<T>(target: Pick<ServiceWorker, "postMessage">, type: string, extra: Record<string, unknown> = {}, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("App connection timed out.")); }, timeout);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data as T); };
    try { target.postMessage({ type, protocol: PWA_PROTOCOL, ...extra }, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
}

export function isOwnedRegistration(registration: ServiceWorkerRegistration, origin = location.origin): boolean {
  return registration.scope === origin + "/" && [registration.active, registration.waiting, registration.installing]
    .some((worker) => worker && new URL(worker.scriptURL).href === origin + SW_PATH);
}
