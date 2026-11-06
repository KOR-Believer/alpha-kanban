import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { createDocumentPlan } from "../lib/document-plan.mjs";
import { DOCUMENT_SCAN_POLICY, scanWorktree } from "../lib/document-fs.mjs";
import { applyDocumentPlan, continueDocumentOperation, verifyDocumentOperation } from "../lib/document-transaction.mjs";
import { makeFixture, reviewed, moveRequest, gitTest } from "./document-fixtures.mjs";

const options = (f, plan) => ({ cwd: f.root, home: f.home, approve: plan.id });
const missing = file => assert.rejects(access(file), { code: "ENOENT" });

test("scan keeps ignored scope assets, empty folders and tracked/new Markdown without indexing unrelated files", async t => {
  const f = await makeFixture(t);
  await f.put(".gitignore", ".runtime/\ndocs/\n");
  await f.put("docs/a.md", "# A\n"); await f.put("docs/asset.bin", "asset");
  await mkdir(path.join(f.root, "docs/empty"));
  await f.put(".runtime/ignored.md", "# Ignored\n"); await f.put(".runtime/tracked.md", "# Tracked\n");
  await f.put(".runtime/log.bin", "log"); await f.put("src/untracked.bin", "other");
  await f.put("src/tracked.bin", "tracked non-Markdown"); await f.put("notes/한글 note.MD", "# New\n");
  gitTest(f.root, "add", "-f", ".runtime/tracked.md", "src/tracked.bin");
  const scan = await scanWorktree(f.root, "docs", ["docs"]);
  assert.deepEqual(scan.documents.map(file => file.path).sort(), [".runtime/tracked.md", "README.md", "docs/a.md", "notes/한글 note.MD"].sort());
  assert.deepEqual(scan.paths.filter(file => file.path.startsWith("docs")), [
    { path: "docs", kind: "directory" }, { path: "docs/a.md", kind: "file" },
    { path: "docs/asset.bin", kind: "file" }, { path: "docs/empty", kind: "directory" },
  ]);
  assert.ok(!scan.paths.some(file => /ignored|log\.bin|src\//.test(file.path)));
  assert.deepEqual(scan.skipped, []);
});

test("tracked Markdown in an ignored runtime directory still blocks an outside-scope backlink rewrite", async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n"); await f.put(".gitignore", ".runtime/\n");
  await f.put(".runtime/tracked.md", "# Reference\n[a](../docs/a.md)\n");
  gitTest(f.root, "add", "-f", ".runtime/tracked.md");
  const plan = await f.plan(moveRequest());
  assert.equal(plan.scan.policy, DOCUMENT_SCAN_POLICY);
  assert.equal(plan.decision, "blocked");
  assert.ok(plan.issues.some(issue => issue.path === ".runtime/tracked.md" && issue.code === "OUTSIDE_WRITE_SCOPE"));
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n");
});

test("a configured hidden ignored document root remains fully inspected and can be moved into", async t => {
  const f = await makeFixture(t), source = ".cache/manuals/a.md", to = ".cache/manuals/nested/a.md";
  await f.put(".ak.config", "[documents]\nroot = .cache/manuals\n");
  await f.put(".gitignore", ".cache/\n"); await f.put(source, "# A\n");
  const plan = await reviewed(f, { ...moveRequest(source, to), scope: [source, to] });
  assert.equal((await applyDocumentPlan(plan, options(f, plan))).status, "completed");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  assert.equal(await readFile(path.join(f.root, to), "utf8"), "# A\n");
});

test("ignored explicit scope never conceals a symlink or nested repository", async t => {
  const f = await makeFixture(t);
  await f.put(".gitignore", "docs/\n"); await f.put("docs/a.md", "# A\n");
  await symlink(f.home, path.join(f.root, "docs/link"), "dir");
  await mkdir(path.join(f.root, "docs/nested-repo")); gitTest(path.join(f.root, "docs/nested-repo"), "init");
  const plan = await f.plan(moveRequest());
  for (const code of ["SYMLINK", "NESTED_REPOSITORY"]) assert.ok(plan.issues.some(issue => issue.code === code && issue.severity === "blocked"));
  assert.equal(plan.decision, "blocked");
});

test("Git candidates cannot follow a replaced ancestor into a symlink or nested checkout", async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n"); await f.put("refs/reference.md", "# Reference\n");
  gitTest(f.root, "add", "refs/reference.md");
  await rm(path.join(f.root, "refs"), { recursive: true });
  await symlink(f.home, path.join(f.root, "refs"), "dir");
  const scan = await scanWorktree(f.root, "docs", ["docs"]);
  assert.ok(scan.skipped.some(entry => entry.path === "refs" && entry.code === "SYMLINK"));
  assert.ok(!scan.documents.some(entry => entry.path === "refs/reference.md"));
  await rm(path.join(f.root, "refs")); await f.put("refs/reference.md", "# Other checkout\n");
  gitTest(path.join(f.root, "refs"), "init");
  const nested = await scanWorktree(f.root, "docs", ["docs"]);
  assert.ok(nested.skipped.some(entry => entry.path === "refs" && entry.code === "NESTED_REPOSITORY"));
  assert.ok(!nested.documents.some(entry => entry.path === "refs/reference.md"));
});

test("Git warnings about unreadable backlink directories require review even when Git exits successfully", { skip: !process.getuid || process.getuid() === 0 }, async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n"); await f.put("references/hidden.md", "# Ref\n[a](../docs/a.md)\n");
  const directory = path.join(f.root, "references"); await chmod(directory, 0);
  try {
    const plan = await f.plan(moveRequest());
    assert.equal(plan.decision, "review");
    assert.ok(plan.issues.some(issue => issue.code === "GIT_SCAN_WARNING" && issue.message.includes("references")));
  } finally { await chmod(directory, 0o755); }
});

test("runtime churn is irrelevant before apply, source removal, verification and explicit recovery", async t => {
  const f = await makeFixture(t);
  await f.put(".gitignore", ".runtime/\n");
  await f.put("docs/a.md", "# A\n[b](b.md)\n"); await f.put("docs/b.md", "# B\n[a](a.md)\n");
  gitTest(f.root, "add", "docs");
  const plan = await reviewed(f, moveRequest());
  await f.put(".runtime/ignored.md", "# Runtime\n"); await f.put("unrelated.log", "first log");
  let paused = false;
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async (stage, step) => {
    if (stage === "before-unlink") await f.put(".runtime/another.bin", "written before removal");
    if (!paused && stage === "after-step" && step?.kind === "unlink") {
      paused = true; throw Object.assign(new Error("Stop after removing source"), { code: "EIO" });
    }
  } }), error => error.code === "OPERATION_INTERRUPTED" && error.details.cause.code === "EIO");
  await f.put(".runtime/after-interruption.md", "# More ignored runtime\n");
  await rm(path.join(f.root, "unrelated.log"));
  assert.equal((await continueDocumentOperation(plan.id, options(f, plan))).status, "completed");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  assert.equal(await readFile(path.join(f.root, "docs/nested/a.md"), "utf8"), "# A\n[b](../b.md)\n");
  assert.equal(await readFile(path.join(f.root, "docs/b.md"), "utf8"), "# B\n[a](nested/a.md)\n");
  await f.put(".runtime/before-recovery.bin", "more logs");
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n[b](b.md)\n");
  assert.equal(await readFile(path.join(f.root, ".runtime/before-recovery.bin"), "utf8"), "more logs");
});

test("a new nonignored Markdown backlink invalidates a reviewed plan before any document writes", async t => {
  const f = await makeFixture(t); await f.put("docs/a.md", "# A\n");
  const plan = await reviewed(f, moveRequest());
  await f.put("notes/new.md", "# New reference\n[a](../docs/a.md)\n");
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "STALE_PLAN" });
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n");
  await missing(path.join(f.root, "docs/nested/a.md"));
});

test("new backlinks and source-scope assets are detected immediately before source removal", async t => {
  for (const relative of ["notes/new.md", "docs/new.bin"]) await t.test(relative, async t => {
    const f = await makeFixture(t); await f.put("docs/a.md", "# A\n");
    const plan = await reviewed(f, moveRequest());
    await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async stage => {
      if (stage === "before-unlink") await f.put(relative, "[a](../docs/a.md)\n");
    } }), error => error.code === "OPERATION_INTERRUPTED" && error.details.cause.code === "SCAN_CHANGED");
    await access(path.join(f.root, "docs/a.md"));
    assert.equal(await readFile(path.join(f.root, relative), "utf8"), "[a](../docs/a.md)\n");
  });
});

test("a referenced ignored non-Markdown target remains guarded even though it is outside the scan inventory", async t => {
  const f = await makeFixture(t);
  await f.put(".gitignore", ".runtime/\n"); await f.put(".runtime/asset.bin", "asset");
  await f.put("docs/a.md", "# A\n[asset](../.runtime/asset.bin)\n");
  const plan = await reviewed(f, moveRequest());
  assert.ok(!plan.scan.paths.some(entry => entry.path.startsWith(".runtime")));
  assert.ok(plan.targetChecks.some(entry => entry.target.endsWith("/.runtime/asset.bin") && entry.record));
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: async stage => {
    if (stage === "before-unlink") await f.put(".runtime/asset.bin", "changed asset");
  } }), error => error.code === "OPERATION_INTERRUPTED" && error.details.cause.code === "REFERENCE_TARGET_CHANGED");
  await access(path.join(f.root, "docs/a.md"));
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.equal(await readFile(path.join(f.root, ".runtime/asset.bin"), "utf8"), "changed asset");
});

test("old reviewed plans and journals retain their original scan coverage", async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n"); await f.put(".gitignore", ".runtime/\n");
  await f.put(".runtime/log.bin", "original");
  const first = await createDocumentPlan(moveRequest(), { cwd: f.root, scanPolicy: null });
  const plan = await createDocumentPlan({ ...first.request, acknowledgements: first.issues.map(issue => issue.fingerprint) }, { cwd: f.root, scanPolicy: null });
  assert.equal(plan.scan.policy, undefined);
  assert.equal((await applyDocumentPlan(plan, options(f, plan))).status, "completed");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  await f.put(".runtime/new.bin", "new log");
  await assert.rejects(verifyDocumentOperation(plan.id, options(f, plan)), { code: "SCAN_CHANGED" });
  await rm(path.join(f.root, ".runtime/new.bin"));
  assert.equal((await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true })).status, "rolled-back");
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n");
});
