import { appActivity } from "./activity";
import { PWA_PROTOCOL, SESSION_LOCK, requestWorker, type WorkerInfo } from "./protocol";

let releaseLease: (() => void) | undefined;
let prepared: string | undefined;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let acquiring: Promise<void> | undefined;

async function acquireLease() {
  acquiring ??= new Promise<void>((resolve, reject) => {
    void navigator.locks.request(SESSION_LOCK, { mode: "shared" }, () => new Promise<void>((release) => {
      releaseLease = release; resolve();
    })).catch(reject);
  });
  await acquiring;
}

async function matchingWorker(): Promise<boolean> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const worker = navigator.serviceWorker.controller ?? registration?.active;
  if (!worker) return true;
  const info = await requestWorker<WorkerInfo>(worker, "AK_INFO");
  return info.mode !== "app" || info.buildId === __APP_RELEASE__.buildId;
}

async function resume() {
  clearTimeout(watchdog);
  prepared = undefined;
  await acquireLease();
  // A suspended old tab must never resume writes against a newer active app.
  if (!await matchingWorker()) { location.reload(); return; }
  appActivity.resume();
  document.body.inert = false;
}

export async function startPwaSession() {
  await acquireLease();
  if (!await matchingWorker()) {
    // No UI or repository writes have mounted yet.
    location.reload();
    return false;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.protocol !== PWA_PROTOCOL || !event.source || !("scriptURL" in event.source) || new URL(event.source.scriptURL).pathname !== "/sw.js") return;
    const { type, transaction } = event.data;
    if (type === "AK_PREPARE") {
      const ok = !prepared && appActivity.prepare();
      if (ok) {
        prepared = transaction;
        document.body.inert = true;
        releaseLease?.(); releaseLease = undefined; acquiring = undefined;
        watchdog = setTimeout(() => { void resume().catch(() => location.reload()); }, 20_000);
      }
      event.ports[0]?.postMessage({ ok, protocol: PWA_PROTOCOL, buildId: __APP_RELEASE__.buildId });
    } else if (type === "AK_RESUME" && transaction === prepared) {
      void resume().catch(() => location.reload());
    } else if (type === "AK_COMMIT" && transaction === prepared) {
      clearTimeout(watchdog);
      location.reload();
    } else if (type === "AK_VERSION") {
      event.ports[0]?.postMessage({ protocol: PWA_PROTOCOL, buildId: __APP_RELEASE__.buildId });
    }
  });
  window.addEventListener("beforeunload", (event) => { if (appActivity.unloadRisk) event.preventDefault(); });
  // BFCache must reacquire its lifetime lease before allowing any interaction.
  window.addEventListener("pagehide", () => {
    document.body.inert = true;
    releaseLease?.(); releaseLease = undefined; acquiring = undefined;
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) void resume().catch(() => location.reload()); });
  return true;
}
