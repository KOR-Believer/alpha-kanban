import { describe, expect, it } from "vitest";
import { BrowserRepository } from "./repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browserFixtures";
import { readFileSync } from "node:fs";
import { DEFAULT_DOCUMENT_FILTERS, filterDocumentSets } from "../documentSetFiltering";
import { createDocumentSearchEntry, searchDocument } from "../documentSearch";
import { normalizeColumnFilters } from "../components/documents/documentPanelState";

const inventory = readFileSync(new URL("../../../../docs/31_alpha_kanban_smoke_inventory.md", import.meta.url), "utf8");
const [smokeSource, smokeFirstRun, smokeSecondRun] = [...inventory.matchAll(/^```md\n([\s\S]*?)^```$/gm)].map(match => match[1]!) as [string, string, string];
const smokeSourceId = "11111111-1111-4111-8111-111111111111";

async function fixture() {
  const repository = new BrowserRepository(new MemoryStorage(), testLocks());
  const project = new FakeDirectory("smoke-project"), docs = project.directory("docs"), alice = docs.directory("@alice"), bob = docs.directory("@bob");
  const source = alice.file("01_notes_smoke.md", smokeSource), first = alice.file("02_notes_smoke_run.md", smokeFirstRun);
  const second = bob.file("03_different_smoke_run.md", smokeSecondRun);
  const tickets = alice.file("04_notes_tickets.md", ledger);
  const plan = alice.file("05_notes_plan.md", "# Plan\n\nExisting plan"), inventory = alice.file("06_notes_inventory.md", "# Inventory\n\nExisting inventory");
  const plain = docs.file("readme.md", "# Plain\n\nKeep reading");
  const invalid = docs.file("07_invalid_smoke.md", "# Readable legacy\n\nMissing metadata and cases.");
  await repository.connect(project.handle(), "project");
  const workspaceId = (await repository.workspaces()).workspaces[0]!.id;
  return { repository, project, docs, alice, bob, source, first, second, tickets, plan, inventory, plain, invalid, workspaceId };
}

describe("browser smoke reading and project relationships", () => {
  it("keeps fixture Markdown available in the explorer without loading it into boards or smoke relationships", async () => {
    const f = await fixture();
    const documents = await f.repository.documentCount(f.workspaceId);
    const assetDir = "docs/@alice/assets/notes/fixtures";
    const fixtures = f.alice.directory("assets").directory("notes").directory("fixtures");
    const example = fixtures.file("999_sample_tickets.md", smokeSource);
    const sampleRun = fixtures.file("99_notes_smoke_run.md", smokeFirstRun);
    f.project.directory(".output").directory("alpha-kanban").file("04_temporary_tickets.md", ledger);
    const files = await f.repository.files(f.workspaceId, true);
    expect(files).toHaveLength(documents);
    expect(await f.repository.documentCount(f.workspaceId)).toBe(documents + 2);
    expect((await f.repository.ticketFiles(f.workspaceId)).map(file => file.filename)).toEqual([f.tickets.name]);
    const index = await f.repository.smokeIndex(f.workspaceId);
    expect(index.duplicates).toEqual([]);
    expect(index.runs).toHaveLength(2);
    expect(example.bodyReads + sampleRun.bodyReads).toBe(0);
    const entry = await f.repository.projectFiles.entry(f.workspaceId, assetDir + "/" + example.name);
    const opened = await f.repository.markdown(f.workspaceId, entry.id!);
    expect(opened.file.type).toBe("markdown");
    expect(opened.markdown).toBe(smokeSource);
    await expect(f.repository.previewMigration(f.workspaceId, entry.id!, { assignId: true })).rejects.toMatchObject({ code: "INVALID_DOCUMENT_TYPE" });
    expect(example.writes).toBe(0);
    // Reconfiguring the root must reclassify the same handle even when its bytes have not changed.
    f.project.file(".ak.config", "[documents]\nroot = contexts\n");
    expect((await f.repository.file(f.workspaceId, entry.id!)).type).toBe("tickets");
    f.project.file(".ak.config", "[documents]\nroot = docs\n");
    expect((await f.repository.file(f.workspaceId, entry.id!)).type).toBe("markdown");
  });
  it("discovers both types without changing grouping, ticket progress, ownership, full-text search or document bytes", async () => {
    const f = await fixture();
    const files = await f.repository.files(f.workspaceId);
    expect(files).toHaveLength(8);
    expect((await f.repository.ticketFiles(f.workspaceId)).map(file => file.filename)).toEqual([f.tickets.name]);
    const sets = (await f.repository.documentSets(f.workspaceId)).sets;
    const notes = sets.find(set => set.slug === "notes")!;
    expect(notes.primaryFile.type).toBe("tickets"); expect(notes.documents).toHaveLength(5);
    expect(notes.ticketProgress).toEqual((await f.repository.tickets(f.workspaceId, files.find(file => file.type === "tickets")!.id)).document.status);
    const smoke = files.find(file => file.type === "smoke" && file.slug === "notes")!;
    expect(smoke.pathOwner).toEqual({ status: "owned", value: "@alice" });
    const document = await f.repository.smoke(f.workspaceId, smoke.id);
    expect(document.document.owner).toBeNull(); expect(document.document.cases).toHaveLength(3);
    const filtered = filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS, "@alice", { name: "", directory: "", completion: "all", types: ["smoke", "smoke-run"] });
    expect(filtered.flatMap(set => set.documents).map(file => file.type).sort()).toEqual(["smoke", "smoke-run"]);
    expect(normalizeColumnFilters({ types: ["smoke", "smoke-run"] }).types).toEqual(["smoke", "smoke-run"]);
    const search = createDocumentSearchEntry(smoke, document.document.source);
    expect(searchDocument(search, "CSV 내보내기")?.documentMatch).toBe(true);
    expect(search.tickets).toEqual([]);
    const relation = await f.repository.smokeIndex(f.workspaceId);
    expect(relation.runs.map(run => run.status)).toEqual(["linked", "linked"]);
    expect(relation.definitions.find(definition => definition.localId === smoke.id)?.runLocalIds).toHaveLength(2);
    for (const file of [f.source, f.first, f.second, f.tickets, f.plan, f.inventory, f.plain, f.invalid]) expect(file.writes).toBe(0);
    expect(f.source.content).toBe(smokeSource); expect(f.first.content).toBe(smokeFirstRun); expect(f.second.content).toBe(smokeSecondRun);
  });

  it("keeps invalid documents and orphan runs readable, with old snapshots after source removal", async () => {
    const f = await fixture(); const files = await f.repository.files(f.workspaceId);
    const invalid = files.find(file => file.filename === f.invalid.name)!;
    expect((await f.repository.smoke(f.workspaceId, invalid.id)).document.valid).toBe(false);
    expect((await f.repository.markdown(f.workspaceId, invalid.id)).markdown).toBe(f.invalid.content);
    const first = files.find(file => file.filename === f.first.name)!;
    f.alice.children.delete(f.source.name);
    expect((await f.repository.smokeIndex(f.workspaceId)).runs.every(run => run.status === "orphan")).toBe(true);
    expect((await f.repository.smoke(f.workspaceId, first.id)).document.cases[0]?.revision).toBe(1);
    expect((await f.repository.documentSets(f.workspaceId)).sets.find(set => set.slug === "notes")?.primaryFile.type).toBe("tickets");
  });

  it("isolates UUID duplicates across connected projects and detects collisions with any Markdown inside this project", async () => {
    const f = await fixture();
    const other = new FakeDirectory("other-project"); const otherSource = other.directory("docs").file("01_notes_smoke.md", smokeSource);
    await f.repository.connect(other.handle(), "project");
    const reads = otherSource.bodyReads;
    expect((await f.repository.smokeIndex(f.workspaceId)).runs.every(run => run.status === "linked")).toBe(true);
    expect(otherSource.bodyReads).toBe(reads);
    f.docs.file("duplicate.md", `# Ordinary\n\nDocument-ID: ${smokeSourceId}\n\nUnrelated body`);
    const conflicted = await f.repository.smokeIndex(f.workspaceId);
    expect(conflicted.runs.every(run => run.status === "ambiguous" && run.sourceLocalId === null)).toBe(true);
    expect(conflicted.duplicates).toHaveLength(1); expect(f.source.writes).toBe(0);
  });

  it("refreshes the parsed model on external byte changes without rewriting it", async () => {
    const f = await fixture(); const file = (await f.repository.files(f.workspaceId)).find(file => file.filename === f.second.name)!;
    const before = await f.repository.smoke(f.workspaceId, file.id);
    f.second.content = f.second.content.replace("Result: PASS", "Result: FAIL");
    const after = await f.repository.smoke(f.workspaceId, file.id);
    expect(before.document.cases[0]?.result).toBe("PASS"); expect(after.document.cases[0]?.result).toBe("FAIL");
    expect(after.document.diagnostics.some(issue => issue.code === "RESULT_HISTORY_MISMATCH")).toBe(true);
    expect(f.second.writes).toBe(0);
  });

  it("does not retain cached ticket fields after a file is renamed to a smoke document", async () => {
    const f = await fixture(); const files = await f.repository.files(f.workspaceId);
    const old = files.find(file => file.type === "tickets")!;
    await f.repository.tickets(f.workspaceId, old.id);
    f.alice.children.delete(f.tickets.name); f.tickets.name = "04_renamed_smoke.md"; f.alice.children.set(f.tickets.name, f.tickets);
    const renamed = (await f.repository.files(f.workspaceId, true)).find(file => file.filename === f.tickets.name)!;
    expect(renamed.type).toBe("smoke");
    expect((await f.repository.ticketFiles(f.workspaceId))).toEqual([]);
    await f.repository.prepareDocumentSearch(renamed);
    expect((await f.repository.documentSearch.get(renamed))?.tickets).toEqual([]);
    expect((await f.repository.documentSets(f.workspaceId)).sets.every(set => !set.ticketProgress)).toBe(true);
    expect(f.tickets.writes).toBe(0);
  });
});
