import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeFixture, reviewed } from "./document-fixtures.mjs";
import { applyDocumentPlan, continueDocumentOperation, verifyDocumentOperation } from "../lib/document-transaction.mjs";

const options = (f, plan) => ({ cwd: f.root, home: f.home, approve: plan.id });
test("custom document root supports move, reference repair, metadata and recovery", async t => {
  const f = await makeFixture(t);
  await f.put(".ak.config", "[documents]\nroot = notes/planning\n");
  await f.put("notes/planning/@alice/a.md", "# A\n\n[b](b.md)\n");
  await f.put("notes/planning/@alice/b.md", "# B\n\n[a](a.md)\n");
  const request = { schema: 1, operation: "move", scope: ["notes/planning"], moves: [{ from: "notes/planning/@alice/a.md", to: "notes/planning/@alice/archive/a.md" }] };
  const plan = await reviewed(f, request); assert.equal(plan.decision, "ready");
  assert.equal(plan.documentRoot.value, "notes/planning");
  await applyDocumentPlan(plan, options(f, plan));
  assert.match(await readFile(path.join(f.root, "notes/planning/@alice/archive/a.md"), "utf8"), /\]\(\.\.\/b.md\)/);
  assert.match(await readFile(path.join(f.root, "notes/planning/@alice/b.md"), "utf8"), /\]\(archive\/a.md\)/);
  await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true });
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
  const migration = await f.plan({ schema: 1, operation: "migrate", scope: ["notes/planning"], targets: [{ path: "notes/planning/@alice/a.md", assignId: true, reconcileOwner: true, allowPlainMarkdown: true }] });
  assert.equal(migration.decision, "ready");
  assert.match(migration.changes[0].diff.after, /Owner: @alice/);
  await applyDocumentPlan(migration, options(f, migration));
  await assert.rejects(f.plan({ ...request, scope: ["docs"] }), { code: "WRITE_SCOPE" });
});

test("changed root invalidates apply and resume but never strands recovery", async t => {
  const f = await makeFixture(t);
  await f.put(".ak.config", "[documents]\nroot = .plans\n");
  const source = "# Plan\n\nOwner: @previous\n";
  await f.put(".plans/@alice/a_plan.md", source);
  const request = { schema: 1, operation: "migrate", scope: [".plans"], targets: [{ path: ".plans/@alice/a_plan.md", reconcileOwner: true }] };
  const plan = await f.plan(request);
  await f.put(".ak.config", "[documents]\nroot = docs\n");
  await assert.rejects(applyDocumentPlan(plan, options(f, plan)));
  assert.equal(await readFile(path.join(f.root, ".plans/@alice/a_plan.md"), "utf8"), source);
  await f.put(".ak.config", "[documents]\nroot = .plans\n");
  await assert.rejects(applyDocumentPlan(plan, { ...options(f, plan), fault: stage => { if (stage === "after-operation") throw new Error("interrupt"); } }), { code: "OPERATION_INTERRUPTED" });
  await f.put(".ak.config", "[documents]\nroot = docs\n");
  await assert.rejects(continueDocumentOperation(plan.id, options(f, plan)), { code: "DOCUMENT_ROOT_CHANGED" });
  await continueDocumentOperation(plan.id, { ...options(f, plan), rollback: true });
  assert.equal(await readFile(path.join(f.root, ".plans/@alice/a_plan.md"), "utf8"), source);
  assert.equal((await verifyDocumentOperation(plan.id, options(f, plan))).verified, true);
});
