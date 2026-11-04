import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaClient, parseRelease } from "./client";
import type { ReleaseInfo } from "./releases";
import { skillHash } from "../skills/bundle";
import { appActivity } from "./activity";

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

describe("prepared skill payload", () => {
  async function prepared() {
    const content = "---\nname: implementation-ledger\n---\nTest";
    const bundle = { schema: 1, name: "implementation-ledger", version: (await skillHash("implementation-ledger/SKILL.md" + content)).slice(0, 12), files: [{ path: "SKILL.md", content, sha256: await skillHash(content) }], known: [] };
    const target = { ...release(2), skillBundle: bundle.version, skillPayload: await skillHash(JSON.stringify(bundle)) };
    workerCall.mockImplementation(async () => ({ protocol: 1, mode: "app", ready: true, buildId: target.buildId, release: target }));
    const match = vi.fn(async () => new Response(JSON.stringify(bundle), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("caches", { match });
    return { target, bundle, match };
  }
  it("reads only waiting B's hash-bound precache even offline with C on the network", async () => {
    const { target, bundle, match } = await prepared();
    vi.mocked(fetch).mockClear();
    expect(await client.preparedSkillBundle(target)).toEqual(bundle);
    expect(match).toHaveBeenCalledWith(`https://app.test/downloads/implementation-ledger-${bundle.version}.json`, { cacheName: "alpha-kanban-app-v1-" + target.buildId, ignoreSearch: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects replaced workers, missing assets and invalid hashes without a network fallback", async () => {
    const { target, match } = await prepared();
    match.mockResolvedValueOnce(undefined as unknown as Response);
    await expect(client.preparedSkillBundle(target)).rejects.toThrow("unavailable");
    match.mockResolvedValueOnce(new Response('{"tampered":true}', { headers: { "content-type": "application/json" } }));
    await expect(client.preparedSkillBundle(target)).rejects.toThrow("Invalid");
    const normal = match.getMockImplementation()!;
    match.mockImplementationOnce(async () => { registration.waiting = worker(3); return normal(); });
    await expect(client.preparedSkillBundle(target)).rejects.toThrow("prepared update changed");
  });
});
afterEach(() => { appActivity.resume(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("prepared release binding", () => {
  it("uses waiting B even when release.json reports C, online or offline", async () => {
    expect(client.getSnapshot().prepared?.buildId).toBe(release(2).buildId);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await client.check();
    expect(client.getSnapshot().prepared?.buildId).toBe(release(2).buildId);
    await client.apply(release(2).buildId);
    expect(workerCall).toHaveBeenCalledWith(registration.waiting, "AK_APPLY", { buildId: release(2).buildId, channel: "stable" }, 15_000);
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
  it("waits for the session lease to resume before callers can cancel durable skill consent", async () => {
    const normal = workerCall.getMockImplementation()!;
    workerCall.mockImplementation(async (target, type) => {
      if (type === "AK_APPLY") { appActivity.prepare(); return { ok: false }; }
      return normal(target, type);
    });
    let returned = false;
    const applying = client.apply(release(2).buildId).then((value) => { returned = true; return value; });
    await vi.waitFor(() => expect(appActivity.frozen).toBe(true));
    expect(returned).toBe(false);
    appActivity.resume();
    expect(await applying).toBe(false);
    expect(appActivity.frozen).toBe(false);
  });
});

describe("release channel boundaries", () => {
  it("accepts historical releases only on stable and rejects malformed channel/origin", () => {
    expect(parseRelease(release(1), "stable")).toEqual(release(1));
    expect(() => parseRelease(release(1), "canary")).toThrow(/channel/);
    for (const channel of [null, "", "preview", "canary"]) expect(() => parseRelease({ ...release(1), channel }, "stable")).toThrow(/channel/);
    expect(parseRelease({ ...release(1), channel: "canary" }, "canary").channel).toBe("canary");
    expect(() => parseRelease({ ...release(1), channel: "stable", canonicalOrigin: "https://kanban-canary.giveit2.me" }, "stable")).toThrow(/origin/);
  });
  it("clears a previously prepared update when its worker switches channels, even offline", async () => {
    const normal = workerCall.getMockImplementation()!;
    workerCall.mockImplementation(async (target, type) => target === registration.waiting && type === "AK_INFO"
      ? { protocol: 1, mode: "app", ready: true, channel: "canary", buildId: release(2).buildId, release: { ...release(2), channel: "canary" } }
      : normal(target, type));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await client.check();
    expect(client.getSnapshot()).toMatchObject({ status: "failed", prepared: undefined, next: undefined });
    expect(await client.apply(release(2).buildId)).toBe(false);
    await expect(client.preparedSkillBundle(release(2))).rejects.toThrow(/channel/);
    expect(workerCall.mock.calls.some((call) => call[1] === "AK_APPLY")).toBe(false);
  });
  it("rejects a channel conflict between a worker envelope and its release", async () => {
    workerCall.mockResolvedValue({ protocol: 1, mode: "app", ready: true, channel: "stable", buildId: release(2).buildId, release: { ...release(2), channel: "canary" } });
    expect(await client.apply(release(2).buildId)).toBe(false);
    expect(workerCall.mock.calls.some((call) => call[1] === "AK_APPLY")).toBe(false);
  });
  it("does not download a cross-channel network release when no matching update is prepared", async () => {
    registration.waiting = null;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...release(3), channel: "canary" }), { headers: { "content-type": "application/json" } }));
    registration.update.mockClear();
    await client.check();
    expect(registration.update).not.toHaveBeenCalled();
    expect(client.getSnapshot()).toMatchObject({ status: "failed", prepared: undefined, next: undefined });
  });
  it("canary rejects channel-less workers and applies only explicitly matching canary workers", async () => {
    const canary = { ...release(1), channel: "canary" as const };
    const candidate = new PwaClient(canary);
    await candidate.start();
    expect(candidate.getSnapshot().status).toBe("failed");
    workerCall.mockImplementation(async (target, type) => type === "AK_INFO"
      ? { protocol: 1, mode: "app", ready: true, channel: "canary", buildId: release(target.n).buildId, release: { ...release(target.n), channel: "canary" } }
      : { ok: true });
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ ...release(3), channel: "canary" }), { headers: { "content-type": "application/json" } }));
    const matching = new PwaClient(canary);
    await matching.start();
    await vi.waitFor(() => expect(matching.getSnapshot().status).toBe("ready"));
    expect(await matching.apply(release(2).buildId)).toBe(true);
    expect(workerCall).toHaveBeenCalledWith(registration.waiting, "AK_APPLY", { buildId: release(2).buildId, channel: "canary" }, 15_000);
  });
});
