import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerCall = vi.hoisted(() => vi.fn());
vi.mock("./protocol", async (original) => ({ ...await original<typeof import("./protocol")>(), requestWorker: workerCall }));
let sw: EventTarget, win: EventTarget;
let current: { buildId: string; protocol: number; mode: string; channel?: string };
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  sw = new EventTarget(); win = new EventTarget(); reload = vi.fn();
  const worker = { scriptURL: "https://app.test/sw.js" };
  Object.assign(sw, { controller: worker, getRegistration: async () => ({ active: worker }) });
  current = { buildId: "legacy-build", protocol: 1, mode: "app" };
  workerCall.mockReset().mockImplementation(async () => current);
  vi.stubGlobal("navigator", { serviceWorker: sw, locks: { request: (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { body: { inert: false } });
  vi.stubGlobal("location", { origin: "https://app.test", reload });
});
afterEach(() => { win.dispatchEvent(new Event("pagehide")); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function message(type: string, transaction = "test-update") {
  const reply = vi.fn();
  const event = new Event("message");
  Object.assign(event, { data: { type, transaction, protocol: 1, channel: "stable" }, source: { scriptURL: "https://app.test/sw.js" }, ports: [{ postMessage: reply }] });
  sw.dispatchEvent(event); return reply;
}
describe("PWA startup version boundary", () => {
  it("stops before mounting a mismatching app without repeatedly reloading new routes", async () => {
    const { startPwaSession } = await import("./session");
    expect(await startPwaSession()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    const version = message("AK_VERSION");
    expect(version).toHaveBeenCalledWith(expect.objectContaining({ buildId: __APP_RELEASE__.buildId }));
  });
  it("keeps the stopped page in a confirmed update transaction and reloads only on its commit", async () => {
    const { startPwaSession } = await import("./session");
    expect(await startPwaSession()).toBe(false);
    const ready = message("AK_PREPARE");
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(document.body.inert).toBe(true);
    message("AK_COMMIT", "unrelated"); expect(reload).not.toHaveBeenCalled();
    message("AK_COMMIT"); expect(reload).toHaveBeenCalledTimes(1);
  });
  it("still rejects an update while a matching app has unsaved work", async () => {
    current.buildId = __APP_RELEASE__.buildId;
    const { startPwaSession } = await import("./session");
    const { appActivity } = await import("./activity");
    expect(await startPwaSession()).toBe(true);
    appActivity.setDraft({}, true);
    expect(message("AK_PREPARE")).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    message("AK_COMMIT"); expect(reload).not.toHaveBeenCalled();
  });
  it("continues to reject the wrong channel instead of mounting the app", async () => {
    current.channel = "canary";
    const { startPwaSession } = await import("./session");
    await expect(startPwaSession()).rejects.toThrow("channel");
    expect(reload).not.toHaveBeenCalled();
  });
});
