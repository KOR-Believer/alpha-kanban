import { describe, expect, it } from "vitest";
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
    expect((await f.preview()).preview.decision).toBe("blocked"); expect(f.file.writes).toBe(0);
    const idOnly = await f.preview({ assignId: true, cleanupLegacy: false });
    await f.repository.applyMigration(idOnly); expect(f.file.content).toContain("## Progress Board");
  });
  it("does not guess absolute paths or silently edit another document's anchor", async () => {
    const f = await fixture(source + "\n# Progress Board\nKeep\n");
    f.project.file("README.md", "# Index\n[x](docs/01_test_tickets.md#progress-board-1)\n");
    expect((await f.preview()).preview.issues.map((i) => i.code)).toContain("OUTSIDE_WRITE_SCOPE");
    f.project.children.delete("README.md");
    f.project.file("README.md", "# Index\n[x](file:///another/checkout/docs/01_test_tickets.md#progress-board)\n");
    expect((await f.preview()).preview.issues.map((i) => i.code)).toContain("ABSOLUTE_REFERENCE_UNVERIFIED");
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
