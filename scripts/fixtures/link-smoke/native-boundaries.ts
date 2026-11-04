import { RepoDiscovery } from "../../../apps/web/src/browser/gitDiscovery";
import { LinkMappings, type LinkedResource } from "../../../apps/web/src/browser/linkMappings";
import { IndexedDbStorage } from "../../../apps/web/src/browser/storage";

const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const status = document.getElementById("status")!;
const results = document.getElementById("results")!;
const rows: { name: string; passed: boolean; error?: string }[] = [];
let root: FileSystemDirectoryHandle;
let complete: FileSystemDirectoryHandle;
let limited: FileSystemDirectoryHandle;
async function directory(parent: FileSystemDirectoryHandle, path: string) {
  for (const part of path.split("/")) parent = await parent.getDirectoryHandle(part);
  return parent;
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function report() {
  return { environment: "Chrome native File System Access handles and IndexedDB; production service calls, not UI automation", userAgent: navigator.userAgent,
    passed: rows.length === 8 && rows.every(row => row.passed), completedCases: rows.length, plannedCases: 8, rows };
}
async function check(name: string, run: () => Promise<void>) {
  try { await run(); rows.push({ name, passed: true }); }
  catch (error) { rows.push({ name, passed: false, error: String(error) }); }
  results.textContent = JSON.stringify(report(), null, 2);
}
async function correct(resource: LinkedResource | undefined, base: FileSystemDirectoryHandle, path: string, text: string) {
  const parts = path.split("/"); const file = parts.pop()!;
  const expected = await (await directory(base, parts.join("/"))).getFileHandle(file);
  assert(resource && await resource.handle.isSameEntry(expected), "Wrong or absent file handle");
  assert((await resource.file.text()).trim() === text, "Wrong file content");
}
async function setup(base: FileSystemDirectoryHandle) {
  const roots = async () => [{ id: "native-boundary", name: base.name, handle: base }];
  const experiment = { namespace: crypto.randomUUID(), autoDiscover: true };
  const create = () => new LinkMappings(new IndexedDbStorage("alpha-kanban.native-link-boundaries.v1"), roots, { experiment });
  const service = create();
  const context = { scopeId: "source", label: "source", root: await directory(base, "source"), path: "docs/context.md", documentId: "source" };
  return { roots, service, create, context };
}
button("root").onclick = async () => {
  try {
    root = await window.showDirectoryPicker({ mode: "read" });
    complete = await directory(root, "complete"); limited = await directory(root, "limited");
    button("root").disabled = true; button("start").disabled = false; status.textContent = "준비 완료";
  } catch (error) { status.textContent = String(error); }
};
button("start").onclick = async () => {
  button("start").disabled = true; status.textContent = "검사 중";
  await check("nested unknown repo remains a boundary; relative gitdir and commondir resolve within the grant", async () => {
    const scan = await new RepoDiscovery().scan([{ id: "root", name: complete.name, handle: complete }]);
    assert(scan.complete, "Unexpected partial scan");
    const byPath = (path: string) => scan.repos.find(repo => repo.path === path);
    assert(byPath("harness")?.remotes.length, "Missing parent identity");
    assert(byPath("linked")?.remotes.join() === byPath("harness")?.remotes.join(), "Relative worktree metadata not resolved");
    assert(byPath("harness/unknown")?.remotes.length === 0, "Outside metadata inherited a parent identity");
    assert(byPath("no-remote")?.remotes.length === 0, "Missing remote was guessed");
  });
  for (const [path, text] of [["top-repo", "ROOT REPO CORRECT"], ["linked", "LINKED WORKTREE CORRECT"]]) {
    await check(`verified ${path} opens automatically and reuses its saved handle`, async () => {
      const f = await setup(complete); const href = `../../${path}/docs/guide.md`;
      const attempt = await f.service.attempt(f.context, href);
      const opened = await f.service.automatic(f.context, attempt, await f.service.scan({ preferred: f.context }));
      await correct(opened, complete, path + "/docs/guide.md", text);
      await correct((await f.create().attempt(f.context, href)).resource, complete, path + "/docs/guide.md", text);
    });
  }
  for (const [path, text] of [["harness/unknown", "UNKNOWN BOUNDARY CORRECT"], ["no-remote", "NO REMOTE CORRECT"]]) {
    await check(`${path} refuses automatic identity and permits an explicit mapping`, async () => {
      const f = await setup(complete); const href = `../../${path}/docs/guide.md`;
      const attempt = await f.service.attempt(f.context, href);
      assert(!await f.service.automatic(f.context, attempt, await f.service.scan({ preferred: f.context })), "Unexpected automatic connection");
      assert(!(await f.service.list()).length, "Refusal saved a connection");
      const opened = await f.service.save(f.context, attempt.location, "./../" + path, { handle: await directory(complete, path), label: path });
      await correct(opened, complete, path + "/docs/guide.md", text);
      await correct((await f.create().attempt(f.context, href)).resource, complete, path + "/docs/guide.md", text);
    });
  }
  await check("missing target never falls back to another repository", async () => {
    const f = await setup(complete); const attempt = await f.service.attempt(f.context, "../../top-repo/docs/missing.md");
    assert(!await f.service.automatic(f.context, attempt, await f.service.scan({ preferred: f.context })), "Missing target was guessed");
    assert(!(await f.service.list()).length, "Missing target saved a connection");
  });
  await check("production depth limit refuses automatic connection but permits explicit mapping and reuse", async () => {
    const f = await setup(limited); const href = "../../target/docs/guide.md";
    const attempt = await f.service.attempt(f.context, href); const scan = await f.service.scan({ preferred: f.context });
    assert(!scan.complete && scan.reasons.includes("depth"), "Production depth limit did not make the scan partial");
    assert(!await f.service.automatic(f.context, attempt, scan), "Partial discovery connected automatically");
    const opened = await f.service.save(f.context, attempt.location, "./../target", { handle: await directory(limited, "target"), label: "target" });
    await correct(opened, limited, "target/docs/guide.md", "LIMITED MANUAL CORRECT");
    await correct((await f.create().attempt(f.context, href)).resource, limited, "target/docs/guide.md", "LIMITED MANUAL CORRECT");
  });
  await check("cancelled discovery does not create a successful connection", async () => {
    const f = await setup(complete); const controller = new AbortController(); controller.abort();
    const scan = await f.service.scan({ preferred: f.context, signal: controller.signal });
    assert(!scan.complete && scan.reasons.includes("cancelled"), "Cancelled scan counted as complete");
    const attempt = await f.service.attempt(f.context, "../../top-repo/docs/guide.md");
    assert(!await f.service.automatic(f.context, attempt, scan), "Cancelled discovery connected automatically");
    assert(!(await f.service.list()).length, "Cancelled discovery saved a connection");
  });
  status.textContent = report().passed ? "PASS 8/8 — 실제 폴더 연결 경계 검증 완료" : "FAIL — 결과를 확인하세요";
  button("download").disabled = false;
};
button("download").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "native-link-boundaries.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
