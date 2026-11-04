import { describe, expect, it, vi } from "vitest";
import { FakeDirectory } from "../browser/browserFixtures";
import { droppedSkillFolder, DROP_UNAVAILABLE, FOLDER_REQUIRED, SINGLE_FOLDER } from "./folderDrop";

const header = "---\nname: implementation-ledger\n---\nLocal fixture";
describe("skill folder drop boundary", () => {
  it("captures a handle synchronously, reads only the selected header and leaves permission/connection to explicit actions", async () => {
    const folder = new FakeDirectory("renamed-ledger"); folder.file("SKILL.md", header);
    const nested = folder.directory("references"); nested.file("guide.md", "reference");
    const handle = folder.handle(); const get = vi.fn().mockResolvedValue(handle);
    const permission = vi.spyOn(folder, "requestPermission");
    const children = vi.spyOn(nested, "getFileHandle");
    const result = droppedSkillFolder([{ kind: "file", getAsFileSystemHandle: get }]);
    expect(get).toHaveBeenCalledOnce();
    expect(await result).toBe(handle);
    expect(permission).not.toHaveBeenCalled(); expect(children).not.toHaveBeenCalled();
  });
  it("rejects multi-item drops before acquiring any handle, including mixed text/files", async () => {
    const get = vi.fn();
    await expect(droppedSkillFolder([{ kind: "file", getAsFileSystemHandle: get }, { kind: "string" }])).rejects.toThrow(SINGLE_FOLDER);
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects files, links, missing handles and unsupported drop APIs", async () => {
    await expect(droppedSkillFolder([{ kind: "string" }])).rejects.toThrow(FOLDER_REQUIRED);
    await expect(droppedSkillFolder([{ kind: "file" }])).rejects.toThrow(DROP_UNAVAILABLE);
    for (const value of [null, { kind: "file" }]) {
      await expect(droppedSkillFolder([{ kind: "file", getAsFileSystemHandle: vi.fn().mockResolvedValue(value) }])).rejects.toThrow(FOLDER_REQUIRED);
    }
  });
  it("never scans a parent skills folder and rejects another skill despite the folder name", async () => {
    const parent = new FakeDirectory("skills"); const child = parent.directory("implementation-ledger"); child.file("SKILL.md", header);
    const scan = vi.spyOn(parent, "values");
    await expect(droppedSkillFolder([{ kind: "file", getAsFileSystemHandle: vi.fn().mockResolvedValue(parent.handle()) }])).rejects.toThrow("containing SKILL.md");
    expect(scan).not.toHaveBeenCalled();
    child.file("SKILL.md", header.replace("implementation-ledger", "another-skill"));
    await expect(droppedSkillFolder([{ kind: "file", getAsFileSystemHandle: vi.fn().mockResolvedValue(child.handle()) }])).rejects.toThrow("containing SKILL.md");
  });
});
