import { CHECK_INTERVAL, FOCUS_INTERVAL, SW_PATH, isOwnedRegistration, requestWorker, type Reply, type WorkerInfo } from "./protocol";
import { parseHistory } from "./releases";

export type Release = typeof __APP_RELEASE__;
type UpdateState = "idle" | "checking" | "downloading" | "ready" | "restart" | "current" | "offline" | "failed" | "blocked" | "applying";
export type PwaState = { status: UpdateState; offlineReady: boolean; next?: Release; prepared?: Release; persistent?: boolean; retentionDenied?: boolean };

export function parseRelease(value: unknown): Release {
  const release = value as Release | undefined;
  if (!release || release.app !== "alpha-kanban" || !["app", "recovery", "retired"].includes(release.mode) || release.protocol !== 1 || !/^[a-f0-9]{16}$/.test(release.buildId) || !Number.isInteger(release.storageSchema) || release.storageSchema < 1 || !Array.isArray(release.notes?.ko) || !Array.isArray(release.notes?.en) || ![...release.notes.ko, ...release.notes.en].every((note) => typeof note === "string")) throw new Error("Invalid release information.");
  if (release.history !== undefined || release.releaseId !== undefined) {
    const history = parseHistory(release.history);
    const current = history.find((row) => row.id === release.releaseId);
    if (!current || current !== history.at(-1) || JSON.stringify(current.notes) !== JSON.stringify(release.notes)) throw new Error("Release notes do not match the release.");
  }
  if (release.skillPayload !== undefined && !/^[a-f0-9]{64}$/.test(release.skillPayload)) throw new Error("Invalid skill bundle reference.");
  return release;
}
function workerRelease(info: WorkerInfo) {
  const release = info.release ? parseRelease(info.release) : undefined;
  if (release && (info.protocol !== 1 || release.buildId !== info.buildId || release.mode !== info.mode)) throw new Error("Worker and release do not match.");
  return release;
}

export class PwaClient {
  private state: PwaState = { status: "idle", offlineReady: false };
  private listeners = new Set<() => void>();
  private registration?: ServiceWorkerRegistration;
  private lastCheck = 0;
  private checking = false;
  private applying = false;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<PwaState>) { this.state = { ...this.state, ...next }; this.listeners.forEach((listener) => listener()); }

  async start() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const existing = await navigator.serviceWorker.getRegistration("/");
      if (existing && !isOwnedRegistration(existing)) throw new Error("Another app owns this worker scope.");
      this.registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/", updateViaCache: "none" });
      const watch = () => {
        const worker = this.registration?.installing;
        if (!worker) return;
        this.update({ status: "downloading" });
        worker.addEventListener("statechange", () => {
          if (worker.state === "redundant") this.update({ status: "failed" });
          else if (worker.state === "installed" || worker.state === "activated") void this.refresh().catch(() => this.update({ status: "failed" }));
        });
      };
      this.registration.addEventListener("updatefound", watch);
      watch();
      await this.refresh();
      void this.check();
      const automaticCheck = () => {
        if (document.visibilityState === "visible" && Date.now() - this.lastCheck >= FOCUS_INTERVAL) void this.check();
      };
      document.addEventListener("visibilitychange", automaticCheck);
      window.addEventListener("online", automaticCheck);
      window.addEventListener("focus", automaticCheck);
      window.setInterval(() => { if (document.visibilityState === "visible") void this.check(); }, CHECK_INTERVAL);
      void navigator.storage.persisted?.().then((persistent) => this.update({ persistent }));
    } catch { this.update({ status: "failed" }); }
  }

  private async refresh() {
    const active = this.registration?.active;
    if (active) {
      const info = await requestWorker<WorkerInfo>(active, "AK_INFO");
      this.update({ offlineReady: info.mode === "app" && info.ready });
      if (info.mode === "app" && info.ready) void requestWorker(active, "AK_COLLECT").catch(() => undefined);
    }
    const worker = this.registration?.waiting;
    if (worker) {
      const waiting = await requestWorker<WorkerInfo>(worker, "AK_INFO");
      if (this.registration?.waiting !== worker) return;
      const release = workerRelease(waiting);
      this.update({ status: waiting.mode !== "app" ? "restart" : waiting.ready ? "ready" : "failed", next: release, prepared: waiting.ready ? release : undefined });
    }
    else {
      this.update({ prepared: undefined });
      if (active && !this.registration?.installing && this.state.status === "downloading") this.update({ status: "idle" });
    }
  }

  async check() {
    if (this.checking || this.applying || this.state.status === "applying") return;
    if (!this.registration) { await this.start(); return; }
    this.lastCheck = Date.now();
    if (!navigator.onLine) {
      await this.refresh().catch(() => undefined);
      if (!this.registration?.waiting) this.update({ status: "offline" });
      return;
    }
    this.checking = true;
    this.update({ status: "checking" });
    try {
      const response = await fetch("/release.json", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Release is unavailable.");
      const release = parseRelease(await response.json());
      this.update({ next: release.buildId === __APP_RELEASE__.buildId ? undefined : release });
      await this.registration?.update();
      await this.refresh();
      if (!this.registration?.waiting) this.update({ status: this.registration?.installing ? "downloading" : release.buildId === __APP_RELEASE__.buildId ? "current" : "failed" });
    } catch {
      if (this.registration?.waiting) await this.refresh().catch(() => this.update({ status: "failed" }));
      else this.update({ status: navigator.onLine ? "failed" : "offline" });
    }
    finally { this.checking = false; }
  }

  async apply(expectedBuild?: string) {
    const waiting = this.registration?.waiting;
    if (!waiting || this.applying || this.state.status === "applying") return;
    this.applying = true;
    try {
      const info = await requestWorker<WorkerInfo>(waiting, "AK_INFO");
      const release = workerRelease(info);
      if (!info.ready || !release || (expectedBuild && info.buildId !== expectedBuild) || this.registration?.waiting !== waiting) {
        await this.refresh();
        return;
      }
      this.update({ status: "applying", next: release });
      const result = await requestWorker<Reply>(waiting, "AK_APPLY", { buildId: info.buildId }, 15_000);
      if (!result.ok) this.update({ status: "blocked" });
    } catch { this.update({ status: "blocked" }); }
    finally { this.applying = false; }
  }

  async retainStorage() {
    try { const persistent = await navigator.storage.persist(); this.update({ persistent, retentionDenied: !persistent }); }
    catch { this.update({ persistent: false, retentionDenied: true }); }
  }
}

export const pwaClient = new PwaClient();
