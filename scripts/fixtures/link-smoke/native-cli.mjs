import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const base = import.meta.dirname;
const run = await mkdtemp(join(base, "cli-run-"));
const skill = resolve(base, "implementation-ledger/scripts");
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
Object.assign(environment, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
const results = [];
const emptyHome = join(run, "isolated-home");
await mkdir(emptyHome);
await mkdir(join(run, "no-hooks"));
async function put(file, text) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, text); }
const content = (root, file) => readFile(resolve(root, file), "utf8");
const ticketBody = "## Ticket List\n\n### SM-01. Existing evidence\n\nStatus: DONE\nProgress: 100%\nCompleted at: 2026-10-01T10:00:00+09:00\nRepository:\n\n- fixture\n\nPriority: P1\nType: Feature\nDepends on:\n\n- 없음\n\n목표:\n\n- Existing outcome.\n\n현재 문제:\n\n- Existing problem.\n\n구현 범위:\n\n- Existing scope.\n\n제외 범위:\n\n- None.\n\n완료 기준:\n\n- [x] Existing evidence.\n\n검증:\n\n- [x] Existing verification.\n\n사용자 지시:\n\n- Original direction.\n\n진행 메모:\n\n- Original evidence.\n";
const status = "\n## Status\n\n- 현재 진행률: `1 / 1 tickets`\n\n";
function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, "-c", "user.name=Smoke Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + join(run, "no-hooks"), ...args], { env: environment, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
async function project(name) {
  const root = join(run, name); await mkdir(root);
  git(root, "init", "-q", "-b", "main");
  await put(join(root, "README.md"), "# Isolated fixture\n");
  await put(join(root, ".git/info/exclude"), "/.ak.user\n");
  git(root, "add", "README.md"); git(root, "commit", "-qm", "fixture");
  return root;
}
function command(root, script, args, input) {
  const result = spawnSync(process.execPath, [join(skill, script), ...args], { cwd: root, env: environment, input: input === undefined ? undefined : JSON.stringify(input), encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
  assert.ifError(result.error); const body = JSON.parse(result.stdout);
  return { code: result.status, body, stderr: result.stderr };
}
const cli = (root, args, input) => command(root, "document-cli.mjs", args, input);
const context = (root, args = []) => command(root, "document-context.mjs", ["new", "--cwd", root, "--home", emptyHome, ...args]).body;
const move = (from, to) => ({ schema: 1, operation: "move", scope: ["docs"], moves: [{ from, to }] });
async function plan(root, request) {
  let result = cli(root, ["analyze", "--request", "-"], request);
  if (result.body.decision === "review") result = cli(root, ["analyze", "--request", "-"], { ...request, acknowledgements: result.body.issues.filter((issue) => issue.severity === "review").map((issue) => issue.fingerprint) });
  assert.equal(result.code, 0, JSON.stringify(result.body)); assert.equal(result.body.decision, "ready", JSON.stringify(result.body));
  await put(join(run, `plan-${result.body.id}.json`), JSON.stringify(result.body, null, 2));
  return result.body;
}
function apply(root, planned) {
  const result = cli(root, ["apply", "--plan", "-", "--approve", planned.id], planned);
  assert.equal(result.code, 0, JSON.stringify(result.body));
  assert.equal(result.body.persistence.fileSync, "fsync");
  assert.equal(result.body.persistence.directorySync, process.platform === "win32" ? "unavailable" : "fsync");
  assert.equal(result.body.persistence.writeThrough, process.platform === "win32");
  return result.body;
}
function recover(root, planned) { const result = cli(root, ["recover", "--id", planned.id, "--approve", planned.id]); assert.equal(result.code, 0, JSON.stringify(result.body)); }
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log("PASS", name); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error("FAIL", name, error.message); }
}

await check("no settings and home-only identity preserve basic creation", async () => {
  const root = await project("basic");
  await put(join(root, "docs/24_work_plan.md"), "# Existing work\n");
  const before = context(root, ["--base-dir", "docs"]);
  assert.equal(before.ok, true); assert.equal(before.policy.value, false); assert.equal(before.document.ownerHeader, null);
  await put(join(emptyHome, ".ak.user"), "[user]\nid = @home-user\n");
  const homeOnly = context(root, ["--base-dir", "docs"]);
  assert.equal(homeOnly.ok, true); assert.equal(homeOnly.document.ownerHeader, null); assert.equal(homeOnly.user.status, "not-needed");
  assert.equal(await content(root, "docs/24_work_plan.md"), "# Existing work\n");
});
await check("ordinary move, references, repeat and recovery preserve CRLF and other files", async () => {
  const root = await project("move"); const source = "# Work\r\n\r\n[next](b.md)\r\n";
  await put(join(root, "docs/24_한글 작업.md"), source); await put(join(root, "docs/b.md"), "# Next\n");
  const request = move("docs/24_한글 작업.md", "docs/archive/24_한글 작업.md");
  const ready = await plan(root, request); assert.equal(await content(root, request.moves[0].from), source);
  apply(root, ready); assert.equal(await content(root, request.moves[0].to), source.replace("(b.md)", "(../b.md)"));
  assert.equal(cli(root, ["verify", "--id", ready.id]).body.verified, true);
  assert.equal(cli(root, ["analyze", "--request", "-"], request).body.status, "already-applied");
  recover(root, ready); assert.equal(await content(root, request.moves[0].from), source); assert.equal(await content(root, "docs/b.md"), "# Next\n");
});
await check("adoption, handoff, return preserve number UUID and completed history", async () => {
  const root = await project("handoff");
  const original = "# Work\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\n" + status + ticketBody;
  await put(join(root, "docs/24_work_tickets.md"), original);
  for (const [from, to, intent] of [["docs/24_work_tickets.md", "docs/@alice/24_work_tickets.md", "adopt"], ["docs/@alice/24_work_tickets.md", "docs/@bob/24_work_tickets.md", "handoff"], ["docs/@bob/24_work_tickets.md", "docs/@alice/24_work_tickets.md", "handoff"]]) apply(root, await plan(root, { ...move(from, to), owner: "destination", intent }));
  assert.equal(await content(root, "docs/@alice/24_work_tickets.md"), original.replace("# Work\n", "# Work\nOwner: @alice\n"));
});
await check("manual owner mismatch is reconciled only after explicit request", async () => {
  const root = await project("reconcile");
  const original = "# Work\nOwner: @alice\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\n\n[peer](b.md)\n";
  await put(join(root, "docs/@alice/a.md"), original); await put(join(root, "docs/@alice/b.md"), "# Peer\n"); await mkdir(join(root, "docs/@bob"));
  await rename(join(root, "docs/@alice/a.md"), join(root, "docs/@bob/a.md"));
  const request = { schema: 1, operation: "reconcile", scope: ["docs"], owner: "destination", intent: "handoff", targets: [{ path: "docs/@bob/a.md", previous: { path: "docs/@alice/a.md", documentId: "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1", hash: createHash("sha256").update(original).digest("hex") } }] };
  const ready = await plan(root, request); assert.equal(await content(root, "docs/@bob/a.md"), original);
  apply(root, ready); assert.equal(await content(root, "docs/@bob/a.md"), original.replace("@alice", "@bob").replace("(b.md)", "(../@alice/b.md)"));
  recover(root, ready); assert.equal(await content(root, "docs/@bob/a.md"), original);
});
await check("Mac and Windows old paths rebase only specified docs, then restore", async () => {
  const target = await project("target-repo");
  git(target, "remote", "add", "origin", "https://example.invalid/team/product.git");
  await put(join(target, "src/한글 file.ts"), "UNCHANGED SOURCE\n");
  for (const [name, oldRoot] of [["windows", "C:/Users/bob/product"], ["mac", "/Users/alice/product"]]) {
  const root = await project("rebase-" + name);
  const original = `# PC change\n\n[source](${oldRoot}/src/%ED%95%9C%EA%B8%80%20file.ts)\n`;
  await put(join(root, "docs/paths.md"), original); await put(join(root, "docs/unselected.md"), "UNCHANGED DOCUMENT\n");
  const request = { schema: 1, operation: "rebase", scope: ["docs/paths.md"], repositories: [
    { root: "current", oldRoot: "C:/Users/bob/harness", proof: { kind: "confirmed", reason: "Known fixture source" } },
    { root: target, oldRoot, proof: { kind: "remote", url: "https://example.invalid/team/product.git" } },
  ] };
  const ready = await plan(root, request); apply(root, ready);
  assert(!/C:\/Users\/bob\/product|\/Users\/alice\/product/.test(await content(root, "docs/paths.md")));
  assert.equal(await content(root, "docs/unselected.md"), "UNCHANGED DOCUMENT\n"); assert.equal(await content(target, "src/한글 file.ts"), "UNCHANGED SOURCE\n");
  assert.equal(cli(root, ["analyze", "--request", "-"], request).body.decision, "noop"); recover(root, ready); assert.equal(await content(root, "docs/paths.md"), original);
  }
});
await check("linked worktree inherits repo identity and changes only its own checkout", async () => {
  const root = await project("main-worktree"); await put(join(root, ".ak.config"), "[documents]\nownerFolders = true\n"); await put(join(root, ".ak.user"), "[user]\nid = @alice\n");
  git(root, "add", ".ak.config"); git(root, "commit", "-qm", "policy");
  const linked = join(run, "outside-workspace"); git(root, "worktree", "add", "--detach", linked, "HEAD");
  await put(join(linked, ".ak.user"), "[user]\nid = @wrong-checkout-user\n");
  const result = context(linked); assert.equal(result.ok, true); assert.equal(result.user.value, "@alice"); assert.equal(result.document.ownerHeader, "Owner: @alice");
  await put(join(root, "docs/a.md"), "MAIN WIP\n"); await put(join(linked, "docs/a.md"), "# Linked\n");
  apply(linked, await plan(linked, { ...move("docs/a.md", "docs/@alice/a.md"), owner: "destination", intent: "adopt", actor: "current" }));
  assert.equal(await content(root, "docs/a.md"), "MAIN WIP\n"); assert.equal(await content(linked, "docs/@alice/a.md"), "# Linked\nOwner: @alice\n");
  assert.equal(git(root, "rev-parse", "HEAD"), git(linked, "rev-parse", "HEAD"));
});
await check("selected legacy cleanup preserves ticket body, unrelated errors, repeated ID and recovery", async () => {
  const root = await project("cleanup");
  const body = ticketBody;
  const original = "# Legacy work\n" + status + "## Progress Board\n\n| Ticket | Status | Progress | Repository | Depends on |\n| --- | --- | --- | --- | --- |\n| WRONG-99 | TODO | 0% | fixture | none |\n\n" + body;
  await put(join(root, "docs/24_legacy_tickets.md"), original); await put(join(root, "docs/unselected.md"), "# Other\n[missing](/other-pc/missing.md)\n");
  const request = { schema: 1, operation: "migrate", scope: ["docs"], targets: [{ path: "docs/24_legacy_tickets.md", assignId: true, cleanupLegacy: true }] };
  const ready = await plan(root, request); apply(root, ready);
  const after = await content(root, "docs/24_legacy_tickets.md"); assert(after.includes("Document-ID:")); assert(after.endsWith(body)); assert(!after.includes("WRONG-99"));
  assert.equal(cli(root, ["analyze", "--request", "-"], request).body.decision, "noop");
  assert.equal(await content(root, "docs/unselected.md"), "# Other\n[missing](/other-pc/missing.md)\n"); recover(root, ready); assert.equal(await content(root, "docs/24_legacy_tickets.md"), original);
});
await check("stale analysis refuses external changes without overwriting them", async () => {
  const root = await project("stale"); await put(join(root, "docs/a.md"), "# Initial\n"); const ready = await plan(root, move("docs/a.md", "docs/archive/a.md"));
  await put(join(root, "docs/a.md"), "# External edit\n"); const result = cli(root, ["apply", "--plan", "-", "--approve", ready.id], ready);
  assert.notEqual(result.code, 0); assert.equal(await content(root, "docs/a.md"), "# External edit\n");
});
for (const action of ["resume", "recover"]) await check(`interrupted process requires explicit unlock and ${action} preserves document contents`, async () => {
  const root = await project("interrupted-" + action), original = "# Interrupted\n\n[peer](b.md)\n";
  await put(join(root, "docs/a.md"), original); await put(join(root, "docs/b.md"), "# Peer\n");
  const ready = await plan(root, move("docs/a.md", "docs/archive/a.md"));
  const child = spawnSync(process.execPath, [join(base, "native-interrupt.mjs"), join(run, `plan-${ready.id}.json`)], { cwd: root, env: environment, encoding: "utf8", timeout: 60_000 });
  assert.ifError(child.error); assert.equal(child.status, 77, child.stderr);
  assert.equal(cli(root, ["verify", "--id", ready.id]).code, 5);
  assert.equal(cli(root, ["apply", "--plan", "-", "--approve", ready.id], ready).body.error.code, "OPERATION_LOCKED");
  const lock = cli(root, ["lock-info"]).body.lock;
  assert.equal(cli(root, ["unlock", "--token", "wrong"]).body.error.code, "LOCK_MISMATCH");
  assert.equal(cli(root, ["unlock", "--token", lock.token]).code, 0);
  const result = cli(root, [action, "--id", ready.id, "--approve", ready.id]);
  assert.equal(result.code, 0, JSON.stringify(result.body));
  assert.equal(cli(root, ["verify", "--id", ready.id]).body.verified, true);
  assert.equal(await content(root, action === "resume" ? "docs/archive/a.md" : "docs/a.md"), action === "resume" ? original.replace("(b.md)", "(../b.md)") : original);
  assert.equal(await content(root, "docs/b.md"), "# Peer\n");
});
const report = { platform: process.platform, node: process.version, time: new Date().toISOString(), run, passed: results.every((result) => result.passed), results };
await writeFile(join(base, `native-cli-${process.platform}.json`), JSON.stringify(report, null, 2) + "\n");
console.log(`${results.filter((result) => result.passed).length}/${results.length} native CLI cases passed; files retained in ${run}`);
process.exitCode = report.passed ? 0 : 1;
