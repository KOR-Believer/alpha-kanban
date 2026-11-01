import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, symlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { createDocumentPlan, assertPlan } from "../lib/document-plan.mjs";
import { sha, normalizeRemote } from "../lib/document-fs.mjs";
import { makeFixture, reviewed, moveRequest, put, gitTest } from "./document-fixtures.mjs";

test("analysis is read-only, scope/HEAD/hash bound, and acknowledgement is explicit and source-bound", async t => {
  const f = await makeFixture(t);
  await f.put("docs/a.md", "# A\n\n[b](b.md)\n"); await f.put("docs/b.md", "# B\n\n[a](a.md)\n");
  const beforeGit = await readdir(path.join(f.root, ".git"));
  const first = await f.plan(moveRequest());
  assert.equal(first.decision, "review"); assert.throws(() => assertPlan(first), { code: "PLAN_NOT_READY" });
  const plan = await reviewed(f, moveRequest());
  assert.equal(plan.decision, "ready"); assertPlan(JSON.parse(JSON.stringify(plan)));
  assert.equal(plan.changes.length, 2); assert.equal(plan.context.root, f.root);
  assert.equal(plan.actor, null); assert.equal(plan.changes[0].ownership.afterOwner, null);
  assert.deepEqual(await readdir(path.join(f.root, ".git")), beforeGit);
  assert.equal(await readFile(path.join(f.root, "docs/a.md"), "utf8"), "# A\n\n[b](b.md)\n");
  assert.throws(() => assertPlan({ ...plan, changes: [] }), { code: "PLAN_CHANGED" });
  await f.put("docs/b.md", "# B\n\n[a](a.md)\n\nEdit\n");
  assert.equal((await f.plan(plan.request)).decision, "review");
});

test("outside-docs backlinks block; symlinks, nested repositories and occupied destinations never widen scope", async t => {
  const f = await makeFixture(t); await f.put("docs/a.md", "# A\n");
  await f.put("README.md", "# R\n[a](docs/a.md)\n");
  assert.equal((await reviewed(f, moveRequest())).decision, "blocked");
  await assert.rejects(f.plan({ ...moveRequest(), scope: ["."] }), { code: "INVALID_PATH" });
  await f.put("docs/nested/a.md", "new owner file");
  await assert.rejects(f.plan(moveRequest()), { code: "DESTINATION_EXISTS" });
  await symlink(f.home, path.join(f.root, "docs/link"));
  await assert.rejects(f.plan(moveRequest("docs/a.md", "docs/link/a.md")), { code: "SYMLINK_BOUNDARY" });
  await mkdir(path.join(f.root, "docs/child")); gitTest(path.join(f.root, "docs/child"), "init");
  await assert.rejects(f.plan(moveRequest("docs/a.md", "docs/child/a.md")), { code: "NESTED_REPOSITORY" });
});

test("native repo proof accepts SSH/HTTPS spelling, distinguishes forks and preserves current checkout selection", async t => {
  assert.equal(normalizeRemote("ssh://git@example.invalid:22/team/repo.git"), normalizeRemote("https://example.invalid/team/repo"));
  assert.notEqual(normalizeRemote("ssh://git@example.invalid:2222/team/repo.git"), normalizeRemote("https://example.invalid/team/repo"));
  const f = await makeFixture(t);
  const external = path.join(f.base, "renamed external"); await mkdir(external); gitTest(external, "init", "-b", "main");
  await put(path.join(external, "src/unpushed.ts"), "new file");
  gitTest(external, "add", "."); gitTest(external, "commit", "-m", "fixture");
  gitTest(external, "remote", "add", "origin", "git@example.invalid:team/other.git");
  await f.put("docs/a.md", "# A\n[x](C:/old/other/src/unpushed.ts)\n");
  const request = { schema: 1, operation: "rebase", scope: ["docs"], repositories: [
    { root: "current", oldRoot: "C:/old/main", proof: { kind: "confirmed", reason: "Confirmed old PC document root" } },
    { root: external, oldRoot: "C:/old/other", proof: { kind: "remote", url: "https://example.invalid/team/other.git" } }
  ] };
  const plan = await reviewed(f, request);
  assert.equal(plan.decision, "ready"); assert.ok(plan.changes[0].diff.after.includes("../../renamed%20external/src/unpushed.ts"));
  assert.equal(plan.changes.length, 1); assert.equal(plan.repositories.find(repo => !repo.current).root, external);
  const fork = structuredClone(request); fork.repositories[1].proof.url = "https://example.invalid/fork/other.git";
  await assert.rejects(f.plan(fork), { code: "REPOSITORY_IDENTITY_MISMATCH" });
  const unknown = structuredClone(request); delete unknown.repositories[1].proof;
  await assert.rejects(f.plan(unknown), { code: "INVALID_REQUEST" });
});

test("explicit adoption/handoff preserves ID, number and body and never depends on ownerFolders", async t => {
  const f = await makeFixture(t);
  const source = "# A\n\nOwner: @alice\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\n\n## History\nKept\n";
  await f.put("docs/@alice/24_a_plan.md", source); await f.put(".ak.config", "[documents]\nownerFolders = false\n");
  const request = { ...moveRequest("docs/@alice/24_a_plan.md", "docs/@bob/24_a_plan.md"), owner: "destination", intent: "handoff" };
  const plan = await reviewed(f, request);
  assert.equal(plan.decision, "ready");
  assert.equal(plan.changes[0].diff.after, source.replace("Owner: @alice", "Owner: @bob"));
  assert.equal(plan.changes[0].ownership.intent, "handoff");
  await assert.rejects(f.plan({ ...request, intent: "organize" }), { code: "OWNERSHIP_INTENT_REQUIRED" });
  await f.put("docs/25_legacy_plan.md", "# Legacy\n\nBody\n");
  const adopt = await reviewed(f, { ...moveRequest("docs/25_legacy_plan.md", "docs/@bob/25_legacy_plan.md"), owner: "destination", intent: "adopt" });
  assert.ok(adopt.changes[0].diff.after.includes("Owner: @bob")); assert.ok(!adopt.changes[0].diff.after.includes("Document-ID"));
});

test("external relocation needs exact UUID plus pre-move bytes and refuses copies, old-path reuse or unknown history", async t => {
  const f = await makeFixture(t);
  const source = "# A\n\nOwner: @alice\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\n\n[x](b.md)\n";
  await f.put("docs/@bob/a.md", source); await f.put("docs/@alice/b.md", "# B\n[a](a.md)\n");
  const request = { schema: 1, operation: "reconcile", scope: ["docs"], owner: "destination", intent: "handoff", targets: [{ path: "docs/@bob/a.md", previous: { path: "docs/@alice/a.md", documentId: "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1", hash: sha(source) } }] };
  const plan = await reviewed(f, request);
  assert.equal(plan.decision, "ready"); assert.equal(plan.changes.length, 2);
  assert.ok(plan.changes.every(change => change.from === change.to));
  assert.ok(plan.changes.find(change => change.from.endsWith("a.md")).diff.after.includes("../@alice/b.md"));
  const wrong = structuredClone(request); wrong.targets[0].previous.hash = "a".repeat(64);
  await assert.rejects(f.plan(wrong), { code: "RELOCATION_CONTENT_CHANGED" });
  await f.put("docs/copy.md", source);
  await assert.rejects(f.plan(request), { code: "AMBIGUOUS_RELOCATION" });
  await f.put("docs/@alice/a.md", "new unrelated file");
  await assert.rejects(f.plan(request), { code: "PREVIOUS_PATH_REUSED" });
});

test("current-user lookup inherits from the original repo outside the workspace and binds its provenance", async t => {
  const f = await makeFixture(t);
  await f.put(".git/info/exclude", "/.ak.user\n"); await f.put(".ak.user", "[user]\nid = @alice\n");
  const linked = path.join(f.base, "linked"); gitTest(f.root, "worktree", "add", "--detach", linked, "HEAD");
  await put(path.join(linked, "docs/a.md"), "# A\n");
  const request = { ...moveRequest("docs/a.md", "docs/@alice/a.md"), owner: "destination", intent: "adopt", actor: "current" };
  const first = await createDocumentPlan(request, { cwd: linked, home: f.home });
  assert.equal(first.actor.user.value, "@alice"); assert.equal(first.context.root, linked);
  assert.equal(first.actor.user.source.scope, "repo");
  await f.put(".ak.user", "[user]\nid = @bob\n");
  await assert.rejects(createDocumentPlan(request, { cwd: linked, home: f.home }), { code: "ACTOR_DESTINATION_MISMATCH" });
});

test("owner-only registration validates its references without normalizing already valid paths", async t => {
  const f = await makeFixture(t);
  const request = { schema: 1, operation: "reconcile", scope: ["docs"], owner: "destination", intent: "adopt", targets: [{ path: "docs/@alice/a.md", placement: "confirmed-in-place" }] };
  await f.put("docs/@alice/a.md", "# Legacy\n[x](missing.md)\n");
  const blocked = await reviewed(f, request);
  assert.equal(blocked.decision, "blocked"); assert.ok(blocked.issues.some(issue => issue.code === "MISSING_TARGET"));
  await f.put("docs/@alice/missing.md", "# Found\n");
  const valid = `# Legacy\n[x](<${f.root}/docs/@alice/missing.md>)\n`;
  await f.put("docs/@alice/a.md", valid);
  const plan = await reviewed(f, request);
  assert.equal(plan.decision, "ready");
  assert.equal(plan.changes[0].diff.after, valid.replace("# Legacy\n", "# Legacy\nOwner: @alice\n"));
});

test("a current-user handoff may repair selected backlinks without assigning their owners to the actor", async t => {
  const f = await makeFixture(t);
  await f.put(".git/info/exclude", "/.ak.user\n"); await f.put(".ak.user", "[user]\nid = @bob\n");
  await f.put("docs/@alice/a.md", "# A\nOwner: @alice\n");
  await f.put("docs/@alice/context.md", "# Context\nOwner: @alice\n\n[a](a.md)\n");
  const plan = await reviewed(f, { ...moveRequest("docs/@alice/a.md", "docs/@bob/a.md"), actor: "current", owner: "destination", intent: "handoff" });
  assert.equal(plan.decision, "ready");
  assert.equal(plan.changes.find(change => change.from.endsWith("context.md")).diff.after, "# Context\nOwner: @alice\n\n[a](../@bob/a.md)\n");
});

test("ordinary Markdown without a ledger header can move without creating a title or Owner", async t => {
  const f = await makeFixture(t); await f.put("docs/a.md", "ordinary note\n\n[b](b.md)\n"); await f.put("docs/b.md", "plain text\n");
  const plan = await reviewed(f, moveRequest());
  assert.equal(plan.decision, "ready");
  assert.equal(plan.changes[0].diff.after, "ordinary note\n\n[b](../b.md)\n");
  await assert.rejects(f.plan({ ...moveRequest("docs/a.md", "docs/@alice/a.md"), owner: "destination", intent: "adopt" }), { code: "OWNER_HEADER_REQUIRED" });
  await f.put("docs/a.md", "---\nbroken front matter\n");
  await assert.rejects(f.plan(moveRequest()), { code: "INVALID_FORMAT" });
});
