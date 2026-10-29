// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDirectory, MemoryStorage, testLocks } from "../browser/browserFixtures";
import { setLanguage } from "../i18n";
import { appActivity } from "../pwa/activity";
import * as bundles from "./bundle";
import { SkillRepository, skillRepository } from "./repository";
import { SkillUpdates } from "./SkillUpdates";

let root: Root, container: HTMLDivElement;
let folder: FakeDirectory, storage: MemoryStorage, repository: SkillRepository;
const before = "---\nname: implementation-ledger\ndescription: test\n---\nOld instructions";
const after = before.replace("Old", "Updated");

async function waitFor(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  }, { timeout: 5000, interval: 10 });
}
const button = (text: string) => [...document.querySelectorAll("button")].find((element) => element.textContent === text);
async function click(text: string) {
  await waitFor(() => {
    expect(button(text), text).toBeDefined();
    expect(button(text)!.disabled, text).toBe(false);
  });
  await act(async () => button(text)!.click());
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}
async function render() {
  await act(async () => root.render(<SkillUpdates open onOpenChange={vi.fn()} />));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); await setLanguage("en"); appActivity.resume();
  localStorage.setItem("alpha-kanban.theme", "dark");
  folder = new FakeDirectory("installed-ledger"); folder.file("SKILL.md", before);
  storage = new MemoryStorage();
  const files = [{ path: "SKILL.md", content: after, sha256: await bundles.skillHash(after) }];
  const bundle: bundles.SkillBundle = {
    schema: 1, name: "implementation-ledger",
    version: (await bundles.skillHash("implementation-ledger/SKILL.md" + after)).slice(0, 12), files,
    known: [{ source: "a".repeat(40), files: [{ path: "SKILL.md", sha256: await bundles.skillHash(before) }] }],
  };
  repository = new SkillRepository(storage, testLocks(), { version: bundle.version, digest: await bundles.skillHash(JSON.stringify(bundle)) });
  vi.spyOn(bundles, "loadSkillBundle").mockResolvedValue(bundle);
  vi.spyOn(skillRepository, "connection").mockImplementation(repository.connection.bind(repository));
  vi.spyOn(skillRepository, "recoveries").mockImplementation(repository.recoveries.bind(repository));
  vi.spyOn(skillRepository, "connect").mockImplementation(repository.connect.bind(repository));
  vi.spyOn(skillRepository, "disconnect").mockImplementation(repository.disconnect.bind(repository));
  vi.spyOn(skillRepository, "inspect").mockImplementation(repository.inspect.bind(repository));
  vi.spyOn(skillRepository, "apply").mockImplementation(repository.apply.bind(repository));
  vi.spyOn(skillRepository, "restore").mockImplementation(repository.restore.bind(repository));
  vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(folder.handle()));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); appActivity.resume();
});

describe("skill folder permission flow", () => {
  it("requests read/write at registration but does not update or back up until explicitly confirmed", async () => {
    const request = vi.spyOn(folder, "requestPermission");
    await render();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
    await click("Register installed skill folder");
    await waitFor(() => expect(button("Back up and update skill")).toBeDefined());
    expect(window.showDirectoryPicker).toHaveBeenCalledExactlyOnceWith({ id: "alpha-kanban-skill", mode: "readwrite" });
    expect(button("Back up and update skill")!.disabled).toBe(true);
    expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(await repository.recoveries()).toHaveLength(0);
    await expect((await (await folder.getFileHandle("SKILL.md")).getFile()).text()).resolves.toBe(before);
    expect(localStorage.getItem("alpha-kanban.theme")).toBe("dark");
    await act(async () => { await setLanguage("ko"); });
    expect(document.body.textContent).toContain("읽기·쓰기 권한을 허용하세요");
    expect(document.body.textContent).toContain("등록만으로 파일을 변경하지 않으며");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["AbortError", "NotAllowedError"])("keeps the registered skill, backups and preferences after picker %s", async (name) => {
    const saved = await repository.connect(folder.handle());
    await repository.apply(await repository.inspect(saved, await bundles.loadSkillBundle()));
    const records = await repository.recoveries();
    vi.mocked(window.showDirectoryPicker).mockRejectedValue(new DOMException("Denied", name));
    await render(); await click("Choose another skill folder");
    expect(await repository.connection()).toBe(saved);
    expect(await repository.recoveries()).toEqual(records);
    expect(skillRepository.connect).not.toHaveBeenCalled();
    expect(skillRepository.disconnect).not.toHaveBeenCalled();
    expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(localStorage.getItem("alpha-kanban.theme")).toBe("dark");
    expect(Boolean(document.querySelector('[role="alert"]'))).toBe(name !== "AbortError");
  });

  it("reauthorizes an existing read-only registration on a user action without changing its identity", async () => {
    const saved = await repository.connect(folder.handle()); folder.write = "prompt";
    const request = vi.spyOn(folder, "requestPermission").mockImplementation(async () => { folder.write = "granted"; return "granted"; });
    await render();
    expect(request).not.toHaveBeenCalled();
    await click("Check installed skill");
    await waitFor(() => expect(button("Back up and update skill")).toBeDefined());
    expect(request).toHaveBeenCalledExactlyOnceWith({ mode: "readwrite" });
    expect(await repository.connection()).toBe(saved);
    expect(await repository.recoveries()).toHaveLength(0);
    expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(button("Back up and update skill")!.disabled).toBe(true);
  });

  it("still confirms, backs up, verifies and explicitly restores when write permission is already granted", async () => {
    await repository.connect(folder.handle());
    const request = vi.spyOn(folder, "requestPermission");
    await render();
    expect(button("Back up and update skill")!.disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    expect(request).not.toHaveBeenCalled(); expect(skillRepository.apply).not.toHaveBeenCalled();
    const file = folder.children.get("SKILL.md")!;
    if (file instanceof FakeDirectory) throw new Error("Expected a file");
    file.onOpen = () => expect([...storage.records.keys()].some((key) => key.startsWith("skill-update:recovery:"))).toBe(true);
    await click("Back up and update skill");
    await waitFor(() => expect(file.content).toBe(after));
    await waitFor(() => expect(button("Restore backup")).toBeDefined());
    expect(request).toHaveBeenLastCalledWith({ mode: "readwrite" });
    expect((await repository.recoveries())[0]?.state).toBe("applied");
    await click("Restore backup");
    expect(file.content).toBe(after); expect(skillRepository.restore).not.toHaveBeenCalled();
    await click("Confirm restore");
    await waitFor(() => expect(file.content).toBe(before));
    expect(request).toHaveBeenLastCalledWith({ mode: "readwrite" });
    expect((await repository.recoveries())[0]?.state).toBe("restored");
  });

  it("does not start an update when write permission has been revoked after registration", async () => {
    await repository.connect(folder.handle()); await render(); folder.write = "denied";
    const request = vi.spyOn(folder, "requestPermission");
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await click("Back up and update skill");
    expect(request).toHaveBeenCalledExactlyOnceWith({ mode: "readwrite" });
    expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(await repository.recoveries()).toHaveLength(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Allow access");
    await expect((await (await folder.getFileHandle("SKILL.md")).getFile()).text()).resolves.toBe(before);
  });

  it("waits for post-update inspection before enabling backup restoration", async () => {
    await repository.connect(folder.handle());
    await render();
    let finishInspection!: () => void;
    const inspectionGate = new Promise<void>((resolve) => { finishInspection = resolve; });
    vi.mocked(skillRepository.inspect).mockImplementationOnce(async (...args) => {
      await inspectionGate;
      return repository.inspect(...args);
    });
    try {
      await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
      await act(async () => button("Back up and update skill")!.click());
      await waitFor(() => expect(button("Restore backup")).toBeDefined());
      expect(button("Restore backup")!.disabled).toBe(true);
      await act(async () => button("Restore backup")!.click());
      expect(button("Confirm restore")).toBeUndefined();
      expect(skillRepository.restore).not.toHaveBeenCalled();
      finishInspection();
      await click("Restore backup");
      await click("Confirm restore");
      await waitFor(() => expect(button("Confirm restore")).toBeUndefined());
      expect((await repository.recoveries())[0]?.state).toBe("restored");
      await expect((await (await folder.getFileHandle("SKILL.md")).getFile()).text()).resolves.toBe(before);
    } finally {
      finishInspection();
    }
  });
});
