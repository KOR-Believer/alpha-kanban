// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDirectory, FakeFile, MemoryStorage, testLocks } from "../browser/browserFixtures";
import { setLanguage } from "../i18n";
import { appActivity } from "../pwa/activity";
import * as bundles from "./bundle";
import { SkillRepository, skillRepository } from "./repository";
import { SkillUpdates, SkillUpdatesButton } from "./SkillUpdates";
import { formatSkillBytes } from "./backupSize";

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
  vi.spyOn(skillRepository, "reinstall").mockImplementation(repository.reinstall.bind(repository));
  vi.spyOn(skillRepository, "restore").mockImplementation(repository.restore.bind(repository));
  vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(folder.handle()));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); appActivity.resume();
});

describe("explicit skill reinstall UI", () => {
  async function customInstallation() {
    const skill = folder.children.get("SKILL.md") as FakeFile;
    skill.content += "\nCanary instructions and 개인 수정";
    const extra = folder.file("personal.md", "<script>do not execute</script>\nPersonal notes");
    await repository.connect(folder.handle());
    await render();
    return { skill, extra };
  }

  it("shows before/after content without writing, preserves consent across language changes and clears it on cancel/recheck/close", async () => {
    const { skill } = await customInstallation();
    const original = skill.content;
    const permission = vi.spyOn(folder, "requestPermission");
    expect(button("Back up and update skill")).toBeUndefined();
    await click("Review reinstall");
    expect(button("Back up and reinstall")!.disabled).toBe(true);
    expect(appActivity.prepare()).toBe(false);
    const section = document.querySelector('[aria-label="Review skill reinstall"]')!;
    for (const details of section.querySelectorAll("details")) {
      await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    }
    expect(section.querySelectorAll(".ak-code-diff")).toHaveLength(2);
    expect(section.querySelector('[data-change="removed"] code')?.textContent).toContain("Old instructions");
    expect(section.querySelector('[data-change="added"] code')?.textContent).toContain("Updated instructions");
    expect(section.textContent).toContain("Remove file");
    expect(section.textContent).toContain("<script>do not execute</script>");
    expect(section.querySelector("script")).toBeNull();
    await act(async () => section.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await act(async () => { await setLanguage("ko"); });
    expect(section.isConnected).toBe(true);
    expect(button("백업 후 다시 설치")!.disabled).toBe(false);
    expect(section.textContent).toContain("현재 파일 전체를 먼저 백업");
    expect(localStorage.getItem("alpha-kanban.theme")).toBe("dark");
    await act(async () => { await setLanguage("en"); });
    await click("Cancel");
    expect(appActivity.busy).toBe(false);
    await click("Review reinstall");
    expect(button("Back up and reinstall")!.disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await click("Check installed skill");
    expect(button("Back up and reinstall")).toBeUndefined();
    await click("Review reinstall");
    expect(button("Back up and reinstall")!.disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await act(async () => root.render(<SkillUpdates open={false} onOpenChange={vi.fn()} />));
    await render();
    expect(button("Back up and reinstall")).toBeUndefined();
    await click("Review reinstall");
    expect(button("Back up and reinstall")!.disabled).toBe(true);
    expect(skillRepository.reinstall).not.toHaveBeenCalled(); expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(await repository.recoveries()).toHaveLength(0); expect(skill.content).toBe(original);
    // Only the explicit recheck requests permission; opening and cancelling previews never do.
    expect(permission).toHaveBeenCalledExactlyOnceWith({ mode: "readwrite" });
  });

  it("requires explicit consent, then backs up, reinstalls and restores unknown files with size and retention information", async () => {
    const { skill, extra } = await customInstallation();
    const original = skill.content;
    const size = formatSkillBytes(new TextEncoder().encode(original + extra.content + after).length, "en");
    await click("Review reinstall");
    expect(document.body.textContent).toContain(`Backup file contents: ${size}`);
    expect(skillRepository.reinstall).not.toHaveBeenCalled();
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    expect(skillRepository.reinstall).not.toHaveBeenCalled();
    await click("Back up and reinstall");
    expect(skillRepository.reinstall).toHaveBeenCalledTimes(1); expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(skill.content).toBe(after); expect(folder.children.has("personal.md")).toBe(false);
    expect((await repository.recoveries())[0]?.before.find((file) => file.path === "personal.md")?.content).toBe(extra.content);
    expect(document.body.textContent).toContain(`Total backup file contents: ${size}`);
    expect(document.body.textContent).toContain("not automatically deleted");
    await click("Restore backup"); await click("Confirm restore");
    expect(skill.content).toBe(original);
    await expect((await (await folder.getFileHandle("personal.md")).getFile()).text()).resolves.toBe(extra.content);
    await click("Disconnect");
    expect(await repository.recoveries()).toHaveLength(1);
    expect(document.body.textContent).toContain(`Total backup file contents: ${size}`);
  });

  it("rejects external changes after preview and requires a fresh review", async () => {
    const { skill } = await customInstallation();
    await click("Review reinstall");
    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    skill.content += "\nEdit after consent";
    await click("Back up and reinstall");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("changed outside");
    expect(skill.content).toContain("Edit after consent"); expect(skill.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
    expect(button("Back up and reinstall")).toBeUndefined();
    await click("Check installed skill"); await click("Review reinstall");
    expect(button("Back up and reinstall")!.disabled).toBe(true);
  });

  it("does not expose reinstall when target compatibility is unknown", async () => {
    await customInstallation();
    const inspect = repository.inspect.bind(repository);
    vi.mocked(skillRepository.inspect).mockImplementation(async (...args) => ({ ...await inspect(...args), state: "review" }));
    await click("Check installed skill");
    expect(button("Review reinstall")).toBeUndefined();
    expect(button("Back up and update skill")).toBeUndefined();
    expect(document.body.textContent).toContain("review compatibility");
  });
});

describe("skill folder permission flow", () => {
  it("opens the toolbar manager in place, keeps it open across language changes and returns focus without requesting access", async () => {
    await setLanguage("ko");
    const request = vi.spyOn(folder, "requestPermission");
    const initialUrl = location.href;
    await act(async () => root.render(<SkillUpdatesButton placement="toolbar" />));
    const trigger = button("스킬 업데이트")!;
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(skillRepository.connection).not.toHaveBeenCalled();
    expect(bundles.loadSkillBundle).not.toHaveBeenCalled();
    trigger.focus();
    await click("스킬 업데이트");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("h2")?.textContent).toBe("스킬 업데이트");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => { await setLanguage("en"); });
    expect(trigger.textContent).toBe("Skill updates");
    expect(dialog.isConnected).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Skill updates");
    await click("Close");
    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(location.href).toBe(initialUrl);
    expect(window.showDirectoryPicker).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(skillRepository.apply).not.toHaveBeenCalled();
    expect(skillRepository.connect).not.toHaveBeenCalled();
    expect(await repository.recoveries()).toHaveLength(0);
  });

  it("requests read/write at registration but does not update or back up until explicitly confirmed", async () => {
    const request = vi.spyOn(folder, "requestPermission");
    await render();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
    await click("Register installed skill folder");
    await waitFor(() => expect(button("Back up and update skill")).toBeDefined());
    expect(window.showDirectoryPicker).toHaveBeenCalledExactlyOnceWith({ id: "alpha-kanban-skill", mode: "readwrite" });
    expect(button("Back up and update skill")!.disabled).toBe(true);
    const changes = document.querySelector("details")!;
    await act(async () => { changes.open = true; changes.dispatchEvent(new Event("toggle")); });
    expect(changes.querySelector('[data-change="removed"] code')?.firstChild?.textContent).toBe("Old instructions");
    expect(changes.querySelector('[data-change="added"] code')?.firstChild?.textContent).toBe("Updated instructions");
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
