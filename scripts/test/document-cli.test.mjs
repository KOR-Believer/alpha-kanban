import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access, stat, rename, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { sha } from "../lib/document-fs.mjs";
import { inspectReferences, applyReferenceEdits, referenceTargets } from "../../packages/shared/src/documentReferences.mjs";
import { previewDocumentMetadata } from "../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";
import { makeFixture, moveRequest, gitTest, put } from "./document-fixtures.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cliFile = process.env.AK_TEST_CLI_PATH ?? path.join(repoRoot, "scripts/document-cli.mjs");
const transactionFile = pathToFileURL(path.join(repoRoot, "scripts/lib/document-transaction.mjs")).href;
const missing = file => assert.rejects(access(file), { code: "ENOENT" });
function cli(f, args, input) {
  const result = spawnSync(process.execPath, [cliFile, ...args], { cwd: f.root, input: input === undefined ? undefined : typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });
  assert.ifError(result.error); assert.equal(result.stderr, "");
  return { code: result.status, body: JSON.parse(result.stdout) };
}
function analyze(f, request) { return cli(f, ["analyze", "--request", "-"], request); }
function approved(f, request) {
  const first = analyze(f, request);
  assert.equal(first.code, 3, JSON.stringify(first.body));
  const ready = analyze(f, { ...request, acknowledgements: first.body.issues.filter(issue => issue.severity === "review").map(issue => issue.fingerprint) });
  assert.equal(ready.code, 0, JSON.stringify(ready.body)); assert.equal(ready.body.decision, "ready");
  return ready.body;
}
function apply(f, plan) { return cli(f, ["apply", "--plan", "-", "--approve", plan.id], plan); }
function verify(f, id) { return cli(f, ["verify", "--id", id]); }
function recover(f, id) { return cli(f, ["recover", "--id", id, "--approve", id]); }

test("nested Owner maintenance previews, applies, verifies and rolls back only the selected document without identity settings", async t => {
  const f = await makeFixture(t), file = "docs/@bob/archive/@alice/24_work_plan.md";
  const id = "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1";
  const source = `\uFEFF# Work\r\nOwner: @previous-owner\r\nDocument-ID: ${id}\r\n\r\n## Goal\r\n[Old PC](file:///other/pc/missing.md)\r\n`;
  const outer = "# Outer\nOwner: @bob\n\n## Goal\nKeep\n";
  await f.put(file, source); await f.put("docs/@bob/24_other_plan.md", outer);
  const request = { schema: 1, operation: "migrate", scope: ["docs"], targets: [{ path: file, assignId: true, cleanupLegacy: true, reconcileOwner: true }] };
  const analysis = analyze(f, request); assert.equal(analysis.code, 0, JSON.stringify(analysis.body));
  const plan = analysis.body; assert.equal(plan.decision, "ready"); assert.equal(plan.actor, null);
  assert.equal(plan.changes.length, 1); assert.equal(plan.changes[0].ownership.afterOwner, "@alice");
  assert.equal(await readFile(path.join(f.root, file), "utf8"), source);
  assert.equal(apply(f, plan).code, 0);
  assert.equal(await readFile(path.join(f.root, file), "utf8"), source.replace("Owner: @previous-owner", "Owner: @alice"));
  assert.equal(await readFile(path.join(f.root, "docs/@bob/24_other_plan.md"), "utf8"), outer);
  assert.equal(verify(f, plan.id).body.verified, true); assert.equal(analyze(f, request).body.decision, "noop");
  await missing(path.join(f.root, ".ak.config")); await missing(path.join(f.root, ".ak.user"));
  assert.equal(recover(f, plan.id).code, 0); assert.equal(await readFile(path.join(f.root, file), "utf8"), source);

  const invalid = "docs/@bob/@/24_work_plan.md";
  await f.put(invalid, source.replace(`Document-ID: ${id}\r\n`, ""));
  const kept = analyze(f, { ...request, targets: [{ path: invalid, assignId: true, reconcileOwner: true }] });
  assert.equal(kept.code, 0, JSON.stringify(kept.body));
  assert.equal(kept.body.migration.retained[0].code, "OWNER_PATH_UNRESOLVED");
  assert.equal(apply(f, kept.body).code, 0);
  const after = await readFile(path.join(f.root, invalid), "utf8");
  assert.ok(after.includes("Owner: @previous-owner\r\n")); assert.ok(after.includes("Document-ID:"));
});

test("handoff into a nested owner requires explicit intent and checks the nearest destination against the current actor", async t => {
  const f = await makeFixture(t), from = "docs/@bob/a.md", to = "docs/@bob/archive/@alice/a.md";
  const source = "# Work\nOwner: @bob\n\n## Goal\nKeep\n";
  await f.put(from, source); await f.put(".ak.user", "[user]\nid = @bob\n");
  const request = { ...moveRequest(from, to), owner: "destination" };
  assert.equal(analyze(f, request).body.error.code, "OWNERSHIP_INTENT_REQUIRED");
  assert.equal(analyze(f, { ...request, intent: "handoff", actor: "current" }).body.error.code, "ACTOR_DESTINATION_MISMATCH");
  assert.equal(await readFile(path.join(f.root, from), "utf8"), source);
  await f.put(".ak.user", "[user]\nid = @alice\n");
  const plan = approved(f, { ...request, intent: "handoff", actor: "current" });
  assert.equal(plan.changes[0].ownership.afterPathOwner, "@alice");
  assert.equal(apply(f, plan).code, 0); assert.equal(verify(f, plan.id).body.verified, true);
  assert.equal(await readFile(path.join(f.root, to), "utf8"), source.replace("Owner: @bob", "Owner: @alice"));
});

test("moving an outer owner directory preserves the independent nested owner's identity", async t => {
  const f = await makeFixture(t), inner = "# Inner\nOwner: @alice\n\n## Goal\nKeep\n";
  await f.put("docs/@bob/a.md", "# Outer\nOwner: @bob\n"); await f.put("docs/@bob/archive/@alice/b.md", inner);
  const plan = approved(f, { ...moveRequest("docs/@bob", "docs/@carol"), owner: "destination", intent: "handoff" });
  assert.equal(apply(f, plan).code, 0); assert.equal(verify(f, plan.id).body.verified, true);
  assert.equal(await readFile(path.join(f.root, "docs/@carol/archive/@alice/b.md"), "utf8"), inner);
  assert.equal(await readFile(path.join(f.root, "docs/@carol/a.md"), "utf8"), "# Outer\nOwner: @carol\n");
});

test("migration previews legacy guides, templates and stale boards, applies the reviewed ID and restores the original", async t => {
  const f = await makeFixture(t), file = "docs/02_legacy_tickets.md";
  const source = (await readFile(path.join(repoRoot, "docs/02_alpha_kanban_tickets.md"), "utf8"))
    .replace("| AKB-00 | DONE | 100%", "| OLD-77 | TODO | 0%")
    .replace(/^\| AKB-01 \|.*\n/m, "")
    .replace("Status: DONE", "Status: WATCH").replace("Progress: 100%", "Progress: 80%")
    .replace("## Progress Board\n", "## Progress Board\n\nKeep this note.\n");
  await f.put(file, source);
  const unrelated = "# Other\n[[unrelated#section]]\n[x](file:///other/checkout/missing.md#heading)\n";
  await f.put("README.md", unrelated);
  const request = { schema: 1, operation: "migrate", scope: ["docs"], targets: [{ path: file, assignId: true, cleanupLegacy: true }] };
  const analysis = analyze(f, request); assert.equal(analysis.code, 0, JSON.stringify(analysis.body.issues));
  const plan = analysis.body; assert.equal(plan.decision, "ready");
  assert.equal(await readFile(path.join(f.root, file), "utf8"), source);
  assert.equal(apply(f, plan).code, 0);
  const after = await readFile(path.join(f.root, file), "utf8");
  assert.equal(after, plan.changes[0].diff.after);
  assert.ok(after.includes(plan.migration.generatedIds[file]));
  assert.ok(after.includes("Keep this note.")); assert.ok(!after.includes("| OLD-77 |"));
  for (const section of ["티켓 상태", "Progress 기준", "Ticket Template"]) assert.ok(!after.includes(`## ${section}\n`));
  assert.ok(after.includes("Status: WATCH")); assert.ok(after.includes("Progress: 80%"));
  assert.equal(after.slice(after.indexOf("## Ticket List")), source.slice(source.indexOf("## Ticket List")));
  assert.equal(await readFile(path.join(f.root, "README.md"), "utf8"), unrelated);
  assert.equal(verify(f, plan.id).body.verified, true);
  assert.equal(analyze(f, request).body.decision, "noop");
  assert.equal(recover(f, plan.id).code, 0);
  assert.equal(await readFile(path.join(f.root, file), "utf8"), source);
});

test("JSON-only analyze/apply/verify and repeated requests work without config, Owner or document IDs", async t => {
  const f = await makeFixture(t), source = "# 메모\r\n\r\n[b](b.md#section)\r\n";
  await f.put("docs/빈 번호 24.md", source); await f.put("docs/b.md", "# B\n\n[back](%EB%B9%88%20%EB%B2%88%ED%98%B8%2024.md)\n");
  const request = moveRequest("docs/빈 번호 24.md", "docs/archive/빈 번호 24.md");
  const beforeGit = await readdir(path.join(f.root, ".git"));
  const plan = approved(f, request);
  assert.equal(await readFile(path.join(f.root, request.moves[0].from), "utf8"), source);
  assert.deepEqual(await readdir(path.join(f.root, ".git")), beforeGit);
  assert.equal(plan.actor, null); assert.equal(apply(f, plan).code, 0);
  const after = await readFile(path.join(f.root, request.moves[0].to), "utf8");
  assert.equal(after, source.replace("(b.md", "(../b.md"));
  assert.equal(verify(f, plan.id).body.verified, true);
  assert.equal(apply(f, plan).body.status, "completed");
  const beforeStat = await stat(path.join(f.root, request.moves[0].to));
  assert.equal(analyze(f, request).body.status, "already-applied");
  assert.equal((await stat(path.join(f.root, request.moves[0].to))).mtimeMs, beforeStat.mtimeMs);
  assert.equal(cli(f, ["list"]).body.operations.length, 1);
  await missing(path.join(f.root, ".ak.config")); await missing(path.join(f.root, ".ak.user"));
  assert.equal(recover(f, plan.id).body.status, "rolled-back");
  assert.equal(await readFile(path.join(f.root, request.moves[0].from), "utf8"), source);
  assert.equal(verify(f, plan.id).code, 0);
});

test("unrelated invalid personal settings are not consulted for ordinary moves", async t => {
  const f = await makeFixture(t); await f.put("docs/a.md", "# A\n");
  await f.put(".ak.user", "invalid personal setting\n"); await f.put(".ak.config", "invalid unrelated setting\n");
  assert.equal(apply(f, approved(f, moveRequest())).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/nested/a.md"), "utf8"), "# A\n");
});

test("explicit adoption, colleague handoff and return preserve UUID, ticket history and numbers", async t => {
  const f = await makeFixture(t), id = "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1";
  const source = `# Work\nDocument-ID: ${id}\n\n## Status\n\n- 현재 진행률: \`1 / 1 tickets\`\n\n## Ticket List\n\n### EX-01. Task\n\nStatus: DONE\nProgress: 100%\nCompleted at: 2026-10-01T10:00:00+09:00\nRepository:\n\n- fixture\n\nPriority: P1\nType: Feature\nDepends on:\n\n- 없음\n\n목표:\n\n- Goal\n\n현재 문제:\n\n- Original problem\n\n구현 범위:\n\n- Original scope\n\n제외 범위:\n\n- None\n\n완료 기준:\n\n- [x] Existing evidence\n\n검증:\n\n- [x] Original verification\n\n사용자 지시:\n\n- Keep\n\n진행 메모:\n\n- Original result\n`;
  await f.put("docs/24_work_tickets.md", source);
  await f.put(".ak.config", "[documents]\nownerFolders = false\n");
  await f.put("docs/@alice/24_other.md", "# Same number, different file\n");
  const adoption = approved(f, { ...moveRequest("docs/24_work_tickets.md", "docs/@alice/24_work_tickets.md"), owner: "destination", intent: "adopt" });
  assert.equal(apply(f, adoption).code, 0);
  const owned = source.replace("# Work\n", "# Work\nOwner: @alice\n");
  assert.equal(await readFile(path.join(f.root, "docs/@alice/24_work_tickets.md"), "utf8"), owned);
  const handoff = approved(f, { ...moveRequest("docs/@alice/24_work_tickets.md", "docs/@bob/24_work_tickets.md"), owner: "destination", intent: "handoff" });
  assert.equal(apply(f, handoff).code, 0);
  const returned = approved(f, { ...moveRequest("docs/@bob/24_work_tickets.md", "docs/@alice/24_work_tickets.md"), owner: "destination", intent: "handoff" });
  assert.equal(apply(f, returned).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/@alice/24_work_tickets.md"), "utf8"), owned);
  assert.equal(await readFile(path.join(f.root, "docs/@alice/24_other.md"), "utf8"), "# Same number, different file\n");
  assert.equal(recover(f, returned.id).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/@bob/24_work_tickets.md"), "utf8"), owned.replace("@alice", "@bob"));
});

test("already-moved reconciliation fixes references once; owner registration needs neither UUID issuance nor another move", async t => {
  const f = await makeFixture(t), id = "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1";
  const original = `# A\nOwner: @alice\nDocument-ID: ${id}\n\n[b](b.md)\n`;
  await f.put("docs/@alice/a.md", original); await f.put("docs/@alice/b.md", "# B\n[a](a.md)\n");
  await mkdir(path.join(f.root, "docs/@bob")); await rename(path.join(f.root, "docs/@alice/a.md"), path.join(f.root, "docs/@bob/a.md"));
  const request = { schema: 1, operation: "reconcile", scope: ["docs"], owner: "destination", intent: "handoff", targets: [{ path: "docs/@bob/a.md", previous: { path: "docs/@alice/a.md", documentId: id, hash: sha(original) } }] };
  const plan = approved(f, request); assert.ok(plan.changes.every(change => change.from === change.to));
  assert.equal(apply(f, plan).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/@bob/a.md"), "utf8"), original.replace("Owner: @alice", "Owner: @bob").replace("(b.md)", "(../@alice/b.md)"));
  assert.equal(analyze(f, request).body.status, "already-applied");
  assert.equal(recover(f, plan.id).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/@bob/a.md"), "utf8"), original);
  await missing(path.join(f.root, "docs/@alice/a.md"));
  await f.put("docs/@bob/legacy.md", "# Legacy\n\nEvidence\n");
  const register = { schema: 1, operation: "reconcile", scope: ["docs/@bob/legacy.md"], owner: "destination", intent: "adopt", targets: [{ path: "docs/@bob/legacy.md", placement: "confirmed-in-place" }] };
  assert.equal(apply(f, approved(f, register)).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/@bob/legacy.md"), "utf8"), "# Legacy\nOwner: @bob\n\nEvidence\n");
  assert.equal(analyze(f, register).body.decision, "noop");
});

test("PC rebasing rewrites only selected docs using verified repo roots and is unchanged on repetition", async t => {
  const f = await makeFixture(t), external = await makeFixture(t);
  await external.put("src/한글 file.ts", "unpushed content\n");
  gitTest(external.root, "remote", "add", "origin", "git@example.invalid:team/external.git");
  const original = '# PC\n\n[absolute](C:/old/other/src/한글%20file.ts#L1)\n[file](file:///C:/old/other/src/%ED%95%9C%EA%B8%80%20file.ts?q=1)\n[relative](../../other/src/한글%20file.ts)\n';
  await f.put("docs/a.md", original); await f.put("docs/unselected.md", "# Unchanged\n");
  const request = { schema: 1, operation: "rebase", scope: ["docs/a.md"], repositories: [
    { root: "current", oldRoot: "C:/old/main", proof: { kind: "confirmed", reason: "Confirmed previous document checkout root" } },
    { root: external.root, oldRoot: "C:/old/other", proof: { kind: "remote", url: "https://example.invalid/team/external.git" } },
  ] };
  const plan = approved(f, request); assert.equal(plan.changes.length, 1); assert.equal(plan.actor, null);
  assert.equal(apply(f, plan).code, 0); assert.equal(verify(f, plan.id).code, 0);
  const result = await readFile(path.join(f.root, "docs/a.md"), "utf8");
  assert.ok(!result.includes("C:/old/")); assert.ok(!result.includes("Owner:")); assert.ok(!result.includes("Document-ID:"));
  assert.equal(analyze(f, request).body.decision, "noop");
  assert.equal(await readFile(path.join(external.root, "src/한글 file.ts"), "utf8"), "unpushed content\n");
  assert.equal(await readFile(path.join(f.root, "docs/unselected.md"), "utf8"), "# Unchanged\n");
  assert.equal(recover(f, plan.id).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), original);
});

test("detached worktree inherits actor but writes only its own docs and rejects later identity changes", async t => {
  const f = await makeFixture(t);
  await f.put(".git/info/exclude", "/.ak.user\n"); await f.put(".ak.user", "[user]\nid = @alice\n");
  await f.put("docs/a.md", "# Main worktree WIP\n");
  const linked = path.join(f.base, "detached"); gitTest(f.root, "worktree", "add", "--detach", linked, "HEAD");
  await put(path.join(linked, "docs/a.md"), "# Detached WIP\n");
  const child = { ...f, root: linked };
  const request = { ...moveRequest("docs/a.md", "docs/@alice/a.md"), owner: "destination", intent: "adopt", actor: "current" };
  const plan = approved(child, request);
  assert.equal(plan.actor.user.value, "@alice"); assert.equal(plan.actor.user.source.scope, "repo");
  await f.put(".ak.user", "[user]\nid = @bob\n");
  assert.equal(apply(child, plan).body.error.code, "ACTOR_DESTINATION_MISMATCH");
  await f.put(".ak.user", "[user]\nid = @alice\n");
  assert.equal(apply(child, plan).code, 0);
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# Main worktree WIP\n");
  assert.equal(await readFile(path.join(linked, "docs/@alice/a.md"), "utf8"), "# Detached WIP\nOwner: @alice\n");
  assert.equal(apply(f, plan).body.error.code, "WORKTREE_CHANGED");
  assert.equal(gitTest(f.root, "rev-parse", "HEAD"), gitTest(linked, "rev-parse", "HEAD"));
});

test("CLI errors distinguish malformed input, pending review, blocked targets and unauthorized/tampered plans", async t => {
  const f = await makeFixture(t); await f.put("docs/a.md", "# A\n[x](missing.md)\n");
  assert.equal(cli(f, ["analyze", "--request", "-"], "{").code, 2);
  assert.equal(cli(f, ["analyze", "--request", "-", "--checkout", "other"], moveRequest()).code, 2);
  assert.equal(analyze(f, { ...moveRequest(), repositories: 1 }).code, 2);
  assert.equal(analyze(f, moveRequest()).code, 4);
  await f.put("docs/a.md", "# A\n");
  const first = analyze(f, moveRequest()); assert.equal(first.code, 3);
  assert.equal(apply(f, first.body).body.error.code, "PLAN_NOT_READY");
  const plan = approved(f, moveRequest());
  assert.equal(cli(f, ["apply", "--plan", "-", "--approve", "incorrect"], plan).body.error.code, "APPROVAL_REQUIRED");
  assert.equal(apply(f, { ...plan, changes: [] }).body.error.code, "PLAN_CHANGED");
  assert.equal(cli(f, ["verify", "--id", "bad"]).code, 2);
  assert.equal(cli(f, ["--help"]).body.exits.recoveryRequired, 5);
  await missing(path.join(f.root, "docs/nested"));
});

for (const action of ["resume", "recover"]) test(`a terminated native process retains a durable journal; explicit unlock and ${action} work in a new process`, async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n[b](b.md)\n"); await f.put("docs/b.md", "# B\n[a](a.md)\n");
  const plan = approved(f, moveRequest()), script = path.join(f.base, "crash.mjs"), planFile = path.join(f.base, "plan.json");
  await writeFile(planFile, JSON.stringify(plan));
  await writeFile(script, `import {readFile} from 'node:fs/promises';\nimport {applyDocumentPlan} from ${JSON.stringify(transactionFile)};\nconst plan=JSON.parse(await readFile(process.argv[2],'utf8'));\nawait applyDocumentPlan(plan,{approve:plan.id,fault(stage,step){if(stage==='after-operation'&&step?.kind==='write')process.exit(77)}});\n`);
  const child = spawnSync(process.execPath, [script, planFile], { cwd: f.root, encoding: "utf8", timeout: 30_000 });
  assert.equal(child.status, 77, child.stderr);
  assert.equal(verify(f, plan.id).code, 5);
  assert.equal(apply(f, plan).body.error.code, "OPERATION_LOCKED");
  const lock = cli(f, ["lock-info"]).body.lock;
  assert.equal(cli(f, ["unlock", "--token", "wrong"]).body.error.code, "LOCK_MISMATCH");
  assert.equal(cli(f, ["unlock", "--token", lock.token]).code, 0);
  assert.equal(cli(f, [action, "--id", plan.id, "--approve", plan.id]).code, 0);
  assert.equal(verify(f, plan.id).code, 0);
  assert.equal(await readFile(path.join(f.root, action === "resume" ? "docs/nested/a.md" : "docs/a.md"), "utf8"), action === "resume" ? "# A\n[b](../b.md)\n" : "# A\n[b](b.md)\n");
});

test("copies of existing 24/25 documents retain their numbers, history and all non-reference text", async t => {
  const f = await makeFixture(t), names = ["24_alpha_kanban_team_documents_plan.md", "25_alpha_kanban_team_documents_tickets.md"], documents = [];
  for (const name of names) {
    const markdown = await readFile(path.join(repoRoot, "docs", name), "utf8");
    documents.push({ path: "docs/" + name, markdown }); await f.put("docs/" + name, markdown);
  }
  // Exact target fixtures isolate numbering/history from this repository's other WIP.
  for (const target of referenceTargets({ root: f.root, documents })) {
    const relative = path.relative(f.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !relative) continue;
    try { await access(target); } catch { await f.put(relative, "# Reference target fixture\n"); }
  }
  const request = { schema: 1, operation: "move", scope: ["docs"], moves: names.map(name => ({ from: "docs/" + name, to: "docs/@alice/" + name })), owner: "destination", intent: "adopt" };
  const plan = approved(f, request); assert.equal(apply(f, plan).code, 0);
  const withoutReferences = text => applyReferenceEdits(text, inspectReferences(text).references.map(ref => ({ start: ref.start, end: ref.end, before: ref.raw, after: "REFERENCE" })));
  for (const document of documents) {
    const target = document.path.replace("docs/", "docs/@alice/");
    const after = await readFile(path.join(f.root, target), "utf8");
    const ownerOnly = previewDocumentMetadata({ markdown: document.markdown, path: target, reconcileOwner: true }).after;
    assert.equal(withoutReferences(after), withoutReferences(ownerOnly));
    assert.equal(path.basename(target), path.basename(document.path));
  }
  assert.equal(recover(f, plan.id).code, 0);
  for (const document of documents) assert.equal(await readFile(path.join(f.root, document.path), "utf8"), document.markdown);
});
