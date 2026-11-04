import { describe, expect, it, vi } from "vitest";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browserFixtures";
import { previewDocumentMigrations } from "@alpha-kanban/shared/documentMigration";
const board = "## Progress Board\n\n| Ticket | Status | Progress | Repository | Depends on |\n| --- | --- | ---: | --- | --- |\n| TEST-01 | READY | 25% | test | - |\n| TEST-02 | READY | 25% | test | - |\n\n";
const source = ledger.replace("## Ticket List", board + "## Ticket List");
async function fixture(markdown = source) {
  const storage = new MemoryStorage(), repository = new BrowserRepository(storage, testLocks());
  const project = new FakeDirectory("project"), file = project.directory("docs").file("01_test_tickets.md", markdown);
  await repository.connect(project.handle(), "project");
  const workspaceId = (await repository.workspaces()).workspaces[0]!.id, fileId = (await repository.files(workspaceId))[0]!.id;
  const preview = (options = { assignId: true, cleanupLegacy: true }) => repository.previewMigration(workspaceId, fileId, options);
  return { repository, storage, project, file, workspaceId, fileId, preview };
}
describe("browser document migration", () => {
  it("reads each file once for cleanup without rebuilding board listings or other identities", async () => {
    const f = await fixture();
    const others = Array.from({ length: 24 }, (_, n) => f.project.file(`${n}_other_tickets.md`, ledger));
    f.file.bodyReads = 0;
    const listing = vi.spyOn(f.repository, "files");
    const plan = await f.preview();
    expect(plan.preview.decision).toBe("ready"); expect(listing).not.toHaveBeenCalled();
    expect(f.file.bodyReads).toBe(1); expect(others.every(file => file.bodyReads === 1 && file.writes === 0)).toBe(true);
    expect((await f.storage.entries("document:")).length).toBe(1);
  });
  it("only reads other headers for ID/Owner work and reads no peers when only Owner is needed", async () => {
    const f = await fixture(ledger), docs = f.project.children.get("docs") as FakeDirectory;
    const alice = docs.directory("@alice"); docs.children.delete(f.file.name); alice.children.set(f.file.name, f.file); f.file.parent = alice;
    const other = f.project.file("other.md", "# Other\n\n## Body\n" + "Large body.\n".repeat(20_000));
    const plan = await f.repository.previewMigration(f.workspaceId, f.fileId, { assignId: true, reconcileOwner: true, cleanupLegacy: true });
    expect(plan.preview.changes[0]?.after).toContain("Owner: @alice");
    expect(other.reads).toBe(1); expect(other.bodyReads).toBe(0);
    other.reads = 0;
    await f.repository.previewMigration(f.workspaceId, f.fileId, { reconcileOwner: true });
    expect(other.reads).toBe(0);
  });
  it.each(["before", "writer"])("still rejects a new generated-ID collision at %s validation", async (when) => {
    const f = await fixture(ledger), plan = await f.preview({ assignId: true, cleanupLegacy: false });
    const insert = () => f.project.file("README.md", "---\nvalue: " + "x".repeat(9_000) + `\n---\n# Index\nDocument-ID: ${plan.preview.generatedIds[plan.target.path]}\n\n## Content\n`);
    if (when === "writer") f.file.onOpen = insert; else insert();
    await expect(f.repository.applyMigration(plan)).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.writes).toBe(0); expect(f.file.content).toBe(ledger);
    expect((await f.repository.recoveries()).length).toBe(when === "writer" ? 1 : 0);
  });
  it("checks duplicate existing IDs even when a selected document otherwise needs no changes", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const f = await fixture(ledger.replace(/\n/, `\nDocument-ID: ${id}\n`));
    f.project.file("README.md", `# Copy\nDocument-ID: ${id}\n\n## Body\n`);
    const plan = await f.preview();
    expect(plan.preview.decision).toBe("blocked"); expect(plan.preview.issues[0]?.message).toContain("duplicate Document-ID");
    expect(f.file.writes).toBe(0);
  });
  it("honors ignored and separately connected folders while retaining references outside the document root", async () => {
    const f = await fixture();
    const ignored = f.project.directory("node_modules").file("reference.md", "[keep](../docs/01_test_tickets.md#progress-board)");
    const nested = f.project.directory("separate"), excluded = nested.file("reference.md", "[keep](../docs/01_test_tickets.md#progress-board)");
    await f.repository.connect(nested.handle(), "project");
    const kept = f.project.directory("guides").file("index.md", "# Index\n[keep](../docs/01_test_tickets.md#progress-board)");
    const plan = await f.preview();
    expect(plan.preview.retained.some(item => item.code === "LEGACY_REFERENCED_SECTION")).toBe(true);
    expect(ignored.reads).toBe(0); expect(excluded.reads).toBe(0); expect(kept.bodyReads).toBe(1);
  });
  it("stops when connection boundaries change during parallel reads", async () => {
    const f = await fixture(), other = f.project.file("README.md", "# Index\n");
    const getFile = other.getFile.bind(other);
    vi.spyOn(other, "getFile").mockImplementation(async () => { f.repository.invalidateListings(); return getFile(); });
    await expect(f.preview()).rejects.toMatchObject({ code: "RECONNECT_REQUIRED" });
    expect(f.file.writes).toBe(0);
  });
  it("refuses an Owner-only preview when its selected handle moved into an ignored folder", async () => {
    const f = await fixture(ledger), hidden = f.project.directory("node_modules").directory("@alice");
    f.file.parent!.children.delete(f.file.name); hidden.children.set(f.file.name, f.file); f.file.parent = hidden;
    await expect(f.repository.previewMigration(f.workspaceId, f.fileId, { reconcileOwner: true })).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    expect(f.file.writes).toBe(0);
  });
  it("previews and removes stale or extra table rows while keeping notes outside the table", async () => {
    const markdown = source.replace("| TEST-01 | READY | 25%", "| UNKNOWN-99 | TODO | 0%").replace("## Progress Board\n", "## Progress Board\n\nKeep this note.\n");
    const f = await fixture(markdown), plan = await f.preview({ assignId: false, cleanupLegacy: true });
    expect(plan.preview.decision).toBe("ready"); expect(f.file.content).toBe(markdown);
    await f.repository.applyMigration(plan);
    expect(f.file.content).not.toContain("| UNKNOWN-99 |");
    expect(f.file.content).toContain("Keep this note.");
    expect(f.file.content.slice(f.file.content.indexOf("## Ticket List"))).toBe(source.slice(source.indexOf("## Ticket List")));
  });

  it("previews without writes, matches the shared engine, applies exact bytes and retains the opaque file ID", async () => {
    const f = await fixture(); const plan = await f.preview();
    expect(plan.preview.decision).toBe("ready"); expect(f.file.writes).toBe(0);
    const pure = previewDocumentMigrations({ root: "/project", documents: [{ path: f.file.parent!.name + "/" + f.file.name, markdown: source, writable: true }], targets: [plan.target], generatedIds: plan.preview.generatedIds });
    expect(plan.preview).toEqual(pure);
    const result = await f.repository.applyMigration(plan);
    expect(result.file.id).toBe(f.fileId); expect(result.markdown).toBe(plan.preview.changes[0]!.after);
    expect((await f.preview()).preview.decision).toBe("noop"); expect(await f.repository.recoveries()).toEqual([]);
  });
  it("requires reanalysis after a new README backlink or source edit", async () => {
    const f = await fixture(), plan = await f.preview();
    f.project.file("README.md", "# Index\n[x](docs/01_test_tickets.md#progress-board)\n");
    await expect(f.repository.applyMigration(plan)).rejects.toMatchObject({ code: "STALE_FILE" });
    const revised = await f.preview();
    expect(revised.preview.decision).toBe("ready"); expect(revised.preview.issues).toEqual([]); expect(f.file.writes).toBe(0);
    expect(revised.preview.retained.some((item) => item.code === "LEGACY_REFERENCED_SECTION")).toBe(true);
    await f.repository.applyMigration(revised); expect(f.file.content).toContain("## Progress Board"); expect(f.file.content).toContain("Document-ID:");
  });
  it.each([false, true])("rejects a reviewed Owner after an external folder move with unchanged bytes and mtime (rediscovered: %s)", async (rediscovered) => {
    const original = source.replace(/\n/, "\nOwner: @previous-owner\n"), f = await fixture(original);
    const docs = f.project.children.get("docs") as FakeDirectory;
    const bob = docs.directory("@bob"), alice = bob.directory("@alice");
    docs.children.delete(f.file.name); alice.children.set(f.file.name, f.file); f.file.parent = alice;
    f.repository.invalidateListings();
    const plan = await f.repository.previewMigration(f.workspaceId, f.fileId, { assignId: true, reconcileOwner: true });
    expect(plan.preview.changes[0]!.after).toContain("Owner: @alice");
    bob.children.delete("@alice"); alice.name = "@carol"; bob.children.set(alice.name, alice);
    if (rediscovered) await f.repository.files(f.workspaceId, true);
    await expect(f.repository.applyMigration(plan)).rejects.toMatchObject({ code: rediscovered ? "STALE_FILE" : "FILE_NOT_FOUND" });
    expect(f.file.writes).toBe(0); expect(f.file.content).toBe(original);
    const revised = await f.repository.previewMigration(f.workspaceId, f.fileId, { assignId: true, reconcileOwner: true });
    expect(revised.preview.changes[0]!.after).toContain("Owner: @carol");
    await f.repository.applyMigration(revised);
    expect(f.file.content).toContain("Owner: @carol"); expect(f.file.writes).toBe(1);
  });
  it("does not guess absolute paths or silently edit another document's anchor", async () => {
    const f = await fixture(source + "\n# Progress Board\nKeep\n");
    f.project.file("README.md", "# Index\n[x](docs/01_test_tickets.md#progress-board-1)\n");
    const kept = await f.preview(); expect(kept.preview.decision).toBe("ready"); expect(kept.preview.issues).toEqual([]);
    expect(kept.preview.changes[0]!.after).toContain("## Progress Board");
    f.project.children.delete("README.md");
    f.project.file("README.md", "# Index\n[x](file:///another/checkout/docs/01_test_tickets.md#progress-board)\n");
    const cleaned = await f.preview(); expect(cleaned.preview.decision).toBe("ready"); expect(cleaned.preview.issues).toEqual([]);
    expect(cleaned.preview.changes[0]!.after).not.toContain("## Progress Board");
  });
  it("ignores unrelated link errors and later unrelated edits while saving only the selected document", async () => {
    const f = await fixture();
    const other = f.project.file("CLAUDE.md", "# Other\n[[different#section]]\n[x](file:///another/repo/doc.md#heading)\n<a href='missing.md'>x</a>\n[bad](%zz#missing)\n");
    const plan = await f.preview(); expect(plan.preview.issues).toEqual([]); expect(plan.preview.decision).toBe("ready");
    other.content += "\nAnother unrelated note."; other.mtime++;
    await f.repository.applyMigration(plan);
    expect(other.writes).toBe(0); expect(other.content).toContain("Another unrelated note.");
    expect(f.file.content).not.toContain("## Progress Board"); expect(f.file.content).toContain("Document-ID:");
    expect(f.file.content.slice(f.file.content.indexOf("## Ticket List"))).toBe(source.slice(source.indexOf("## Ticket List")));
  });
  it("does not block cleanup because another child folder is connected separately", async () => {
    const f = await fixture();
    const child = f.project.directory("child"); child.directory("docs").file("other.md", "# Child\n[[unknown]]\n");
    await f.repository.connect(child.handle(), "project");
    const plan = await f.preview(); expect(plan.preview.decision).toBe("ready"); expect(plan.preview.issues).toEqual([]);
    await f.repository.applyMigration(plan); expect(f.file.content).not.toContain("## Progress Board");
  });
  it("rechecks references after opening the writer, before writing", async () => {
    const f = await fixture(), plan = await f.preview();
    f.file.onOpen = () => f.project.file("README.md", "# New link\n[x](docs/01_test_tickets.md#progress-board)\n");
    await expect(f.repository.applyMigration(plan)).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.writes).toBe(0); expect((await f.repository.recoveries())[0]?.operation).toBe("document-migration");
  });
  it("backup failure prevents opening a writer, and stale/modified plans cannot apply", async () => {
    const f = await fixture(), plan = await f.preview();
    await expect(f.repository.applyMigration({ ...plan, preview: { ...plan.preview, changes: [] } })).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
    f.storage.failRecovery = true; await expect(f.repository.applyMigration(plan)).rejects.toThrow(); expect(f.file.opens).toBe(0);
  });
  it("keeps an uncertain write's preimage and explicitly restores only verified bytes", async () => {
    const f = await fixture(), plan = await f.preview(); f.storage.failDelete = true;
    await expect(f.repository.applyMigration(plan)).rejects.toThrow(); f.storage.failDelete = false;
    const record = (await f.repository.recoveries())[0]!;
    expect(await f.repository.recoveryStatus(record)).toBe("applied");
    await expect(f.repository.applyMigration(plan)).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
    f.file.content += "\nExternal edit";
    await expect(f.repository.restoreMigration(record, record.intendedHash)).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.content).toContain("External edit");
    f.file.content = record.intended;
    await f.repository.restoreMigration(record, record.intendedHash);
    expect(f.file.content).toBe(source); expect(await f.repository.recoveries()).toEqual([]);
  });
  it("ordinary Markdown requires explicit selection and invalid/future formats refuse changes", async () => {
    const f = await fixture(source.replace(/\n/, "\nLedger-Format: 999\n"));
    expect((await f.preview()).preview.decision).toBe("blocked"); expect(f.file.writes).toBe(0);
    const plain = f.project.file("notes.md", "# Notes\nUnchanged content\n");
    const file = (await f.repository.files(f.workspaceId, true)).find((file) => file.filename === "notes.md")!;
    expect((await f.repository.previewMigration(f.workspaceId, file.id, { assignId: true })).preview.decision).toBe("blocked");
    const plan = await f.repository.previewMigration(f.workspaceId, file.id, { assignId: true, allowPlainMarkdown: true });
    await f.repository.applyMigration(plan); expect(plain.content).toContain("Document-ID:");
  });
});
