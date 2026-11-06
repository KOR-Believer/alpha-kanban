// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage, testLocks } from "../browser/browserFixtures";
import { IndexedDbStorage } from "../browser/storage";
import { appActivity } from "../pwa/activity";
import type { ReleaseInfo } from "../pwa/releases";
import { SkillRepository, type AppSkillUpdate } from "./repository";
import { useAppSkillUpdate } from "./useAppSkillUpdate";
import * as bundles from "./bundle";

const key = "skill-update:app-update";
const release: ReleaseInfo = { app: "alpha-kanban", mode: "app", protocol: 1, storageSchema: 1, buildId: "b".repeat(16), skillBundle: "1234567890ab", skillVersion: null, documentFormat: null, skillPayload: "c".repeat(64), releaseId: "test", notes: { ko: [], en: [] } };
const completed = (): AppSkillUpdate => ({ id: "completed-update", fromBuild: "a".repeat(16), buildId: release.buildId, version: release.skillBundle, digest: release.skillPayload!, connectionId: "synthetic-folder", files: [], state: "applied", recoveryId: "retained-backup" });
let storage: MemoryStorage, root: Root, container: HTMLDivElement;
function Harness({ name }: { name: string }) {
  const skill = useAppSkillUpdate(release, undefined, true);
  return <section data-view={name}>
    {skill.result ? <button onClick={() => void skill.dismissResult()}>{skill.result.id}</button> : null}
    {skill.error ? <p role="alert">{skill.error}</p> : null}
  </section>;
}
const render = () => act(async () => root.render(<><Harness name="one" /><Harness name="two" /></>));
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const buttons = () => [...container.querySelectorAll("button")];

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The local event is tested here; the production smoke covers real windows.
  vi.stubGlobal("BroadcastChannel", undefined);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  storage = new MemoryStorage();
  await storage.set(key, completed());
  await storage.set("skill-update:recovery:retained-backup", { state: "applied", before: "original bytes" });
  vi.spyOn(IndexedDbStorage.prototype, "get").mockImplementation(storage.get.bind(storage));
  vi.spyOn(IndexedDbStorage.prototype, "set").mockImplementation(storage.set.bind(storage));
  const lock = testLocks();
  vi.spyOn(navigator, "locks", "get").mockReturnValue({ request: lock } as unknown as LockManager);
  vi.spyOn(bundles, "loadSkillBundle");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); appActivity.resume();
});

describe("completed skill update notices", () => {
  it("dismisses both mounted views durably without repeating the update or deleting its backup", async () => {
    const complete = vi.spyOn(SkillRepository.prototype, "completeAppUpdate");
    await render(); await settle(); expect(buttons()).toHaveLength(2);
    await act(async () => buttons()[0]!.click()); await settle();
    expect(buttons()).toHaveLength(0);
    expect((await storage.get<AppSkillUpdate>(key))?.acknowledged).toBe(true);
    const calls = complete.mock.calls.length;
    await act(async () => root.render(null)); await render(); await settle();
    expect(buttons()).toHaveLength(0); expect(complete).toHaveBeenCalledTimes(calls);
    expect(await storage.get("skill-update:recovery:retained-backup")).toEqual({ state: "applied", before: "original bytes" });
    expect(bundles.loadSkillBundle).not.toHaveBeenCalled();
  });

  it("does not resurrect a late completion after another view acknowledges it", async () => {
    const stale = completed();
    let finish!: (value: AppSkillUpdate) => void;
    vi.spyOn(SkillRepository.prototype, "completeAppUpdate")
      .mockResolvedValueOnce(stale)
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(); await settle(); expect(buttons()).toHaveLength(1);
    await act(async () => buttons()[0]!.click()); await settle();
    await act(async () => finish(stale)); await settle();
    expect(buttons()).toHaveLength(0);
  });

  it("keeps a newer result visible when an older result is acknowledged", async () => {
    vi.spyOn(SkillRepository.prototype, "completeAppUpdate")
      .mockResolvedValueOnce(completed()).mockResolvedValueOnce({ ...completed(), id: "newer-update" });
    await render(); await settle();
    await act(async () => buttons()[0]!.click()); await settle();
    expect(buttons().map(button => button.textContent)).toEqual(["newer-update"]);
  });

  it("rechecks durable acknowledgement on focus when another window has no broadcast support", async () => {
    await render(); await settle(); expect(buttons()).toHaveLength(2);
    await storage.set(key, { ...completed(), acknowledged: true });
    await act(async () => window.dispatchEvent(new Event("focus"))); await settle();
    expect(buttons()).toHaveLength(0);
  });

  it("keeps a failed acknowledgement retryable and does not notify other views before storage commits", async () => {
    await render(); await settle();
    vi.mocked(IndexedDbStorage.prototype.set).mockRejectedValueOnce(new Error("Browser storage is blocked by another tab."));
    await act(async () => buttons()[0]!.click()); await settle();
    expect(buttons()).toHaveLength(2); expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect((await storage.get<AppSkillUpdate>(key))?.acknowledged).not.toBe(true);
    await act(async () => buttons()[0]!.click()); await settle();
    expect(buttons()).toHaveLength(0); expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("retains blocked results until acknowledged and never retries their file writes", async () => {
    await storage.set(key, { ...completed(), state: "blocked", error: "Allow access to the registered skill folder to continue." });
    await render(); await settle(); expect(buttons()).toHaveLength(2);
    await settle(); expect(buttons()).toHaveLength(2);
    expect((await storage.get<AppSkillUpdate>(key))?.state).toBe("blocked");
    expect(bundles.loadSkillBundle).not.toHaveBeenCalled();
  });
});
