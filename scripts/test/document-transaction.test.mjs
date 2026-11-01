import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, chmod, stat, writeFile, access, readdir, symlink, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { applyDocumentPlan, continueDocumentOperation, verifyDocumentOperation } from "../lib/document-transaction.mjs";
import { operationDirectory, loadJournal, journalIds } from "../lib/document-journal.mjs";
import { makeFixture, reviewed, moveRequest, gitTest, put } from "./document-fixtures.mjs";

const options = (f, plan) => ({ cwd: f.root, home: f.home, approve: plan.id });
const missing = file => assert.rejects(access(file), { code: "ENOENT" });
const injected = () => Object.assign(new Error("Injected I/O failure"), { code: "ENOSPC" });
async function ready(t) {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n\n[b](b.md)\n"); await f.put("docs/b.md", "# B\n\n[a](a.md)\n");
  return { f, plan: await reviewed(f, moveRequest()) };
}

test("native folder move preserves verified attributes and supports recovery, or refuses unsupported directory metadata", async t => {
  const f = await makeFixture(t), data = Buffer.from([0, 255, 12, 33]);
  await f.put("docs/set/a.md", "# A\n\n![x](image.bin)\n"); await f.put("docs/set/image.bin", data);
  await f.put("docs/index.md", "# Index\n\n[a](set/a.md)\n"); await mkdir(path.join(f.root, "docs/set/empty"));
  const original = path.join(f.root, "docs/set/image.bin"); await chmod(original, 0o640);
  if (process.platform === "darwin") execFileSync("/usr/bin/xattr", ["-w", "com.alphakanban.fixture", "preserved", original]);
  const before = await stat(original);
  if (process.platform !== "darwin") {
    await assert.rejects(reviewed(f, moveRequest("docs/set", "docs/archive/set")), { code: "UNSUPPORTED_DIRECTORY_ATTRIBUTES" });
    assert.deepEqual(await readFile(original), data); return;
  }
  const plan = await reviewed(f, moveRequest("docs/set", "docs/archive/set"));
  assert.equal(plan.decision, "ready");
  const result = await applyDocumentPlan(plan, options(f, plan)); assert.equal(result.status, "completed");
  await missing(path.join(f.root, "docs/set"));
  const target = path.join(f.root, "docs/archive/set/image.bin");
  assert.deepEqual(await readFile(target), data); assert.equal((await stat(target)).ino, before.ino); assert.equal((await stat(target)).mode, before.mode);
  if (process.platform === "darwin") assert.equal(execFileSync("/usr/bin/xattr", ["-p", "com.alphakanban.fixture", target], { encoding: "utf8" }).trim(), "preserved");
  assert.deepEqual(await readdir(path.join(f.root, "docs/archive/set/empty")), []);
  assert.ok((await readFile(path.join(f.root, "docs/index.md"), "utf8")).includes("archive/set/a.md"));
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  assert.equal((await applyDocumentPlan(plan, options(f, plan))).status, "completed");
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.deepEqual(await readFile(original), data); assert.equal((await stat(original)).ino, before.ino);
  assert.equal(await readFile(path.join(f.root, "docs/index.md"), "utf8"), "# Index\n\n[a](set/a.md)\n");
  await missing(path.join(f.root, "docs/archive"));
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
});

test("journal/backup failure makes no document changes", async t => {
  const { f, plan } = await ready(t);
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: stage => { if (stage === "before-journal") throw injected(); } }), { code: "ENOSPC" });
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n\n[b](b.md)\n");
  await missing(path.join(f.root, "docs/nested"));
  assert.deepEqual(await journalIds(await operationDirectory(plan.context)), []);
});

for (const kind of ["mkdir", "link", "write", "unlink"]) test(`an interrupted ${kind} is journaled, requires explicit resumption, and finishes once`, async t => {
  const { f, plan } = await ready(t); let triggered = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: (stage, step) => {
    if (!triggered && stage === "after-step" && step?.kind === kind) { triggered = true; throw injected(); }
  } }), { code: "OPERATION_INTERRUPTED" });
  assert.ok(triggered);
  const journal = await loadJournal(await operationDirectory(plan.context), plan.id);
  assert.equal(journal.status, "interrupted"); assert.ok(journal.plan.changes[0].before.bytes);
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "RECOVERY_REQUIRED" });
  assert.equal((await continueDocumentOperation(plan.id, options(f, plan))).status, "completed");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  await missing(path.join(f.root, "docs/a.md"));
});

test("a completed write interrupted before its acknowledgement is recognized by exact readback", async t => {
  const { f, plan } = await ready(t); let triggered = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: (stage, step) => {
    if (!triggered && stage === "after-operation" && step?.kind === "write") { triggered = true; throw injected(); }
  } }), { code: "OPERATION_INTERRUPTED" });
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, false);
  assert.equal((await continueDocumentOperation(plan.id, options(f, plan))).status, "completed");
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
});

test("external edits immediately before source deletion survive resumption and recovery attempts", async t => {
  const { f, plan } = await ready(t); let triggered = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async (stage, step) => {
    if (!triggered && stage === "before-unlink") { triggered = true; await f.put(step.path, "# External new work\n"); }
  } }), { code: "OPERATION_INTERRUPTED" });
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# External new work\n");
  await assert.rejects(continueDocumentOperation(plan.id, options(f, plan)), { code: "UNCERTAIN_STEP" });
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true }), { code: "UNCERTAIN_STEP" });
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# External new work\n");
  const journal = await loadJournal(await operationDirectory(plan.context), plan.id);
  assert.equal(Buffer.from(journal.plan.changes[0].before.bytes, "base64").toString(), "# A\n\n[b](b.md)\n");
});

test("a racing destination is never overwritten or adopted as this operation's directory", async t => {
  const { f, plan } = await ready(t);
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async (stage, step) => {
    if (stage === "after-intent" && step?.kind === "mkdir") await f.put(step.path + "/foreign.txt", "foreign");
  } }), { code: "OPERATION_INTERRUPTED" });
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true }), { code: "UNCERTAIN_STEP" });
  assert.equal(await readFile(path.join(f.root, "docs/nested/foreign.txt"), "utf8"), "foreign");
  await access(path.join(f.root, "docs/a.md"));
});

test("unverified readback and partial file content never become permission to overwrite external work", async t => {
  const { f, plan } = await ready(t); let triggered = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async (stage, step) => {
    if (!triggered && stage === "after-operation" && step?.kind === "write") { triggered = true; await f.put(step.path, "partial or external bytes"); }
  } }), { code: "OPERATION_INTERRUPTED" });
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true }), { code: "UNCERTAIN_STEP" });
  assert.equal(await readFile(path.join(f.root, "docs/nested/a.md"), "utf8"), "partial or external bytes");
});

test("approval, plan tampering, source changes, same-commit branch switches and another worktree are rejected", async t => {
  const { f, plan } = await ready(t);
  await assert.rejects(applyDocumentPlan(plan, { cwd: f.root }), { code: "APPROVAL_REQUIRED" });
  await assert.rejects(applyDocumentPlan({ ...plan, changes: [] }, options(f, plan)), { code: "PLAN_CHANGED" });
  const other = path.join(f.base, "other"); gitTest(f.root, "worktree", "add", "--detach", other, "HEAD");
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), cwd: other }), { code: "WORKTREE_CHANGED" });
  gitTest(f.root, "switch", "-c", "same-commit");
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "WORKTREE_CHANGED" });
  gitTest(f.root, "switch", "main");
  await f.put("docs/a.md", "# Modified after review\n");
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "STALE_PLAN" });
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# Modified after review\n");
});

test("the native lock serializes CLI operations without claiming to lock external editors", async t => {
  const { f, plan } = await ready(t); let unblock, entered;
  const gate = new Promise(resolve => { unblock = resolve; }), signal = new Promise(resolve => { entered = resolve; });
  const first = applyDocumentPlan(plan, { ...options(f, plan), fault: async stage => { if (stage === "after-journal") { entered(); await gate; } } });
  await signal;
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "OPERATION_LOCKED" });
  unblock(); assert.equal((await first).status, "completed");
});

test("a damaged journal is preserved and refused", async t => {
  const { f, plan } = await ready(t);
  await applyDocumentPlan(plan, options(f, plan));
  const file = path.join(await operationDirectory(plan.context), plan.id + ".json");
  await writeFile(file, "damaged");
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true }), { code: "JOURNAL_DAMAGED" });
  assert.equal(await readFile(file, "utf8"), "damaged");
  await access(path.join(f.root, "docs/nested/a.md"));
});

test("a changed external target stops resumption without preventing guarded recovery of own documents", async t => {
  const { f } = await ready(t), external = await makeFixture(t);
  await external.put("asset.bin", "original");
  await f.put("docs/a.md", `# A\n\n[asset](<${external.root}/asset.bin>)\n`);
  const plan = await reviewed(f, { ...moveRequest(), repositories: [{ root: external.root }] });
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: (stage, step) => {
    if (stage === "after-step" && step?.kind === "link") throw injected();
  } }), { code: "OPERATION_INTERRUPTED" });
  await unlink(path.join(external.root, "asset.bin"));
  await symlink("README.md", path.join(external.root, "asset.bin"));
  await assert.rejects(continueDocumentOperation(plan.id, options(f, plan)), { code: "REFERENCE_TARGET_CHANGED" });
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  await access(path.join(f.root, "docs/a.md"));
  assert.equal(await readFile(path.join(external.root, "asset.bin"), "utf8"), "# Project\n");
});

test("a new read-only backlink is detected before removing a source", async t => {
  const { f, plan } = await ready(t); let changed = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async stage => {
    if (!changed && stage === "before-unlink") { changed = true; await f.put("README.md", "# External edits\n\n[a](docs/a.md)\n"); }
  } }), error => error.code === "OPERATION_INTERRUPTED" && error.details.cause.code === "REFERENCE_CHANGED");
  await access(path.join(f.root, "docs/a.md"));
  assert.equal(await readFile(path.join(f.root, "README.md"), "utf8"), "# External edits\n\n[a](docs/a.md)\n");
});

test("native permission failure retains the original and permits explicit recovery without changing its mode", { skip: !process.getuid || process.getuid() === 0 }, async t => {
  const { f } = await ready(t);
  await chmod(path.join(f.root, "docs/a.md"), 0o444);
  const plan = await reviewed(f, moveRequest());
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), error => error.code === "OPERATION_INTERRUPTED" && ["EACCES", "EPERM"].includes(error.details.cause.code));
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.equal((await stat(path.join(f.root, "docs/a.md"))).mode & 0o777, 0o444);
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n\n[b](b.md)\n");
});

test("owner and references share one interrupted journal and recovery never overwrites a new owner edit", async t => {
  const f = await makeFixture(t), before = "# Task\n\nOwner: @alice\n\n[context](../context.md)\n";
  await f.put("docs/@alice/task.md", before); await f.put("docs/context.md", "# Context\n\n[task](@alice/task.md)\n");
  const plan = await reviewed(f, { ...moveRequest("docs/@alice/task.md", "docs/@bob/task.md"), owner: "destination", intent: "handoff" });
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: (stage, step) => {
    if (stage === "after-step" && step?.kind === "write") throw injected();
  } }), { code: "OPERATION_INTERRUPTED" });
  const journal = await loadJournal(await operationDirectory(plan.context), plan.id);
  assert.equal(journal.plan.changes[0].ownership.recordedOwner, "@alice");
  assert.ok((await readFile(path.join(f.root, "docs/@bob/task.md"), "utf8")).includes("Owner: @bob"));
  await f.put("docs/@bob/task.md", "# Task\n\nOwner: @carol\n\nNew work\n");
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true }), { code: "EXTERNAL_CHANGE" });
  assert.ok((await readFile(path.join(f.root, "docs/@bob/task.md"), "utf8")).includes("New work"));
  assert.equal(Buffer.from(journal.plan.changes[0].before.bytes, "base64").toString(), before);
});

test("interrupted recovery must continue recovering and repeated recovery makes no additional changes", async t => {
  const { f, plan } = await ready(t);
  await applyDocumentPlan(plan, options(f, plan)); let once = false;
  await assert.rejects(continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true, fault: stage => {
    if (!once && stage === "after-step") { once = true; throw injected(); }
  } }), { code: "OPERATION_INTERRUPTED" });
  await assert.rejects(continueDocumentOperation(plan.id, options(f, plan)), { code: "ROLLBACK_IN_PROGRESS" });
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  const before = await stat(path.join(f.root, "docs/a.md"));
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.equal((await stat(path.join(f.root, "docs/a.md"))).mtimeMs, before.mtimeMs);
});

for (const boundary of ["before-close", "before-unlink"]) test(`an injected ${boundary} I/O error is retained and only explicit resume completes`, async t => {
  const { f, plan } = await ready(t); let once = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: stage => {
    if (!once && stage === boundary) { once = true; throw Object.assign(new Error("Injected I/O boundary failure"), { code: "EIO" }); }
  } }), error => error.code === "OPERATION_INTERRUPTED" && error.details.cause.code === "EIO");
  await access(path.join(f.root, "docs/a.md"));
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, false);
  assert.equal((await continueDocumentOperation(plan.id, options(f, plan))).status, "completed");
});
