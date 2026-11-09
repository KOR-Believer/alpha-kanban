import { appActivity } from "./activity";
import { PWA_PROTOCOL, RUNNING_CHANNEL, SESSION_LOCK, assertWorkerChannel, requestWorker, type WorkerInfo } from "./protocol";
import { sameReleaseChannel } from "../../release-channel.mjs";

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
  assertWorkerChannel(info);
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
  const compatible = await matchingWorker();
  // A legacy worker may pass a new route through to the network. Reloading that
  // route then returns the same newer page forever. Keep it write-free instead,
  // but still participate in a confirmed update from another app window.
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.protocol !== PWA_PROTOCOL || !sameReleaseChannel(event.data.channel, RUNNING_CHANNEL) || !event.source || !("scriptURL" in event.source) || new URL(event.source.scriptURL).href !== location.origin + "/sw.js") return;
    const { type, transaction } = event.data;
    if (type === "AK_PREPARE") {
      const ok = !prepared && appActivity.prepare();
      if (ok) {
        prepared = transaction;
        document.body.inert = true;
        releaseLease?.(); releaseLease = undefined; acquiring = undefined;
        watchdog = setTimeout(() => { void resume().catch(() => location.reload()); }, 20_000);
      }
      event.ports[0]?.postMessage({ ok, protocol: PWA_PROTOCOL, channel: RUNNING_CHANNEL, buildId: __APP_RELEASE__.buildId });
    } else if (type === "AK_RESUME" && transaction === prepared) {
      void resume().catch(() => location.reload());
    } else if (type === "AK_COMMIT" && transaction === prepared) {
      clearTimeout(watchdog);
      location.reload();
    } else if (type === "AK_VERSION") {
      event.ports[0]?.postMessage({ protocol: PWA_PROTOCOL, channel: RUNNING_CHANNEL, buildId: __APP_RELEASE__.buildId });
    }
  });
  window.addEventListener("beforeunload", (event) => { if (appActivity.unloadRisk) event.preventDefault(); });
  // BFCache must reacquire its lifetime lease before allowing any interaction.
  window.addEventListener("pagehide", () => {
    document.body.inert = true;
    releaseLease?.(); releaseLease = undefined; acquiring = undefined;
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) void resume().catch(() => location.reload()); });
  return compatible;
}
