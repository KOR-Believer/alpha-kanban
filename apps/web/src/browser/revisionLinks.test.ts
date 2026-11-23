import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { formatRevisionLink, revisionCitation, revisionWebUrl } from "@alpha-kanban/shared/revisionLinks";
import { relativeRevisionTarget, revisionRoute, revisionSource, parseRevisionRoute } from "./revisionNavigation";
import { rehypeRevisionPairs } from "./revisionPairs";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { browserLinkMappings, browserRepository } from "./repository";
import { revisionSelection, verifiedRevisionRepo } from "./revisionRepository";
import { choiceKey, updateRevisionConnection } from "./revisionConnections";
import { readHistoricalFile } from "./gitRevisionFiles";
import { inspectRepo, RepoDiscovery } from "./gitDiscovery";
import { objectFileSystem, readRevisionObject, GIT_READ_LIMIT, GIT_BLOB_STORE_LIMIT } from "./gitRevisionObject";

const target = { commit: "a5".repeat(20), repo: "github.com/example/policy", path: "docs/기준 #%.md", anchor: "L2-L4" };
const local = formatRevisionLink(target), web = revisionWebUrl(target)!;
const a = (href: string) => ({ type: "element", tagName: "a", properties: {href} });
const separator = (value: string) => ({ type: "text", value });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("one citation in a Markdown reader", () => {
  it("requires the same immutable target and the isolated separator", () => {
    const run = (left: string, join: string, right: string) => {
      const tree = { type:"root", children:[a(left), separator(join), a(right)] };
      rehypeRevisionPairs()(tree); return tree.children;
    };
    expect(run(local, " · ", web)).toEqual([{ ...a(local), properties: { href: local, dataRevisionWeb: "true" } }]);
    for (const change of [{ commit:"ba".repeat(20) }, { repo:"github.com/example/other" }, { path:"else.md" }, { anchor:"L2-L5" }]) {
      expect(run(local, " · ", revisionWebUrl({ ...target, ...change })!)).toHaveLength(3);
    }
    expect(run(local, " see also ", web)).toHaveLength(3);
    expect(run(local, " · ", "https://example.com")).toHaveLength(3);
  });
  it("keeps both labels and a usable HTTPS permalink in an ordinary Markdown renderer", () => {
    const citation = revisionCitation(target, {published:true, label:"Policy basis", webLabel:"Web original"});
    const html = renderToStaticMarkup(createElement(ReactMarkdown, {children:citation.markdown}));
    expect(html).toContain(">Policy basis</a>"); expect(html).toContain('href="' + web + '">Web original</a>');
  });
  it("round trips source ticket, nested routes and external handler substitution", () => {
    const source = "/w/demo?doc=d_a&q=a%2Fb#ticket=TEST-01&detail=side";
    const first = revisionRoute(source, target, true), current = revisionRoute(first, target, true, true);
    expect(parseRevisionRoute(first)).toEqual({target, web:true, current:false});
    expect(parseRevisionRoute(current)?.current).toBe(true);
    expect(revisionSource(current)).toBe(source);
    const comparison = revisionRoute(current, target, true, "compare");
    expect(parseRevisionRoute(comparison)).toEqual({ target, web: true, current: false, compare: true });
    expect(revisionSource(comparison)).toBe(source);
    expect(revisionRoute(comparison, target, true)).toBe(first);
    expect(parseRevisionRoute("/#revision=" + encodeURIComponent(local))?.target).toEqual(target);
    expect(parseRevisionRoute("/#revision=javascript%3Avoid")).toEqual({target:undefined, current:false, web:false});
    expect(relativeRevisionTarget(target, "../images/seal.png")).toMatchObject({ commit:target.commit, repo:target.repo, path:"images/seal.png" });
    for (const bad of ["../../x", "/tmp/a", "%2e%2e/%2e%2e/x", "%2Fa", "../.git/config", "file:///tmp/a", "https://example.com"]) expect(relativeRevisionTarget(target, bad)).toBeUndefined();
  });
});

describe("read-only revision repository selection", () => {
  it("protects a different clone selected in another tab when a stale dialog removes or replaces the previous choice", async () => {
    const storage = new MemoryStorage(), key = choiceKey("/w/source", target);
    for (const method of ["get", "set", "delete"] as const) vi.spyOn(browserRepository.storage, method).mockImplementation(storage[method].bind(storage) as never);
    vi.stubGlobal("navigator", { locks: { request: testLocks() } });
    const first = new FakeDirectory("policy").handle(), replacement = new FakeDirectory("policy").handle();
    await storage.set(key, first);
    await updateRevisionConnection(key, first, replacement);
    await expect(updateRevisionConnection(key, first)).rejects.toMatchObject({code:"changed"});
    await expect(updateRevisionConnection(key, undefined, first)).rejects.toMatchObject({code:"changed"});
    expect(await storage.get(key)).toBe(replacement);
    await updateRevisionConnection(key, replacement);
    await updateRevisionConnection(key, replacement);
    expect(await storage.get(key)).toBeUndefined();
  });
  const signal = () => new AbortController().signal;
  function linkedWorkspaces() {
    const broad = new FakeDirectory("first-workspace"), local = new FakeDirectory("source-workspace");
    for (let i = 0; i < 30; i++) broad.directory("other-" + i);
    broad.directory("unrelated").directory(".git").file("config", "");
    local.directory("evidence");
    function clone(parent: FakeDirectory, name: string) {
      const repo = parent.directory(name);
      repo.directory(".git").file("config", '[remote "origin"]\nurl = git@github.com:example/policy.git');
      return repo;
    }
    const policy = clone(local, "my-checkout");
    const grants = [broad, local].map(dir => ({ id: dir.name, name: dir.name, kind: "root" as const, handle: dir.handle() }));
    vi.spyOn(browserRepository.storage, "get").mockResolvedValue(undefined);
    vi.spyOn(browserRepository, "connections").mockResolvedValue(grants);
    vi.spyOn(browserRepository, "projectConnection").mockResolvedValue(grants[1]!);
    const discovery = new RepoDiscovery({ depth: 3, directories: 12, entries: 1000, milliseconds: 8000 });
    vi.spyOn(browserLinkMappings.discovery, "scan").mockImplementation(discovery.scan.bind(discovery));
    return { broad, local, policy, clone };
  }
  it("opens the unique remote in the source workspace even when an unrelated workspace exhausts the scan", async () => {
    const { broad, policy, clone } = linkedWorkspaces();
    const otherWorkspaceClone = clone(broad, "copy-in-another-workspace");
    const broadScan = vi.spyOn(broad, "values");
    const choice = await revisionSelection("/w/from-plan", target, signal());
    expect(choice.handle).toBe(policy);
    expect(broadScan).not.toHaveBeenCalled();
    const explicit = await revisionSelection("/w/from-plan", target, signal(), { choose: true, refresh: true });
    expect(explicit.handle).toBeUndefined();
    expect(explicit.scan?.repos.map(repo => repo.handle)).toEqual([policy, otherWorkspaceClone]);
    expect(explicit.scan?.complete).toBe(true);
  });
  it("asks when more than one clone matches or the source workspace itself was only partly searched", async () => {
    const { local, policy, clone } = linkedWorkspaces();
    const second = clone(local, "other-checkout");
    const ambiguous = await revisionSelection("/w/from-plan", target, signal());
    expect(ambiguous.handle).toBeUndefined();
    expect(ambiguous.scan?.repos.map(repo => repo.handle)).toEqual([policy, second]);
    local.children.delete(second.name);
    local.directory("one").directory("two").directory("three").directory("four");
    const partial = await revisionSelection("/w/from-plan", target, signal(), {refresh:true});
    expect(partial.handle).toBeUndefined();
    expect(partial.scan?.repos.map(repo => repo.handle)).toEqual([policy]);
  });
  it("searches other connections when the citation is elsewhere and omits unidentified folders for named remotes", async () => {
    const { local, policy, broad, clone } = linkedWorkspaces();
    local.children.delete(policy.name);
    broad.children.clear();
    broad.directory("unknown").directory(".git").file("config", "");
    const elsewhere = clone(broad, "renamed-repo");
    expect((await revisionSelection("/w/from-plan", target, signal())).handle).toBe(elsewhere);
    const absent = await revisionSelection("/w/from-plan", {...target,repo:"github.com/example/absent"}, signal(), {refresh:true});
    expect(absent.scan?.repos).toEqual([]);
    expect(absent.handle).toBeUndefined();
  });
  function fixture() {
    const root = new FakeDirectory("workspace"), main = root.directory("main"), wt = root.directory("feature");
    const common = main.directory(".git");
    common.file("config", '[remote "origin"]\nurl = git@github.com:example/policy.git');
    const admin = common.directory("worktrees").directory("feature");
    admin.file("commondir", "../.."); admin.file("gitdir", "/old/workspace/feature/.git");
    wt.file(".git", "gitdir: /old/workspace/main/.git/worktrees/feature");
    return { root, main, common, admin, wt, grant:{id:"w", name:root.name, kind:"root" as const, handle:root.handle()} };
  }
  it("checks forward and reverse pointers through the same grant and refuses inaccessible parents", async () => {
    const f = fixture();
    vi.spyOn(browserRepository, "connections").mockResolvedValue([f.grant]);
    expect((await verifiedRevisionRepo(f.wt.handle(), target, signal())).gitDirectory).toBe(f.common);
    f.admin.file("gitdir", "/foreign/workspace/feature/.git");
    await expect(verifiedRevisionRepo(f.wt.handle(), target, signal())).rejects.toThrow("accessible Git objects");
    f.wt.file(".git", "gitdir: ../main/.git/worktrees/feature");
    expect((await verifiedRevisionRepo(f.wt.handle(), target, signal())).gitDirectory).toBe(f.common);
    vi.mocked(browserRepository.connections).mockResolvedValue([]);
    await expect(verifiedRevisionRepo(f.wt.handle(), target, signal())).rejects.toThrow("accessible Git objects");
    await expect(verifiedRevisionRepo(f.main.handle(), {...target, repo:"github.com/elsewhere/p"}, signal())).rejects.toThrow("different repository");
    f.main.read = "denied";
    await expect(verifiedRevisionRepo(f.main.handle(), target, signal())).rejects.toThrow("Allow read access");
  });
  it("asks for ambiguous clones and revalidates a saved handle without prompting", async () => {
    const f = fixture(), other = fixture(), repos = await Promise.all([f, other].map(x => inspectRepo(x.grant, x.main.handle(), "main")));
    const scan = vi.spyOn(browserLinkMappings, "scan").mockResolvedValue({repos:repos.filter(x => !!x), complete:true, visited:2, reasons:[]});
    const storage = vi.spyOn(browserRepository.storage, "get").mockResolvedValue(undefined);
    expect((await revisionSelection("key", target, signal())).handle).toBeUndefined();
    scan.mockResolvedValue({repos:[repos[0]!], complete:true, visited:1, reasons:[]});
    expect((await revisionSelection("key", target, signal())).handle).toBe(f.main);
    storage.mockResolvedValue(other.main.handle());
    expect((await revisionSelection("key", target, signal())).handle).toBe(other.main);
    expect(scan).toHaveBeenCalledTimes(2);
    const aborted = new AbortController(); aborted.abort();
    await expect(revisionSelection("key", target, aborted.signal)).rejects.toMatchObject({name:"AbortError"});
  });
  it("terminates an active object worker on navigation and releases its read slot", async () => {
    const f = fixture(), terminate = vi.fn();
    let started: () => void;
    const posted = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal("window", { setTimeout }); vi.stubGlobal("location", {origin:"http://localhost"});
    vi.stubGlobal("navigator", {locks:{request: (_: string, _o: unknown, run: () => unknown) => run()}});
    vi.stubGlobal("Worker", class { terminate = terminate; postMessage() { started(); } });
    const repo = await inspectRepo(f.grant, f.main.handle(), "main");
    const controller = new AbortController(), result = readHistoricalFile(repo!, target, controller.signal);
    await posted; controller.abort();
    await expect(result).rejects.toMatchObject({ name:"AbortError" });
    expect(terminate).toHaveBeenCalledOnce();
  });
  it("caps packed input before reading its bytes, and rejects SHA-256 without guessing", async () => {
    const f = fixture(), name = "pack-" + "a".repeat(40) + ".pack";
    const pack = f.common.directory("objects").directory("pack").file(name);
    const file = await pack.getFile(); Object.defineProperty(file, "size", {value:129*1024*1024});
    vi.spyOn(pack, "getFile").mockResolvedValue(file);
    const fs = objectFileSystem(f.common.handle());
    await expect(fs.promises!.readFile("/git/objects/pack/" + name)).rejects.toThrow(GIT_READ_LIMIT);
    expect(pack.bodyReads).toBe(0);
    await expect(fs.promises!.readFile("/git/../config")).rejects.toMatchObject({code:"ENOENT"});
    await expect(readRevisionObject({} as never, fs, {...target, commit:"a".repeat(64)})).rejects.toThrow("not supported");
  });
  it("keeps the comparison available on an object limit only after proving the cited commit and file entry", async () => {
    const { commit } = target;
    const reader = {
      readCommit: vi.fn().mockResolvedValue({ oid: commit, commit: { tree: "tree" } }),
      readTree: vi.fn().mockResolvedValue({ tree: [{ path: "file.png", mode: "100644", oid: "file", type: "blob" }] }),
      readBlob: vi.fn().mockRejectedValue(new Error(GIT_READ_LIMIT)),
    };
    const read = () => readRevisionObject(reader as never, {} as never, { ...target, path: "file.png" });
    await expect(read()).rejects.toThrow(GIT_BLOB_STORE_LIMIT);
    reader.readTree.mockRejectedValueOnce(new Error(GIT_READ_LIMIT));
    await expect(read()).rejects.toThrow(GIT_READ_LIMIT);
    expect(reader.readBlob).toHaveBeenCalledTimes(1);
  });
});
