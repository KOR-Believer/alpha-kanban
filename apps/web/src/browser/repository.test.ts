import { describe, expect, it, vi } from "vitest";
import { BrowserRepository, contentHash } from "./repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browserFixtures";
import { sortDocumentSets } from "../documentSetSorting";
import { updateTicketStatusAndProgress } from "@alpha-kanban/shared/ticketMarkdown";

async function fixture(content = ledger) {
  const storage = new MemoryStorage();
  const lock = testLocks();
  const repository = new BrowserRepository(storage, lock);
  const root = new FakeDirectory("workspace");
  const project = root.directory("project");
  const file = project.directory("docs").file("01_test_tickets.md", content);
  await repository.connect(root.handle(), "root");
  const workspaceId = (await repository.workspaces()).workspaces[0]!.id;
  const summary = (await repository.files(workspaceId))[0]!;
  const guard = { expectedHash: summary.hash, expectedMtimeMs: summary.mtimeMs };
  return { storage, lock, repository, root, project, file, workspaceId, fileId: summary.id, summary, guard };
}

describe("browser-local identity and reads", () => {
  it("persists opaque identities and reads body, hash and modification time from the same file", async () => {
    const f = await fixture();
    const second = new BrowserRepository(f.storage, f.lock);
    const read = await second.markdown(f.workspaceId, f.fileId);
    expect(read.file.absolutePath).toBeUndefined();
    expect(read.file.id).toMatch(/^d_/);
    expect(read.file.hash).toBe(await contentHash(read.markdown));
    expect(read.file.mtimeMs).toBe(f.file.mtime);
    expect((await second.files(f.workspaceId))[0]!.id).toBe(f.fileId);
    await second.select(f.workspaceId);
    expect((await f.repository.workspaces()).lastWorkspaceId).toBe(f.workspaceId);
  });

  it("deduplicates repeated connections and prefers deeper roots without changing physical document IDs", async () => {
    const f = await fixture();
    const repeated = await f.repository.connect(f.root.handle(), "root");
    expect((await f.repository.connections()).map((item) => item.id)).toEqual([repeated.id]);
    // /workspace/project becomes a root; docs is now its direct child project.
    await f.repository.connect(f.project.handle(), "root");
    const list = (await f.repository.workspaces()).workspaces;
    expect(list.map((workspace) => workspace.label)).toEqual(["docs"]);
    const files = await f.repository.files(list[0]!.id);
    expect(files.map((file) => file.id)).toEqual([f.fileId]);
    await expect(f.repository.markdown(f.workspaceId, f.fileId)).rejects.toThrow();
  });

  it("keeps equal folder names separate and excludes a nested explicit project from its parent", async () => {
    const f = await fixture();
    const otherRoot = new FakeDirectory("other");
    otherRoot.directory("project").directory("docs").file("01_test_tickets.md");
    await f.repository.connect(otherRoot.handle(), "root");
    const list = (await f.repository.workspaces()).workspaces;
    expect(new Set(list.map((workspace) => workspace.id)).size).toBe(2);
    const docs = f.project.children.get("docs") as FakeDirectory;
    await f.repository.connect(docs.handle(), "project");
    expect(await f.repository.files(f.workspaceId)).toEqual([]);
    const docsProject = (await f.repository.workspaces()).workspaces.find((item) => item.label === "docs")!;
    expect((await f.repository.files(docsProject.id))[0]!.id).toBe(f.fileId);
  });

  it("does not bind a recreated same-name folder or file to old identities", async () => {
    const f = await fixture();
    const replacement = f.project.children.get("docs") as FakeDirectory;
    replacement.file("01_test_tickets.md", ledger);
    const fresh = (await f.repository.files(f.workspaceId))[0]!;
    expect(fresh.id).not.toBe(f.fileId);
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toThrow();
    f.root.directory("project").directory("docs").file("01_test_tickets.md");
    expect((await f.repository.workspaces()).workspaces[0]!.id).not.toBe(f.workspaceId);
    await expect(f.repository.files(f.workspaceId)).rejects.toThrow();
  });

  it("shows permission loss without silently choosing a different project", async () => {
    const f = await fixture();
    f.root.read = "prompt";
    expect((await f.repository.workspaces()).workspaces[0]).toMatchObject({ id: f.workspaceId, isAvailable: false });
    await expect(f.repository.tickets(f.workspaceId, f.fileId)).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
    f.root.read = "granted";
    expect((await f.repository.files(f.workspaceId))[0]!.id).toBe(f.fileId);
  });

  it("keeps document grouping and numeric/recent ordering in the shared browser path", async () => {
    const f = await fixture();
    const docs = f.project.children.get("docs") as FakeDirectory;
    docs.children.clear();
    docs.file("1_A_plan.md", "# plan");
    docs.file("2_A_tickets.md");
    docs.file("3_B_plan.md", "# plan");
    docs.file("4_B_tickets.md");
    const inventory = docs.file("5_A_inventory.md", "# inventory");
    inventory.mtime = 10;
    const { sets } = await f.repository.documentSets(f.workspaceId);
    for (const direction of ["asc", "desc"] as const) expect(sortDocumentSets(sets, { mode: "document_order", direction })[0]!.slug).toBe("A");
    expect(sortDocumentSets(sets, { mode: "recently_updated", direction: "desc" })[0]!.slug).toBe("A");
    expect(sets[0]!.documents.map((file) => file.type)).toEqual(["plan", "tickets", "inventory"]);
    expect(sets[0]!.ticketProgress).toEqual({ doneTickets: 0, totalTickets: 2 });
    expect([...docs.children.values()].every((file) => !("writes" in file) || file.writes === 0)).toBe(true);
  });

  it("bounds links to the connected project, never resolves outside through traversal", async () => {
    const f = await fixture();
    await expect(f.repository.localResource(f.workspaceId, f.fileId, "../../secrets.md")).rejects.toMatchObject({ code: "RESOURCE_OUTSIDE_PROJECT" });
    await expect(f.repository.localResource(f.workspaceId, f.fileId, "file:///tmp/secrets.md")).rejects.toMatchObject({ code: "RESOURCE_OUTSIDE_PROJECT" });
    const resource = await f.repository.localResource(f.workspaceId, f.fileId, "./01_test_tickets.md");
    expect(resource.documentId).toBe(f.fileId);
  });

  it("checks completion across every ticket file without changing the legacy progress badge", async () => {
    const completed = ["TEST-01", "TEST-02"].reduce((markdown, id) => updateTicketStatusAndProgress(markdown, id, { status: "DONE", progress: 100 }), ledger);
    const f = await fixture(completed);
    const docs = f.project.children.get("docs") as FakeDirectory;
    const pending = docs.file("02_test_tickets.md", ledger);
    f.repository.invalidateListings();
    const first = await f.repository.documentSets(f.workspaceId);
    expect(first.sets[0]!.ticketProgress).toEqual({ doneTickets: 2, totalTickets: 2 });
    expect(first.sets[0]!.allTicketsDone).toBe(false);
    const reads = [f.file.bodyReads, pending.bodyReads];
    expect((await f.repository.documentSets(f.workspaceId)).sets[0]!.allTicketsDone).toBe(false);
    expect([f.file.bodyReads, pending.bodyReads]).toEqual(reads);
    pending.content = completed;
    pending.mtime++;
    expect((await f.repository.documentSets(f.workspaceId)).sets[0]!.allTicketsDone).toBe(true);
  });

  it("keeps metadata and progress without rereading unchanged bodies after body-cache eviction", async () => {
    const f = await fixture();
    const limited = new BrowserRepository(f.storage, f.lock, 128);
    await limited.files(f.workspaceId);
    const reads = f.file.bodyReads;
    expect((await limited.documentSets(f.workspaceId)).sets[0]!.ticketProgress).toEqual({ doneTickets: 0, totalTickets: 2 });
    await limited.files(f.workspaceId);
    expect(f.file.bodyReads).toBe(reads);
    f.file.mtime++;
    await limited.files(f.workspaceId);
    expect(f.file.bodyReads).toBe(reads + 1);
  });

  it("indexes 1,000 new documents without pairwise handle comparisons or repeated registry scans", async () => {
    const storage = new MemoryStorage();
    const entries = vi.spyOn(storage, "entries");
    const repository = new BrowserRepository(storage, testLocks());
    const project = new FakeDirectory("project");
    const files = Array.from({ length: 1000 }, (_, index) => project.file(`${index}_plan.md`, "# Plan"));
    const comparisons = files.map((file) => vi.spyOn(file, "isSameEntry"));
    await repository.connect(project.handle(), "project");
    const workspaceId = (await repository.workspaces()).workspaces[0]!.id;
    const found = await repository.files(workspaceId);
    expect(found).toHaveLength(1000);
    expect(new Set(found.map((file) => file.id)).size).toBe(1000);
    expect(comparisons.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(0);
    expect(entries.mock.calls.filter(([prefix]) => prefix === "document:")).toHaveLength(1);
    expect(files.every((file) => file.bodyReads === 1 && file.writes === 0)).toBe(true);
  });

  it("preserves identity when a document moves and renames without reusing its vacated path", async () => {
    const f = await fixture();
    const docs = f.project.children.get("docs") as FakeDirectory;
    docs.children.delete(f.file.name);
    const archive = f.project.directory("archive");
    f.file.name = "renamed_tickets.md";
    f.file.parent = archive;
    archive.children.set(f.file.name, f.file);
    docs.file("01_test_tickets.md");
    const files = await f.repository.files(f.workspaceId);
    expect(files.find((file) => file.relativePath === "archive/renamed_tickets.md")!.id).toBe(f.fileId);
    expect(files.find((file) => file.relativePath === "docs/01_test_tickets.md")!.id).not.toBe(f.fileId);
  });

  it("preserves identity when a known document moves into another project", async () => {
    const f = await fixture();
    await f.repository.ticketFiles(f.workspaceId);
    const destination = f.root.directory("destination");
    const targetDocs = destination.directory("notes");
    const docs = f.project.children.get("docs") as FakeDirectory;
    docs.children.delete(f.file.name);
    f.file.name = "moved_tickets.md";
    f.file.parent = targetDocs;
    targetDocs.children.set(f.file.name, f.file);
    const target = (await f.repository.workspaces()).workspaces.find((workspace) => workspace.label === "destination")!;
    expect((await f.repository.ticketFiles(target.id))[0]!.id).toBe(f.fileId);
    expect(await f.repository.ticketFiles(f.workspaceId)).toEqual([]);
    await expect(f.repository.tickets(f.workspaceId, f.fileId)).rejects.toThrow();
    expect((await f.repository.tickets(target.id, f.fileId)).document.tickets).toHaveLength(2);
  });

  it("reads only ticket bodies for the all-projects board while retaining docs outside docs/", async () => {
    const f = await fixture();
    const plan = f.project.file("01_test_plan.md", "# Plan");
    const inventory = f.project.file("03_test_inventory.md", "# Inventory");
    const readme = f.project.file("README.md", "# Readme");
    const ticket = f.project.directory("notes").file("extra_tickets.md");
    expect(await f.repository.ticketFiles(f.workspaceId)).toHaveLength(2);
    expect([plan, inventory, readme].map((file) => file.bodyReads)).toEqual([0, 0, 0]);
    expect(ticket.bodyReads).toBe(1);
    f.repository.invalidateListings();
    expect(await f.repository.files(f.workspaceId)).toHaveLength(5);
    expect([plan, inventory, readme].map((file) => file.bodyReads)).toEqual([1, 1, 1]);
  });

  it("checks known tickets without traversing folders; periodic and manual discovery find new files", async () => {
    const f = await fixture();
    const docs = f.project.children.get("docs") as FakeDirectory;
    const traversal = vi.spyOn(docs, "values");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      await f.repository.ticketFiles(f.workspaceId);
      expect(traversal).toHaveBeenCalledTimes(1);
      const firstReads = f.file.bodyReads;
      docs.file("new_tickets.md");
      clock.mockReturnValue(16_000);
      expect(await f.repository.ticketFiles(f.workspaceId)).toHaveLength(1);
      expect(traversal).toHaveBeenCalledTimes(1);
      expect(f.file.bodyReads).toBe(firstReads);
      f.file.content += "\nChanged outside the app.\n";
      f.file.mtime++;
      await f.repository.ticketFiles(f.workspaceId);
      expect(f.file.bodyReads).toBe(firstReads + 1);
      expect(traversal).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(61_000);
      expect(await f.repository.ticketFiles(f.workspaceId)).toHaveLength(2);
      expect(traversal).toHaveBeenCalledTimes(2);
      docs.file("manual_tickets.md");
      f.repository.invalidateListings();
      expect(await f.repository.ticketFiles(f.workspaceId)).toHaveLength(3);
      expect(traversal).toHaveBeenCalledTimes(3);
    } finally { clock.mockRestore(); }
  });

  it("refreshes the sidebar from known file metadata and separates discovery from 15-second checks", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const f = await fixture();
      const docs = f.project.children.get("docs") as FakeDirectory;
      const traversal = vi.spyOn(docs, "values");
      const firstReads = f.file.bodyReads;
      const readme = f.project.file("README.md", "# Readme");
      clock.mockReturnValue(16_000);
      expect((await f.repository.documentSets(f.workspaceId)).sets).toHaveLength(1);
      expect(traversal).not.toHaveBeenCalled();
      expect(f.file.bodyReads).toBe(firstReads);
      expect(readme.bodyReads).toBe(0);

      f.file.content = f.file.content.replace("Status: READY", "Status: DONE").replace("0 / 2 tickets", "1 / 2 tickets");
      f.file.mtime++;
      expect((await f.repository.documentSets(f.workspaceId)).sets[0]!.ticketProgress?.doneTickets).toBe(1);
      expect(f.file.bodyReads).toBe(firstReads + 1);
      expect(traversal).not.toHaveBeenCalled();

      clock.mockReturnValue(61_000);
      expect((await f.repository.documentSets(f.workspaceId)).sets).toHaveLength(2);
      expect(traversal).toHaveBeenCalledTimes(1);
      f.project.file("extra.md", "# Extra");
      f.repository.invalidateListings();
      expect((await f.repository.documentSets(f.workspaceId)).sets).toHaveLength(3);
      expect(traversal).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });

  it("opens a persisted document without waiting for pending folder discovery", async () => {
    const f = await fixture();
    const docs = f.project.children.get("docs") as FakeDirectory;
    let finish!: () => void;
    const delay = new Promise<void>((resolve) => { finish = resolve; });
    const values = docs.values.bind(docs);
    vi.spyOn(docs, "values").mockImplementation(async function* () { await delay; yield* values(); });
    f.repository.invalidateListings();
    const discovery = f.repository.documentSets(f.workspaceId);
    expect(await f.repository.file(f.workspaceId, f.fileId)).toMatchObject({ id: f.fileId });
    expect((await f.repository.tickets(f.workspaceId, f.fileId)).document.tickets).toHaveLength(2);
    finish();
    await discovery;
  });

  it("does not reuse or cache an obsolete discovery after an explicit refresh", async () => {
    const f = await fixture();
    const docs = f.project.children.get("docs") as FakeDirectory;
    let finish!: () => void;
    let started!: () => void;
    const delay = new Promise<void>((resolve) => { finish = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.spyOn(docs, "values").mockImplementationOnce(async function* () {
      const entries = [...docs.children.values()];
      started(); await delay;
      for (const entry of entries) yield entry.handle();
    });
    f.repository.invalidateListings();
    const obsolete = f.repository.files(f.workspaceId);
    await start;
    docs.file("new.md", "# New");
    f.repository.invalidateListings();
    expect(await f.repository.files(f.workspaceId)).toHaveLength(2);
    finish();
    expect(await obsolete).toHaveLength(1);
    expect(await f.repository.files(f.workspaceId)).toHaveLength(2);
  });

  it("invalidates a cached board listing when a nested project takes ownership", async () => {
    const f = await fixture();
    await f.repository.ticketFiles(f.workspaceId);
    const docs = f.project.children.get("docs") as FakeDirectory;
    await f.repository.connect(docs.handle(), "project");
    expect(await f.repository.ticketFiles(f.workspaceId)).toEqual([]);
    const nested = (await f.repository.workspaces()).workspaces.find((workspace) => workspace.label === "docs")!;
    expect((await f.repository.ticketFiles(nested.id))[0]!.id).toBe(f.fileId);
  });

  it("rediscovers immediately when a cached ticket handle disappears", async () => {
    const f = await fixture();
    await f.repository.ticketFiles(f.workspaceId);
    const docs = f.project.children.get("docs") as FakeDirectory;
    docs.children.delete(f.file.name);
    vi.spyOn(f.file, "getFile").mockRejectedValue(new DOMException("Removed", "NotFoundError"));
    expect(await f.repository.ticketFiles(f.workspaceId)).toEqual([]);
  });

  it("shares one document ID when two repository instances discover a new file together", async () => {
    const f = await fixture();
    f.project.file("new_tickets.md");
    f.repository.invalidateListings();
    const second = new BrowserRepository(f.storage, f.lock);
    const [firstFiles, secondFiles] = await Promise.all([f.repository.files(f.workspaceId), second.files(f.workspaceId)]);
    expect(firstFiles.map((file) => file.id)).toEqual(secondFiles.map((file) => file.id));
    expect(await f.storage.entries("document:")).toHaveLength(2);
  });

  it("honors a deeper connection added in another tab even before its change notification", async () => {
    const f = await fixture();
    await f.repository.ticketFiles(f.workspaceId);
    const second = new BrowserRepository(f.storage, f.lock);
    const docs = f.project.children.get("docs") as FakeDirectory;
    await second.connect(docs.handle(), "project");
    expect(await f.repository.ticketFiles(f.workspaceId)).toEqual([]);
  });
});

describe("browser-local guarded writes and recovery", () => {
  it("saves state/reason together and preserves other tickets, evidence and trailing prose", async () => {
    const f = await fixture("\uFEFF" + ledger.replaceAll("\n", "\r\n"));
    const result = await f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE", progress: 100, reason: "confirmed" });
    expect(result.document.tickets[0]).toMatchObject({ status: "DONE", progress: 100 });
    expect(result.document.tickets[0]!.completedAt).toBeTruthy();
    expect(f.file.content).toContain("1 / 2 tickets");
    expect(f.file.content).toContain("confirmed");
    expect(f.file.content).toContain("Keep this unknown section.");
    expect(f.file.content.startsWith("\uFEFF")).toBe(true);
    expect(f.file.content.replaceAll("\r\n", "")).not.toContain("\n");
    const reopened = await f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { expectedHash: result.file.hash, expectedMtimeMs: result.file.mtimeMs, status: "TODO", progress: 0, reason: "" });
    expect(reopened.document.tickets[0]!.completedAt).toBeUndefined();
    expect(f.file.content).toContain("[x] old evidence");
    expect(f.file.content).toContain("old note");
    expect(f.file.content).toContain("사용자가 명시적으로");
    expect(reopened.document.tickets[1]!.status).toBe("READY");
    expect(await f.repository.recoveries()).toEqual([]);
  });

  it("rejects a hash change even when size and mtime are unchanged", async () => {
    const f = await fixture();
    f.file.content = f.file.content.replace("old direction", "new direction");
    await expect(f.repository.append(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, kind: "manual", text: "new" })).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.opens).toBe(0);
  });

  it("fails closed if permission or durable recovery storage is unavailable", async () => {
    const f = await fixture();
    f.file.write = "denied";
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
    f.file.write = "granted"; f.storage.failRecovery = true;
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toThrow("Quota");
    expect(f.file.opens).toBe(0);
    expect(f.file.content).toBe(ledger);
  });

  it("detects changes after the first freshness check and leaves a reviewable recovery copy", async () => {
    const f = await fixture();
    f.file.onOpen = () => { f.file.content += "External work"; f.file.mtime++; };
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toMatchObject({ code: "STALE_FILE" });
    expect(f.file.writes).toBe(0);
    const recovery = (await f.repository.recoveries())[0]!;
    expect(recovery.before).toBe(ledger);
    expect(recovery.intended).toContain("Status: DONE");
    expect(await f.repository.recoveryStatus(recovery)).toBe("different");
  });

  it.each(["close", "readback", "storage cleanup", "external write after close"])("preserves uncertain %s results across reload and prevents duplicate append", async (failure) => {
    const f = await fixture();
    if (failure === "close") f.file.failClose = true;
    if (failure === "readback") f.file.failAfterClose = true;
    if (failure === "storage cleanup") f.storage.failDelete = true;
    if (failure === "external write after close") f.file.onClose = () => { f.file.content += "External work"; };
    await expect(f.repository.append(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, kind: "manual", text: "ONE direction" })).rejects.toThrow();
    const afterReload = new BrowserRepository(f.storage, f.lock);
    expect(await afterReload.recoveries()).toHaveLength(1);
    await expect(afterReload.append(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, kind: "manual", text: "ONE direction" })).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
    expect((f.file.content.match(/ONE direction/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("serializes two tabs sharing one physical file and rejects the stale second writer", async () => {
    const f = await fixture();
    const otherTab = new BrowserRepository(f.storage, f.lock);
    const jobs = await Promise.allSettled([
      f.repository.append(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, kind: "manual", text: "first" }),
      otherTab.append(f.workspaceId, f.fileId, "TEST-02", { ...f.guard, kind: "manual", text: "second" }),
    ]);
    expect(jobs.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(f.file.writes).toBe(1);
    expect(f.file.content).toContain("[수동지시] first");
    expect(f.file.content).not.toContain("[수동지시] second");
  });

  it("checks the current file again before clearing a recovery record", async () => {
    const f = await fixture(); f.file.failClose = true;
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toThrow();
    const recovery = (await f.repository.recoveries())[0]!;
    expect(await f.repository.recoveryStatus(recovery)).toBe("unchanged");
    f.file.content += "changed";
    await expect(f.repository.dismissRecovery(recovery, f.guard.expectedHash)).rejects.toMatchObject({ code: "STALE_FILE" });
    await f.repository.dismissRecovery(recovery, await contentHash(f.file.content));
    expect(await f.repository.recoveries()).toEqual([]);
  });

  it("stores global card order independently and rejects stale tab updates without Markdown writes", async () => {
    const f = await fixture();
    const other = new BrowserRepository(f.storage, f.lock);
    const original = await other.boardOrder();
    await f.repository.saveBoardOrder({ keys: ["a", "b", "inaccessible"] }, original);
    await expect(other.saveBoardOrder({ keys: ["b", "a"] }, original)).rejects.toMatchObject({ code: "STALE_ORDER" });
    expect((await other.boardOrder()).keys).toEqual(["a", "b", "inaccessible"]);
    expect(f.file.writes).toBe(0);
    expect(f.file.mtime).toBe(1);
  });

  it("keeps recovery attached to the physical document after a deeper root changes its project", async () => {
    const f = await fixture(); f.file.failClose = true;
    await expect(f.repository.patch(f.workspaceId, f.fileId, "TEST-01", { ...f.guard, status: "DONE" })).rejects.toThrow();
    const recovery = (await f.repository.recoveries())[0]!;
    await f.repository.connect(f.project.handle(), "root");
    const nested = (await f.repository.workspaces()).workspaces[0]!;
    await f.repository.files(nested.id);
    expect(await f.repository.recoveryStatus(recovery)).toBe("unchanged");
    expect((await f.repository.recoveryDocument(recovery)).file.workspaceId).toBe(nested.id);
    await f.repository.dismissRecovery(recovery, f.guard.expectedHash);
    expect(await f.repository.recoveries()).toEqual([]);
  });
});
