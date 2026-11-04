import { describe, expect, it } from "vitest";
import { parseTicketDocument } from "@alpha-kanban/shared/ticketMarkdown";
import { createDocumentSearchEntry, searchDocument } from "./documentSearch";
import { DocumentSearchCache } from "./browser/documentSearchCache";
import { BrowserRepository } from "./browser/repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browser/browserFixtures";
import { projectFixture, documentFixture } from "./allProjectsFixtures";

const file = documentFixture(projectFixture("fixture", "bw_search"), "d_search").file;

describe("project document content search", () => {
  it("uses parser boundaries, includes unknown fields and leaves common sections outside tickets", () => {
    const source = ledger.replace("목표:\n- goal", "설계 세부 메모:\n- 청록색 등대\n\n목표:\n- goal");
    const entry = createDocumentSearchEntry(file, source, parseTicketDocument(source));
    expect(searchDocument(entry, "청록색 등대")).toMatchObject({ ticketIds: ["TEST-01"], documentMatch: false, excerpt: "- 청록색 등대" });
    expect(searchDocument(entry, "Keep this unknown section")).toMatchObject({ ticketIds: [], documentMatch: true });
    expect(searchDocument(entry, "Test ticket")?.ticketIds).toEqual(["TEST-01", "TEST-02"]);
    expect(searchDocument(entry, "absent")).toBeUndefined();
    expect(searchDocument(entry, "")).toBeUndefined();
    expect(source).toBe(entry.text);
  });

  it.each(["plan", "inventory", "markdown"] as const)("searches headings, body, code and properties of %s", (type) => {
    const text = "# 한국어 제목\r\nOwner: @alice\r\n\r\n본문에만 있는 보랏빛 나침반\r\n\r\n```txt\r\nUNRENDERED_VALUE\r\n```\r\n";
    const entry = createDocumentSearchEntry({ ...file, type }, text);
    expect(searchDocument(entry, "한국어 제목")).toMatchObject({ line: 1, documentMatch: true });
    expect(searchDocument(entry, "보랏빛 나침반")).toMatchObject({ line: 4, ticketIds: [] });
    expect(searchDocument(entry, "owner: @ALICE")).toMatchObject({ line: 2 });
    expect(searchDocument(entry, "unrendered_value")).toMatchObject({ line: 7 });
  });

  it("keeps source lines and ticket boundaries when case folding expands earlier characters", () => {
    const source = "İİİ\n" + ledger.replace("목표:\n- goal", "목표:\n- 마지막 징표");
    const entry = createDocumentSearchEntry(file, source, parseTicketDocument(source));
    expect(searchDocument(entry, "마지막 징표")).toMatchObject({ ticketIds: ["TEST-01"], documentMatch: false, excerpt: "- 마지막 징표", line: source.split("\n").indexOf("- 마지막 징표") + 1 });
    expect(searchDocument(entry, "Keep this unknown section")).toMatchObject({ ticketIds: [], documentMatch: true });
  });

  it("retains searchable sources after memory eviction without rereading files, and rejects other paths/revisions/projects", async () => {
    const storage = new MemoryStorage();
    const cache = new DocumentSearchCache(storage, 1);
    const entry = createDocumentSearchEntry(file, "# cached\n\ncache-only-token");
    cache.remember(entry);
    expect(searchDocument((await cache.get(file))!, "cache-only-token")).toBeDefined();
    expect(await cache.get({ ...file, hash: "new" })).toBeUndefined();
    expect(await cache.get({ ...file, workspaceRelativePath: "other.md" })).toBeUndefined();
    expect(await cache.get({ ...file, workspaceId: "other" })).toBeUndefined();
    const reloaded = new DocumentSearchCache(storage, 1);
    expect(await reloaded.get(file)).toEqual(entry);
  });

  it("keeps the newer persisted revision when asynchronous writes overlap", async () => {
    const cache = new DocumentSearchCache(new MemoryStorage(), 1);
    cache.remember(createDocumentSearchEntry(file, "old"));
    const changed = { ...file, hash: "new" };
    cache.remember(createDocumentSearchEntry(changed, "new content"));
    expect((await cache.get(changed))?.text).toBe("new content");
    expect(await cache.get(file)).toBeUndefined();
  });

  it("reports an unavailable cache instead of returning an empty search on quota errors", async () => {
    const storage = new MemoryStorage();
    storage.set = async () => { throw new Error("QuotaExceededError"); };
    const cache = new DocumentSearchCache(storage, 1);
    cache.remember(createDocumentSearchEntry(file, "not retained"));
    expect(await cache.get(file)).toBeUndefined();
  });

  it("reuses listing reads and updates sources after confirmed external changes and moves", async () => {
    const root = new FakeDirectory("search-fixture");
    const target = root.file("notes.md", "# Notes\n\nold needle");
    const repo = new BrowserRepository(new MemoryStorage(), testLocks(), 1);
    const connection = await repo.connect(root.handle(), "project");
    const project = (await repo.workspaces()).workspaces[0]!;
    const [first] = await repo.files(project.id);
    const reads = target.bodyReads;
    await repo.prepareDocumentSearch(first!);
    for (const query of ["needle", "Notes", "missing"]) searchDocument((await repo.documentSearch.get(first!))!, query);
    expect(target.bodyReads).toBe(reads);
    target.content = "# Notes\n\nnew phrase"; target.mtime++;
    const [updated] = await repo.files(project.id);
    expect(searchDocument((await repo.documentSearch.get(updated!))!, "old needle")).toBeUndefined();
    expect(searchDocument((await repo.documentSearch.get(updated!))!, "new phrase")).toBeDefined();
    root.children.delete("notes.md"); target.name = "moved.md"; root.children.set(target.name, target);
    const [moved] = await repo.files(project.id);
    expect(moved?.id).toBe(updated?.id);
    expect(moved?.workspaceRelativePath).toBe("moved.md");
    expect(searchDocument((await repo.documentSearch.get(moved!))!, "new phrase")).toBeDefined();
    expect(await repo.documentSearch.get(updated!)).toBeUndefined();
    root.children.delete("moved.md");
    expect(await repo.files(project.id)).toEqual([]);
    root.read = "denied";
    expect((await repo.workspaces()).workspaces[0]?.isAvailable).toBe(false);
    await repo.disconnect(connection.id);
    expect((await repo.workspaces()).workspaces).toEqual([]);
    expect(target.writes).toBe(0);
  });
});
