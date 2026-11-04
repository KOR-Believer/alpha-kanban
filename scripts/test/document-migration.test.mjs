import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeFixture, reviewed } from "./document-fixtures.mjs";
import { applyDocumentPlan, continueDocumentOperation, verifyDocumentOperation } from "../lib/document-transaction.mjs";
const legacy = await readFile(new URL("../../docs/02_alpha_kanban_tickets.md", import.meta.url), "utf8");
const file = "docs/02_test_tickets.md";
const request = { schema: 1, operation: "migrate", scope: ["docs"], targets: [{ path: file, assignId: true, cleanupLegacy: true }] };
const options = (f, plan) => ({ cwd: f.root, home: f.home, approve: plan.id });
test("native migration applies the exact preview and restores its complete preimage", async t => {
  const f = await makeFixture(t); await f.put(file, legacy);
  const plan = await reviewed(f, request); assert.equal(plan.decision, "ready");
  assert.equal(await readFile(path.join(f.root, file), "utf8"), legacy);
  assert.equal((await applyDocumentPlan(plan, options(f, plan))).status, "completed");
  const after = await readFile(path.join(f.root, file), "utf8");
  assert.equal(after, plan.changes[0].diff.after); assert.ok(after.includes(plan.migration.generatedIds[file]));
  assert.equal((await f.plan(request)).decision, "noop");
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true });
  assert.equal(await readFile(path.join(f.root, file), "utf8"), legacy);
});
test("interrupted migration resumes with the reviewed UUID, never a regenerated one", async t => {
  const f = await makeFixture(t); await f.put(file, legacy);
  const plan = await reviewed(f, request);
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: stage => { if (stage === "after-operation") throw new Error("power loss"); } }), { code: "OPERATION_INTERRUPTED" });
  await continueDocumentOperation(plan.id, options(f, plan));
  assert.equal(await readFile(path.join(f.root, file), "utf8"), plan.changes[0].diff.after);
});
test("new README backlinks invalidate the old preview and retain only the referenced section", async t => {
  const f = await makeFixture(t); await f.put(file, legacy);
  const plan = await reviewed(f, request);
  await f.put("README.md", `# Index\n[x](${file}#progress-board)\n`);
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)), { code: "STALE_PLAN" });
  const revised = await f.plan(request); assert.equal(revised.decision, "ready"); assert.deepEqual(revised.issues, []);
  await applyDocumentPlan(revised, options(f, revised));
  const after = await readFile(path.join(f.root, file), "utf8");
  assert.ok(after.includes("## Progress Board")); assert.ok(after.includes("Document-ID:")); assert.ok(!after.includes("## Ticket Template"));
});

test("native cleanup ignores unrelated link errors and only writes the explicit target", async t => {
  const f = await makeFixture(t); await f.put(file, legacy);
  const other = "# Other\n[[unknown]]\n<a href='missing.md#missing'>x</a>\n[x](file:///old/repo/docs/doc.md#heading)\n";
  await f.put("CLAUDE.md", other); await f.put("docs/other_tickets.md", legacy);
  const plan = await f.plan(request);
  assert.equal(plan.decision, "ready"); assert.deepEqual(plan.issues, []); assert.deepEqual(plan.changes.map(change => change.from), [file]);
  await applyDocumentPlan(plan, options(f, plan));
  assert.equal(await readFile(path.join(f.root, "CLAUDE.md"), "utf8"), other);
  assert.equal(await readFile(path.join(f.root, "docs/other_tickets.md"), "utf8"), legacy);
});

test("native cleanup ignores stale table counts and IDs and preserves surrounding notes", async t => {
  const f = await makeFixture(t);
  const markdown = legacy.replace("| AKB-00 | DONE | 100%", "| OLD-77 | TODO | 0%").replace("## Progress Board\n", "## Progress Board\n\nKeep my note.\n");
  await f.put(file, markdown);
  const plan = await reviewed(f, { ...request, targets: [{ path: file, cleanupLegacy: true }] });
  assert.equal(plan.decision, "ready");
  await applyDocumentPlan(plan, options(f, plan));
  const after = await readFile(path.join(f.root, file), "utf8");
  assert.ok(after.includes("Keep my note.")); assert.ok(!after.includes("| OLD-77 |"));
  assert.equal(after.slice(after.indexOf("## Ticket List")), markdown.slice(markdown.indexOf("## Ticket List")));
  await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true });
  assert.equal(await readFile(path.join(f.root, file), "utf8"), markdown);
});

test("native migration cleans guides and template examples without changing noncanonical ticket bodies", async t => {
  const f = await makeFixture(t);
  const markdown = legacy.replace("Status: DONE", "Status: WATCH").replace("Progress: 100%", "Progress: 80%");
  await f.put(file, markdown);
  const plan = await reviewed(f, request);
  assert.equal(plan.decision, "ready");
  await applyDocumentPlan(plan, options(f, plan));
  const after = await readFile(path.join(f.root, file), "utf8");
  assert.equal(after, plan.changes[0].diff.after);
  for (const section of ["Progress Board", "티켓 상태", "Progress 기준", "Ticket Template"]) assert.ok(!after.includes(`## ${section}\n`));
  assert.equal(after.slice(after.indexOf("## Ticket List")), markdown.slice(markdown.indexOf("## Ticket List")));
  assert.ok(after.includes("Status: WATCH")); assert.ok(after.includes("Progress: 80%"));
  assert.equal((await f.plan(request)).decision, "noop");
});
