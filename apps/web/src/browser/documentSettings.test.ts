import { describe, expect, it } from "vitest";
import { documentPathOwner } from "@alpha-kanban/shared/documents";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browserFixtures";

async function fixture() {
  const repository = new BrowserRepository(new MemoryStorage(), testLocks());
  const workspace = new FakeDirectory("workspace"), project = workspace.directory("project");
  const config = project.file(".ak.config", "[documents]\nroot = notes/planning\nownerFolders = false\n");
  const folder = project.directory("notes").directory("planning").directory("@bob").directory("@alice");
  const source = ledger.replace(/\n/, "\nOwner: @previous\n");
  const file = folder.file("01_test_tickets.md", source);
  const old = project.directory("docs").directory("@bob").file("02_old_tickets.md", ledger);
  project.file("README.md", "# Readme\n");
  await repository.connect(project.handle(), "project");
  const id = (await repository.workspaces()).workspaces[0]!.id;
  return { repository, workspace, project, config, folder, source, file, old, id };
}

describe("configured document roots", () => {
  it("shares path ownership across summaries, document pages and maintenance without hiding other Markdown", async () => {
    const f = await fixture(), files = await f.repository.files(f.id);
    expect(files).toHaveLength(3); expect(await f.repository.documentCount(f.id)).toBe(3);
    const current = files.find(x => x.filename === f.file.name)!;
    expect(documentPathOwner(current).value).toBe("@alice");
    expect(documentPathOwner(files.find(x => x.filename === f.old.name)!).status).toBe("unassigned");
    expect((await f.repository.tickets(f.id, current.id, false)).file.pathOwner?.value).toBe("@alice");
    const preview = await f.repository.previewMigration(f.id, current.id, { assignId: true, reconcileOwner: true, cleanupLegacy: true });
    expect(preview.preview.changes[0]!.after).toContain("Owner: @alice");
    expect(f.file.writes).toBe(0);
    await f.repository.applyMigration(preview);
    expect(f.file.content).toContain("Owner: @alice"); expect(f.file.content).toContain("Document-ID:");
    expect(f.old.writes).toBe(0); expect(f.config.writes).toBe(0);
  });

  it("reclassifies unchanged files and rejects an old preview when only the configured boundary changes", async () => {
    const f = await fixture(), files = await f.repository.files(f.id), current = files.find(x => x.filename === f.file.name)!;
    const preview = await f.repository.previewMigration(f.id, current.id, { assignId: true, reconcileOwner: true });
    f.config.content = "[documents]\nroot = docs\n"; // No Markdown mtime/hash change.
    expect((await f.repository.file(f.id, current.id)).pathOwner?.status).toBe("unassigned");
    expect((await f.repository.tickets(f.id, current.id, false)).file.pathOwner?.status).toBe("unassigned");
    expect((await f.repository.files(f.id)).find(x => x.id === current.id)?.pathOwner?.status).toBe("unassigned");
    await expect(f.repository.applyMigration(preview)).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.writes).toBe(0);
  });

  it("inherits a connected workspace per key, with direct-project and workspace discovery producing the same ownership", async () => {
    const f = await fixture();
    f.config.content = "[documents]\nownerFolders = false\n";
    f.workspace.file(".ak.config", "[documents]\nroot = notes/planning\nownerFolders = true\n");
    const privateFile = f.project.file(".ak.user", "broken"); privateFile.read = "denied";
    const connection = await f.repository.connect(f.workspace.handle(), "root");
    let files = await f.repository.files(f.id);
    const current = files.find(x => x.filename === f.file.name)!;
    expect(current.pathOwner?.value).toBe("@alice");
    const direct = (await f.repository.connections()).find(x => x.kind === "project")!;
    await f.repository.disconnect(direct.id);
    await f.repository.workspaces();
    expect((await f.repository.files(f.id)).find(x => x.id === current.id)?.pathOwner?.value).toBe("@alice");
    await f.repository.connect(f.project.handle(), "project");
    await f.repository.disconnect(connection.id);
    await f.repository.workspaces();
    files = await f.repository.files(f.id);
    expect(files.find(x => x.id === current.id)?.pathOwner?.status).toBe("unassigned");
    expect(privateFile.reads).toBe(0);
  });

  it.each(["invalid", "unreadable"])("keeps tickets and ordinary writes usable with %s settings and preserves Owner during maintenance", async kind => {
    const f = await fixture();
    if (kind === "invalid") f.config.content = "[documents]\nroot = ../outside\n";
    else f.config.read = "denied";
    const files = await f.repository.files(f.id), current = files.find(x => x.filename === f.file.name)!;
    expect(current.pathOwner?.status).toBe("invalid");
    expect((await f.repository.tickets(f.id, current.id)).document.tickets).toHaveLength(2);
    const preview = await f.repository.previewMigration(f.id, current.id, { assignId: true, reconcileOwner: true });
    expect(preview.preview.decision).toBe("ready"); expect(preview.preview.changes[0]!.after).toContain("Owner: @previous");
    expect(preview.preview.retained.some(x => x.code === "OWNER_PATH_UNRESOLVED")).toBe(true);
    await f.repository.applyMigration(preview);
    const fresh = await f.repository.file(f.id, current.id);
    await f.repository.patch(f.id, current.id, "TEST-01", { expectedHash: fresh.hash, expectedMtimeMs: fresh.mtimeMs, status: "DONE", progress: 100, reason: "Reviewed" });
    expect((await f.repository.tickets(f.id, current.id)).document.tickets[0]!.status).toBe("DONE");
    expect(f.file.content).toContain("Owner: @previous");
  });

  it("discovers and counts an explicitly configured hidden document folder", async () => {
    const f = await fixture();
    f.project.directory(".plans").directory("@alice").file("03_hidden_plan.md", "# Plan\n");
    expect(await f.repository.documentCount(f.id)).toBe(3);
    f.config.content = "[documents]\nroot = .plans\n";
    expect(await f.repository.documentCount(f.id)).toBe(4);
    const file = (await f.repository.files(f.id)).find(x => x.filename === "03_hidden_plan.md")!;
    expect(file.pathOwner?.value).toBe("@alice");
  });
});
