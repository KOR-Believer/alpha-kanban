import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { LinkMappings, type LinkContext } from "./linkMappings";
import { folderPrefixes, normalizeLink, readLinkedFile, relativeToPrefix } from "./linkPaths";
import { gitRemotes, normalizeRemote, RepoDiscovery, type GrantedRoot } from "./gitDiscovery";
import { BrowserRepository } from "./repository";

const config = (url = "git@example.com:team/product.git") => `[remote "origin"]\n url = ${url}\n`;
function repo(parent: FakeDirectory, name: string, url?: string) {
  const folder = parent.directory(name);
  const git = folder.directory(".git"); const metadata = git.file("config", config(url));
  const docs = folder.directory("docs"); const report = docs.file("report.md", "# Report\n\n## Section\nhello\n"); const next = docs.file("next.md", "# Next\n");
  return { folder, git, docs, report, next, metadata };
}
function fixture() {
  const root = new FakeDirectory("workspace"); const author = root.directory("author");
  const original = author.directory("docs").file("source.md", "[Other](file:///old/repo/docs/report.md#section)\n");
  const privateConfig = author.file(".ak.user", "private"); const agent = author.file("AGENTS.md", "private rules");
  const harness = repo(root, "harness", "https://example.com/team/harness.git");
  const target = repo(harness.folder.directory("apps").directory("deep"), "different-clone-name");
  const roots: GrantedRoot[] = [{ id: "root", name: root.name, handle: root.handle() }];
  const storage = new MemoryStorage(); const locks = testLocks();
  const service = new LinkMappings(storage, async () => roots, { lock: locks });
  const context: LinkContext = { scopeId: "source-project", label: "author", root: author.handle(), path: "docs/source.md", documentId: "d_source" };
  return { root, author, original, privateConfig, agent, harness, target, roots, storage, locks, service, context };
}

describe("portable local link paths", () => {
  it.each([
    ["file:///old/repo/docs/%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C.md#%EC%A0%9C%EB%AA%A9", "/old/repo/docs/한글 문서.md", "제목"],
    ["file://localhost/old/repo/docs/a.md", "/old/repo/docs/a.md", ""],
    ["file:/old/repo/docs/a.md", "/old/repo/docs/a.md", ""],
    ["c:\\old\\repo\\docs\\a.md", "C:/old/repo/docs/a.md", ""],
    ["file:///c:/old/repo/docs/a.md", "C:/old/repo/docs/a.md", ""],
    ["file://server/share/repo/a.md", "//server/share/repo/a.md", ""],
    ["\\\\server\\share\\repo\\a.md", "//server/share/repo/a.md", ""],
    ["../assets/report.md?view=raw#section", "./assets/report.md", "section"],
    ["../../other/docs/report.md", "./../other/docs/report.md", ""],
  ])("normalizes %s without inventing a physical root", (href, path, fragment) => {
    expect(normalizeLink(href, "docs/source.md")).toMatchObject({ path, fragment });
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "%zz.md", "file:///old/%2f/secret", "file:///../../escape", "a%00.md", "file:///old/a#%zz"])("rejects %s", (value) => {
    expect(() => normalizeLink(value, "docs/source.md")).toThrow();
  });
  it("matches complete path components and refuses a remaining parent traversal", () => {
    expect(relativeToPrefix("/old/repo2/a", "/old/repo")).toBeUndefined();
    expect(relativeToPrefix("/old/repo/../a", "/old/repo")).toBeUndefined();
    expect(relativeToPrefix("/old/repo/docs/a", "/old/repo")).toBe("docs/a");
    expect(relativeToPrefix("C:/a.md", "C:/")).toBe("a.md");
    expect(folderPrefixes("./../other/docs/a.md")).toEqual(["./../other/docs", "./../other"]);
    expect(folderPrefixes("/a.md")).toEqual(["/"]);
  });
  it("cannot use a granted handle to escape or access a sibling", async () => {
    const f = fixture();
    await expect(readLinkedFile(f.target.folder.handle(), "../../author/docs/source.md")).rejects.toMatchObject({ code: "invalid" });
    await expect(readLinkedFile(f.target.folder.handle(), "docs\\report.md")).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("conservative Git discovery", () => {
  it("normalizes transport and strips credentials, preserving forks and remote roles", () => {
    for (const value of ["git@example.com:team/product.git", "ssh://git@example.com:22/team/product.git", "https://user:secret@example.com/team/product.git"]) expect(normalizeRemote(value)).toBe("example.com/team/product");
    expect(normalizeRemote("git@work-alias:team/product.git")).toBeUndefined();
    expect(normalizeRemote("/local/repo")).toBeUndefined();
    expect(normalizeRemote("https://example.com/team/product?token=secret")).toBeUndefined();
    expect(gitRemotes(config() + '[remote "upstream"]\nurl=https://example.com/upstream/product.git')).toEqual(["origin=example.com/team/product", "upstream=example.com/upstream/product"]);
    expect(gitRemotes(config("https://example.com/fork/product.git"))).not.toEqual(gitRemotes(config()));
    expect(gitRemotes(config() + '[include]\npath=~/.gitconfig')).toEqual([]);
    expect(gitRemotes(config() + '[url "https://example.com"]\ninsteadOf=x:')).toEqual([]);
  });
  it("continues below a harness repo, deduplicates overlapping grants, skips excluded folders and never reads agent config", async () => {
    const f = fixture(); repo(f.root.directory("node_modules"), "ignored");
    const result = await f.service.scan();
    expect(result.complete).toBe(true);
    expect(result.repos.map((item) => item.label)).toEqual(["workspace/harness", "workspace/harness/apps/deep/different-clone-name"]);
    const overlapping = await new RepoDiscovery().scan([...f.roots, { id: "nested", name: "apps", handle: (f.harness.folder.children.get("apps") as FakeDirectory).handle() }]);
    expect(overlapping.repos).toHaveLength(2);
    expect([f.privateConfig.reads, f.agent.reads, f.original.writes, f.target.metadata.writes]).toEqual([0, 0, 0, 0]);
  });
  it("reads a relative gitdir/commondir inside the grant and retains inaccessible git files as unknown boundaries", async () => {
    const f = fixture();
    const wt = f.root.directory("elsewhere"); wt.file(".git", "gitdir: ../harness/.git/worktrees/feature\n");
    f.harness.git.directory("worktrees").directory("feature").file("commondir", "../..\n");
    const external = f.root.directory("outside-metadata"); external.file(".git", "gitdir: /another/grant/repo/.git\n");
    const malformed = f.root.directory("bad-metadata"); malformed.file(".git", "nonsense");
    const result = await f.service.scan();
    expect(result.repos.find((item) => item.handle.name === "elsewhere")?.remotes).toEqual(gitRemotes(config("https://example.com/team/harness.git")));
    expect(result.repos.filter((item) => ["outside-metadata", "bad-metadata"].includes(item.handle.name)).map((item) => item.remotes)).toEqual([[], []]);
  });
  it("caches discovery, refreshes explicitly, and labels bounded/denied/cancelled scans incomplete", async () => {
    const f = fixture(); const discovery = new RepoDiscovery();
    expect((await discovery.scan(f.roots)).repos).toHaveLength(2);
    repo(f.root, "new-clone");
    expect((await discovery.scan(f.roots)).repos).toHaveLength(2);
    expect((await discovery.scan(f.roots, { refresh: true })).repos).toHaveLength(3);
    expect((await new RepoDiscovery({ depth: 0, directories: 100, entries: 100, milliseconds: 5000 }).scan(f.roots)).complete).toBe(false);
    const controller = new AbortController(); controller.abort();
    expect((await discovery.scan(f.roots, { refresh: true, signal: controller.signal })).reasons).toContain("cancelled");
    f.target.folder.read = "denied";
    expect((await discovery.scan(f.roots, { refresh: true })).complete).toBe(false);
  });
});

describe("browser-only link correspondence", () => {
  it("reopens opaque document addresses with source scope, rejects removed mappings and keeps recovery data", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    const first = await f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "target" });
    const next = (await f.service.attempt(first.context, "next.md")).resource!;
    const restarted = new LinkMappings(f.storage, async () => f.roots, { lock: f.locks });
    const saved = (await restarted.document(next.context.documentId))!;
    expect((await restarted.openDocument(saved)).context.origin?.scopeId).toBe(f.context.scopeId);
    expect((await restarted.attempt(saved.context, at.path)).resource?.context.documentId).toBe(first.context.documentId);
    f.target.folder.read = "denied";
    await expect(restarted.openDocument(saved)).rejects.toMatchObject({ code: "permission" });
    f.target.folder.read = "granted";
    await restarted.remove(first.mapping!);
    await expect(restarted.openDocument(saved)).rejects.toMatchObject({ code: "changed" });
    await expect(restarted.attempt(saved.context, "report.md")).rejects.toMatchObject({ code: "changed" });
    const recovery = await restarted.reconnectDocument(saved);
    expect(recovery.attempt.location.path).toBe("/old/repo/docs/next.md");
    expect(recovery.context.scopeId).toBe(f.context.scopeId);
    expect(await restarted.document(saved.id)).toEqual(saved);
    expect(await restarted.document("ld_unknown")).toBeUndefined();
    expect(await restarted.document("/Users/private/path.md")).toBeUndefined();
  });
  it("keeps pre-page document IDs while requiring explicit recovery for a different checkout or replaced file", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    const first = await f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "target" });
    const page = (await f.service.document(first.context.documentId))!;
    await f.storage.delete("link-mapping:v1:page:" + page.id);
    expect((await f.service.attempt(f.context, at.path)).resource?.context.documentId).toBe(page.id);
    const duplicate = repo(f.root, "duplicate");
    await f.service.save(f.context, at, "/old/repo", { handle: duplicate.folder.handle(), label: "duplicate" }, first.mapping);
    await expect(f.service.openDocument(page)).rejects.toMatchObject({ code: "changed" });
    const second = (await f.service.attempt(f.context, at.path)).resource!;
    const secondPage = (await f.service.document(second.context.documentId))!;
    duplicate.docs.file("report.md", "# Replacement");
    await expect(f.service.openDocument(secondPage)).rejects.toMatchObject({ code: "changed" });
    duplicate.docs.children.delete("report.md");
    await expect(f.service.openDocument(secondPage)).rejects.toMatchObject({ code: "missing" });
  });
  it.each(["/old/product", "C:/old/product", "//server/share/product"])("proposes verified suffix paths under a differently named checkout: %s", async (old) => {
    const f = fixture(); const location = normalizeLink(old + "/docs/report.md", f.context.path);
    const target = { handle: f.target.folder.handle(), label: "different clone" };
    expect(await f.service.propose(location, target)).toEqual([{ prefix: old, relative: "docs/report.md" }]);
    f.target.folder.file("report.md", "# Another file");
    expect(await f.service.propose(location, target)).toEqual([{ prefix: old, relative: "docs/report.md" }, { prefix: old + "/docs", relative: "report.md" }]);
    expect(f.storage.records.size).toBe(0);
    expect(await f.service.propose(location, { handle: new FakeDirectory("empty").handle(), label: "empty" })).toEqual([]);
  });
  it("inherits source mappings for absolute links while resolving relative links from the current connected document", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    const opened = await f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "target" });
    const relative = (await f.service.attempt(opened.context, "next.md")).resource!;
    expect(relative.path).toBe("docs/next.md");
    expect((await f.service.attempt(relative.context, "/old/repo/docs/report.md")).resource?.context.documentId).toBe(opened.context.documentId);
    expect((await f.service.attempt({ ...f.context, scopeId: "unrelated" }, at.path)).mapping).toBeUndefined();
    const other = repo(f.root, "other");
    await f.service.save(relative.context, normalizeLink("/old/other/docs/next.md", relative.path), "/old/other", { handle: other.folder.handle(), label: "other" });
    expect(await f.service.list(f.context.scopeId)).toHaveLength(2);
  });
  it("previews and opens the same specific target without silently replacing it, and rejects overlap changes after review", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    const narrow = new FakeDirectory("narrow"); narrow.file("report.md", "# Narrow");
    const saved = await f.service.save(f.context, at, "/old/repo/docs", { handle: narrow.handle(), label: "narrow" });
    const wide = { handle: f.target.folder.handle(), label: "wide" };
    const before = f.storage.records.size;
    const preview = await f.service.preview(f.context, at, "/old/repo", wide);
    expect(preview.relative).toBe("report.md"); expect(preview.target.label).toBe("narrow");
    expect(f.storage.records.size).toBe(before);
    const opened = await f.service.save(f.context, at, "/old/repo", wide, undefined, undefined, undefined, preview);
    expect(await opened.file.text()).toBe("# Narrow");
    expect(await f.service.list()).toHaveLength(2);
    const wideMapping = (await f.service.list()).find((row) => row.prefix === "/old/repo")!;
    const reviewed = await f.service.preview(f.context, at, "/old/repo", wide, wideMapping);
    await f.service.remove(saved.mapping!);
    await expect(f.service.save(f.context, at, "/old/repo", wide, wideMapping, undefined, undefined, reviewed)).rejects.toMatchObject({ code: "changed" });
  });
  it("does not infer an unknown old path from clone names, one candidate, or an incomplete scan", async () => {
    const f = fixture(); const attempt = await f.service.attempt(f.context, "file:///old/repo/docs/report.md");
    expect(attempt.resource).toBeUndefined();
    expect(await f.service.automatic(f.context, attempt, await f.service.scan())).toBeUndefined();
    expect(await f.service.list()).toEqual([]);
  });
  it("validates and saves a chosen repo, reuses it for other links and a new service, preserves document identity and source bytes", async () => {
    const f = fixture(); const attempt = await f.service.attempt(f.context, "file:///old/repo/docs/report.md#section");
    const candidate = (await f.service.scan()).repos.find((item) => item.handle.name === f.target.folder.name)!;
    const opened = await f.service.save(f.context, attempt.location, "/old/repo", { ...candidate, repo: candidate });
    expect(opened.file.name).toBe("report.md"); expect(opened.fragment).toBe("section");
    expect(opened.context.documentId).toMatch(/^ld_/); expect(opened.context.scopeId).not.toBe(f.context.scopeId);
    const restarted = new LinkMappings(f.storage, async () => f.roots, { lock: f.locks });
    expect((await restarted.attempt(f.context, "/old/repo/docs/report.md")).resource?.context.documentId).toBe(opened.context.documentId);
    expect((await restarted.attempt(f.context, "/old/repo/docs/next.md")).resource?.file.name).toBe("next.md");
    const mapping = (await restarted.list())[0]!;
    expect(mapping.remotes).toEqual(["origin=example.com/team/product"]);
    expect(Object.keys(mapping)).not.toContain("absolutePath");
    expect(f.original.content).toBe("[Other](file:///old/repo/docs/report.md#section)\n");
    expect([f.original, f.agent, f.privateConfig, f.target.report, f.target.metadata].every((file) => file.writes === 0)).toBe(true);
  });
  it("uses project isolation, the longest prefix and no fallback when that target is missing", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    await f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "broad" });
    const specific = new FakeDirectory("specific"); specific.file("report.md", "# Specific");
    await f.service.save(f.context, at, "/old/repo/docs", { handle: specific.handle(), label: "specific" });
    expect(await (await f.service.attempt(f.context, at.path)).resource?.file.text()).toBe("# Specific");
    specific.children.delete("report.md");
    expect(await f.service.attempt(f.context, at.path)).toMatchObject({ error: { code: "missing" }, mapping: { label: "specific" } });
    expect((await f.service.attempt({ ...f.context, scopeId: "other-project" }, at.path)).resource).toBeUndefined();
    expect((await f.service.attempt(f.context, "/old/repository/docs/report.md")).mapping).toBeUndefined();
  });
  it("normalizes relative links from the source document location and keeps identical targets separate from ordinary project registration", async () => {
    const f = fixture(); const at = normalizeLink("../../missing/docs/report.md", f.context.path);
    await f.service.save(f.context, at, "./../missing", { handle: f.target.folder.handle(), label: "target" });
    expect((await f.service.attempt(f.context, "../../missing/docs/report.md")).resource?.path).toBe("docs/report.md");
    expect((await f.service.attempt({ ...f.context, path: "notes.md" }, "../missing/docs/report.md")).resource?.path).toBe("docs/report.md");
    expect((await f.service.attempt({ ...f.context, path: "deep/docs/source.md" }, "../../missing/docs/report.md")).resource).toBeUndefined();
    expect([...f.storage.records.keys()].some((key) => key.startsWith("connection:") || key.startsWith("project:"))).toBe(false);
  });
  it("automatically connects an exact accessible relative repo path using the nearest Git boundary, independent of clone name", async () => {
    const f = fixture(); const href = "../../harness/apps/deep/different-clone-name/docs/report.md";
    const at = await f.service.attempt(f.context, href);
    const scan = await f.service.scan();
    expect(await f.service.automatic(f.context, at, { ...scan, complete: false })).toBeUndefined();
    const resource = await f.service.automatic(f.context, at, scan);
    expect(resource?.mapping).toMatchObject({ prefix: "./../harness/apps/deep/different-clone-name", remotes: ["origin=example.com/team/product"], method: "git-path" });
    expect((await f.service.attempt(f.context, href)).resource?.file.name).toBe("report.md");
  });
  it("does not use a parent harness identity for an unidentified nested repo", async () => {
    const f = fixture(); f.target.metadata.content = "[include]\npath=/not/granted\n";
    const at = await f.service.attempt(f.context, "../../harness/apps/deep/different-clone-name/docs/report.md");
    expect(await f.service.automatic(f.context, at, await f.service.scan())).toBeUndefined();
  });
  it("keeps the selected checkout when duplicates exist, and requires explicit reassignment after permission loss", async () => {
    const f = fixture(); const duplicate = repo(f.root, "second-checkout");
    const at = normalizeLink("C:/old/repo/docs/report.md", f.context.path);
    const saved = await f.service.save(f.context, at, "C:/old/repo", { handle: f.target.folder.handle(), label: "chosen" });
    f.target.folder.read = "denied";
    const failure = await f.service.attempt(f.context, at.path);
    expect(failure.error?.code).toBe("permission");
    expect(await f.service.automatic(f.context, failure, await f.service.scan())).toBeUndefined();
    await expect(f.service.save(f.context, at, "C:/old/repo", { handle: duplicate.folder.handle(), label: "other" })).rejects.toMatchObject({ code: "changed" });
    const replaced = await f.service.save(f.context, at, "C:/old/repo", { handle: duplicate.folder.handle(), label: "other" }, saved.mapping);
    expect(replaced.mapping?.label).toBe("other");
    await expect(f.service.remove(saved.mapping!)).rejects.toMatchObject({ code: "changed" });
    await f.service.remove(replaced.mapping!);
    expect((await f.service.attempt(f.context, at.path)).mapping).toBeUndefined();
  });
  it("rechecks Git identity on cached selection and subsequent opens", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    const candidate = (await f.service.scan()).repos.find((item) => item.handle.name === f.target.folder.name)!;
    await f.service.save(f.context, at, "/old/repo", { ...candidate, repo: candidate });
    f.target.metadata.content = config("https://example.com/different/repo.git");
    expect((await f.service.attempt(f.context, at.path)).error?.code).toBe("changed");
    await expect(f.service.save({ ...f.context, scopeId: "new" }, at, "/old/repo", { ...candidate, repo: candidate })).rejects.toMatchObject({ code: "changed" });
  });
  it("keeps prior mappings after invalid targets, cancelled auto mapping and IDB failures", async () => {
    const f = fixture(); const at = normalizeLink("/old/repo/docs/report.md", f.context.path);
    await expect(f.service.save(f.context, at, "/old/repo", { handle: f.author.handle(), label: "wrong" })).rejects.toMatchObject({ code: "missing" });
    expect(await f.service.list()).toEqual([]);
    const saved = await f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "right" });
    const before = await f.service.list();
    const write = vi.spyOn(f.storage, "set").mockRejectedValue(new Error("quota"));
    await expect(f.service.save(f.context, at, "/old/repo", { handle: f.target.folder.handle(), label: "new" }, saved.mapping)).rejects.toMatchObject({ code: "storage" });
    expect(await f.service.list()).toEqual(before); write.mockRestore();
    const aborted = new AbortController(); aborted.abort();
    await expect(f.service.automatic(f.context, await f.service.attempt(f.context, "../../harness/apps/deep/different-clone-name/docs/report.md"), await f.service.scan(), aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(await f.service.list()).toEqual(before);
    const read = vi.spyOn(f.storage, "entries").mockRejectedValue(new Error("storage failure"));
    await expect(f.service.attempt(f.context, at.path)).rejects.toMatchObject({ code: "storage" }); read.mockRestore();
  });
  it("keeps existing project/owner identities and normal Markdown navigation intact", async () => {
    const f = fixture(); const repository = new BrowserRepository(f.storage, f.locks);
    await repository.connect(f.author.handle(), "project");
    const workspace = (await repository.workspaces()).workspaces[0]!;
    const source = (await repository.files(workspace.id)).find((item) => item.filename === "source.md")!;
    const ctx = await repository.linkContext(workspace.id, source.id);
    expect(ctx).toMatchObject({ scopeId: workspace.id, path: "docs/source.md", documentId: source.id });
    const extra = f.author.directory("extras").file("other.md", "# Local");
    const local = await repository.localResource(workspace.id, source.id, "../extras/other.md");
    expect(local.documentId).toMatch(/^d_/); expect(local.file.name).toBe(extra.name);
    const before = await repository.workspaces();
    await f.service.save(ctx, normalizeLink("/old/repo/docs/report.md", ctx.path), "/old/repo", { handle: f.target.folder.handle(), label: "target" });
    expect(await repository.workspaces()).toEqual(before);
  });
  it("isolates the A/B correspondence and discovery caches while sharing resolution behavior", async () => {
    const f = fixture();
    const a = new LinkMappings(f.storage, async () => f.roots, { experiment: { namespace: "a", autoDiscover: false }, lock: f.locks });
    const b = new LinkMappings(f.storage, async () => f.roots, { experiment: { namespace: "b", autoDiscover: true }, lock: f.locks });
    const href = "/old/repo/docs/report.md";
    expect((await a.scan()).repos).toHaveLength(0); expect((await b.scan()).repos).toHaveLength(2);
    for (const service of [a, b]) {
      expect((await service.attempt(f.context, href)).resource).toBeUndefined();
      await service.save(f.context, normalizeLink(href, f.context.path), "/old/repo", { handle: f.target.folder.handle(), label: "target" });
      expect((await service.attempt(f.context, href)).resource?.file.name).toBe("report.md");
    }
    expect((await a.list())[0]!.id).not.toBe((await b.list())[0]!.id);
    expect(await f.service.list()).toEqual([]);
    a.discovery.clear(); expect((await b.scan()).repos).toHaveLength(2);
  });
  it("records first-use versus reuse outcomes for the same A/B answers without production telemetry", async () => {
    const results: Array<Record<string, string | number>> = [];
    for (const mode of ["A", "B"]) for (const scenario of ["old-absolute", "accessible-relative"]) {
      const f = fixture();
      const service = new LinkMappings(f.storage, async () => f.roots, { experiment: { namespace: mode + scenario, autoDiscover: mode === "B" }, lock: f.locks });
      const href = scenario === "old-absolute" ? "/old/repo/docs/report.md" : "../../harness/apps/deep/different-clone-name/docs/report.md";
      const firstStart = performance.now(); const attempt = await service.attempt(f.context, href);
      const scanStart = performance.now(); const scan = await service.scan(); const scanMs = performance.now() - scanStart;
      let opened = await service.automatic(f.context, attempt, scan); let choices = 0;
      if (!opened) {
        choices++;
        const prefix = scenario === "old-absolute" ? "/old/repo" : "./../harness/apps/deep/different-clone-name";
        opened = await service.save(f.context, attempt.location, prefix, { handle: f.target.folder.handle(), label: "chosen" });
      }
      const firstMs = performance.now() - firstStart;
      expect(await opened.handle.isSameEntry(f.target.report.handle())).toBe(true);
      const reuseStart = performance.now(); const reused = await service.attempt(f.context, href); const reuseMs = performance.now() - reuseStart;
      expect(await reused.resource?.handle.isSameEntry(f.target.report.handle())).toBe(true);
      expect(choices).toBe(mode === "B" && scenario === "accessible-relative" ? 0 : 1);
      results.push({ mode, scenario, wrong: 0, unresolved: 0, firstChoices: choices, reuseChoices: 0, scanMs: +scanMs.toFixed(2), firstMs: +firstMs.toFixed(2), reuseMs: +reuseMs.toFixed(2) });
    }
    if (process.env.AKD10_AB_REPORT) writeFileSync(process.env.AKD10_AB_REPORT, JSON.stringify({ environment: "fake handles; not OS performance", results }, null, 2));
  });
});
