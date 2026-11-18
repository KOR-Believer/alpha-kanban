import { describe, expect, it, vi } from "vitest";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { FILE_EXPLORER_LIMITS, previewKind, relativeFilePath } from "./projectFiles";
import { inDocumentRoot } from "../components/documents/explorerState";

async function fixture() {
  const root = new FakeDirectory("workspace"), project = root.directory("project"), storage = new MemoryStorage();
  const repository = new BrowserRepository(storage, testLocks());
  const file = project.directory("docs").file("01_test_tickets.md");
  await repository.connect(root.handle(), "root");
  const id = (await repository.workspaces()).workspaces[0]!.id;
  return { root, project, storage, repository, id, file };
}
describe("file exploration boundaries and identity", () => {
  it("resolves work settings independently and matches path segments", async () => {
    const f = await fixture();
    expect((await f.repository.documentRootSetting(f.id)).value).toBe("docs");
    f.root.file(".ak.config", "[documents]\nroot = 자료/작업 문서\n");
    expect((await f.repository.documentRootSetting(f.id)).value).toBe("자료/작업 문서");
    f.project.file(".ak.config", "[documents]\nroot = contexts\n");
    expect((await f.repository.documentRootSetting(f.id)).value).toBe("contexts");
    expect(inDocumentRoot("contexts-old/one.md", "contexts")).toBe(false);
    expect(inDocumentRoot("contexts/a/b.md", "contexts")).toBe(true);
    expect(inDocumentRoot("자료/작업 문서/one.md", "자료/작업 문서")).toBe(true);
    f.project.file(".ak.config", "[documents]\nroot = ../outside\n");
    expect((await f.repository.documentRootSetting(f.id)).value).toBe(null);
    expect((await f.repository.projectFiles.list(f.id)).some(entry => entry.name === "docs")).toBe(true);
  });
  it("lists only immediate entries, reads no bodies and reuses Markdown identities", async () => {
    const f = await fixture(), code = f.project.directory("src").file("example.TS", "const x = 1");
    const deeper = f.project.directory("notes").directory("deep");
    const spy = vi.spyOn(deeper, "values");
    const rows = await f.repository.projectFiles.list(f.id);
    expect(rows.map(row => row.name)).toEqual(["docs", "notes", "src"]);
    expect(spy).not.toHaveBeenCalled();
    const docs = await f.repository.projectFiles.list(f.id, "docs");
    expect(f.file.reads).toBe(0); expect(code.reads).toBe(0);
    expect((await f.repository.files(f.id))[0]!.id).toBe(docs[0]!.id);
    const source = await f.repository.projectFiles.entry(f.id, "src/example.TS");
    expect(source.id).toMatch(/^f_/); expect(source.preview).toBe("text");
    expect(f.storage.records.has("document:" + source.id)).toBe(false);
    expect((await f.repository.projectFiles.entry(f.id, source.path)).id).toBe(source.id);
    expect((await f.repository.projectFiles.open(f.id, source.id!)).file.name).toBe("example.TS");
    expect(code.writes).toBe(0);
  });
  it("honors exclusions and an explicit hidden root, with no parent traversal", async () => {
    const f = await fixture();
    for (const name of [".git", ".runtime", "node_modules", "dist"]) f.project.directory(name).file("secret.txt", "x");
    f.project.directory(".records").directory("private").file("notes.md", "# Notes");
    f.project.file(".ak.config", "[documents]\nroot = .records/private\n");
    expect((await f.repository.projectFiles.list(f.id)).filter(row => row.kind === "directory").map(row => row.name)).toEqual([".records", "docs"]);
    expect((await f.repository.projectFiles.list(f.id, ".records/private"))[0]!.name).toBe("notes.md");
    for (const path of ["../outside", "/root", "a/../b", "C:/temp", ".runtime"]) await expect(f.repository.projectFiles.list(f.id, path)).rejects.toThrow();
    const child = f.project.directory("child"); child.file("nested.md");
    await f.repository.connect(child.handle(), "project");
    expect((await f.repository.projectFiles.list(f.id, "", undefined, true)).some(row => row.name === "child")).toBe(false);
    await expect(f.repository.projectFiles.entry(f.id, "child/nested.md")).rejects.toThrow();
  });
  it("finds unopened paths without file reads, reports partial failures and aborts", async () => {
    const f = await fixture();
    const files = Array.from({ length: 520 }, (_, i) => f.project.directory(`folder-${i}`).file("needle.ts", "const untouched = true"));
    const controller = new AbortController(), publish = vi.fn();
    const found = await f.repository.projectFiles.search(f.id, "needle", controller.signal, publish);
    expect(found.complete).toBe(true); expect(found.entries).toHaveLength(520);
    expect(files.every(file => file.reads === 0 && file.bodyReads === 0 && file.writes === 0)).toBe(true);
    f.project.directory("denied").read = "denied"; f.repository.projectFiles.invalidate();
    const partial = await f.repository.projectFiles.search(f.id, "missing", controller.signal, () => {});
    expect(partial.complete).toBe(false); expect(partial.errors).toContain("denied");
    f.repository.projectFiles.invalidate();
    const abort = new AbortController();
    await expect(f.repository.projectFiles.search(f.id, "needle", abort.signal, () => abort.abort())).rejects.toMatchObject({ name: "AbortError" });
  });
  it("bounds concurrent listings and marks limits incomplete", async () => {
    const f = await fixture();
    let active = 0, maximum = 0;
    for (let i = 0; i < 12; i++) {
      const directory = f.project.directory(`dir${i}`); directory.file("f.txt", "x");
      const values = directory.values.bind(directory);
      vi.spyOn(directory, "values").mockImplementation(async function* () {
        active++; maximum = Math.max(active, maximum);
        try { await new Promise(resolve => setTimeout(resolve, 2)); yield* values(); } finally { active--; }
      });
    }
    await f.repository.projectFiles.search(f.id, "f", new AbortController().signal, () => {});
    expect(maximum).toBeGreaterThan(1); expect(maximum).toBeLessThanOrEqual(FILE_EXPLORER_LIMITS.concurrency);
    const old = FILE_EXPLORER_LIMITS.entries; FILE_EXPLORER_LIMITS.entries = 5;
    try { expect(await f.repository.projectFiles.search(f.id, "f", new AbortController().signal, () => {})).toMatchObject({ limited: true, complete: false }); }
    finally { FILE_EXPLORER_LIMITS.entries = old; }
  });
  it("rechecks identity and read permission on open and refreshes replacement IDs", async () => {
    const f = await fixture(), source = f.project.file("data.json", "{}");
    source.write = "denied";
    const entry = await f.repository.projectFiles.entry(f.id, source.name);
    expect(await f.repository.projectFiles.open(f.id, entry.id!)).toBeDefined();
    source.read = "denied"; await expect(f.repository.projectFiles.open(f.id, entry.id!)).rejects.toThrow(); source.read = "granted";
    f.project.file(source.name, "{\"new\":true}");
    await expect(f.repository.projectFiles.open(f.id, entry.id!)).rejects.toThrow();
    const current = await f.repository.projectFiles.entry(f.id, source.name); expect(current.id).not.toBe(entry.id);
    await expect(f.repository.projectFiles.open("other-project", current.id!)).rejects.toThrow();
    f.project.children.delete(source.name); await expect(f.repository.projectFiles.open(f.id, current.id!)).rejects.toThrow();
  });
  it("resolves resource paths without escaping and handles uppercase types", () => {
    expect(relativeFilePath("docs/a/test.html", "../assets/a%20b.js?v=1")).toBe("docs/assets/a b.js");
    for (const href of ["../../../outside", "file:///private", "C:/x", "/home/x", "..\\..\\x", "%00x"]) expect(() => relativeFilePath("docs/index.html", href)).toThrow();
    expect(previewKind("demo.HTML")).toBe("html"); expect(previewKind("image.SVG")).toBe("image"); expect(previewKind("file.ZIP")).toBe("file");
  });
});
