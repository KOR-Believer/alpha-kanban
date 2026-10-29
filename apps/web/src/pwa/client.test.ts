import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaClient } from "./client";
import type { ReleaseInfo } from "./releases";

const workerCall = vi.hoisted(() => vi.fn());
vi.mock("./protocol", async (original) => ({ ...await original<typeof import("./protocol")>(), requestWorker: workerCall }));
function release(n: number): ReleaseInfo {
  return { app: "alpha-kanban", mode: "app", protocol: 1, buildId: String(n).repeat(16), storageSchema: 1, skillBundle: "1234567890ab", skillVersion: null, documentFormat: null, notes: { ko: ["변경 " + n], en: ["Change " + n] } };
}
function worker(n: number) { return { n, scriptURL: "https://app.test/sw.js" }; }
let registration: { active: ReturnType<typeof worker>; waiting: ReturnType<typeof worker> | null; installing: null; scope: string; addEventListener: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
let client: PwaClient;
beforeEach(async () => {
  registration = { active: worker(1), waiting: worker(2), installing: null, scope: "https://app.test/", addEventListener: vi.fn(), update: vi.fn() };
  workerCall.mockReset().mockImplementation(async (target, type) => type === "AK_INFO" ? { protocol: 1, mode: "app", ready: true, buildId: release(target.n).buildId, release: release(target.n) } : { ok: false });
  vi.stubGlobal("location", { origin: "https://app.test" });
  vi.stubGlobal("window", { addEventListener: vi.fn(), setInterval: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true, serviceWorker: { register: async () => registration, getRegistration: async () => registration }, storage: {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(release(3)), { headers: { "content-type": "application/json" } })));
  client = new PwaClient(); await client.start();
  await vi.waitFor(() => expect(client.getSnapshot().status).toBe("ready"));
  workerCall.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("prepared release binding", () => {
  it("uses waiting B even when release.json reports C, online or offline", async () => {
    expect(client.getSnapshot().prepared?.buildId).toBe(release(2).buildId);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await client.check();
    expect(client.getSnapshot().prepared?.buildId).toBe(release(2).buildId);
    await client.apply(release(2).buildId);
    expect(workerCall).toHaveBeenCalledWith(registration.waiting, "AK_APPLY", { buildId: release(2).buildId }, 15_000);
  });
  it("does not apply a replacement worker using previously read notes", async () => {
    registration.waiting = worker(3);
    await client.apply(release(2).buildId);
    expect(workerCall.mock.calls.some((call) => call[1] === "AK_APPLY")).toBe(false);
    expect(client.getSnapshot().prepared?.buildId).toBe(release(3).buildId);
  });
  it("rejects mismatched worker metadata and serializes duplicate confirmation", async () => {
    const normal = workerCall.getMockImplementation()!;
    workerCall.mockImplementationOnce(async () => ({ protocol: 1, mode: "app", ready: true, buildId: release(2).buildId, release: release(3) })).mockImplementation(normal);
    await client.apply(release(2).buildId);
    expect(workerCall.mock.calls.some((call) => call[1] === "AK_APPLY")).toBe(false);
    workerCall.mockClear();
    await Promise.all([client.apply(release(2).buildId), client.apply(release(2).buildId)]);
    expect(workerCall.mock.calls.filter((call) => call[1] === "AK_APPLY")).toHaveLength(1);
  });
});
