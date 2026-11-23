import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, revisionFixture } from "../../docs/assets/alpha_kanban_git_revision_links/fixtures/repositories.mjs";
import { createRevisionCitation } from "../lib/revision-citation.mjs";
import { revisionCitation, formatRevisionLink, parseRevisionLink, normalizeGitRemote } from "../../packages/shared/src/revisionLinks.mjs";
import { reviewed, makeFixture, moveRequest } from "./document-fixtures.mjs";
import { applyDocumentPlan } from "../lib/document-transaction.mjs";

test("published evidence and a private commit survive standalone generation; dirty targets are rejected", t => {
  const root = mkdtempSync(join(tmpdir(), "ak-citation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = revisionFixture(root);
  for (const citation of [f.citation, f.explicit]) {
    assert.deepEqual(parseRevisionLink(citation.web), parseRevisionLink(citation.href));
    assert.match(citation.markdown, / · \[Web original\]/);
  }
  assert.match(f.explicit.web, /gitlab.com\/example\/team\/evidence\/-\/blob\/.*#L1-2$/);
  const cite = (extra = {}) => createRevisionCitation({ repo: "policy", file: "policies/refund.md", ...extra }, root);
  assert.equal(cite().target.commit, f.latest);
  assert.equal(cite().web, undefined);
  assert.equal(cite({ rev: f.old, heading: "Deadline" }).href, f.citation.href);
  assert.match(cite({ rev: f.old, lines: "2" }).web, /\?plain=1#L2$/);
  assert.equal(cite({ rev: f.old, file: "policies/gone.md" }).target.commit, f.old);
  assert.throws(() => cite({ rev: f.old, lines: "33" }), { code: "INVALID_LOCATION" });
  assert.equal(cite({ file: "한 글/(#%).md", heading: "#same-1" }).target.anchor, "same-1");
  assert.throws(() => cite({ file: "한 글/(#%).md", heading: "Same" }), { code: "INVALID_LOCATION" });
  assert.throws(() => cite({ file: "한 글/(#%).md", heading: "Ignored" }), { code: "INVALID_LOCATION" });
  writeFileSync(join(f.policy, "draft.md"), "DRAFT");
  assert.throws(() => cite({ file: "draft.md" }), { code: "NO_COMMITTED_FILE" });
  assert.equal(cite().target.commit, f.latest);
  const target = join(f.policy, "policies/refund.md"), working = readFileSync(target);
  writeFileSync(target, "working");
  assert.throws(() => cite(), { code: "UNCOMMITTED_FILE" });
  git(f.policy, "add", "policies/refund.md"); writeFileSync(target, working);
  assert.throws(() => cite(), { code: "UNCOMMITTED_FILE" });
  git(f.policy, "remote", "remove", "origin");
  const local = cite({ rev: f.old });
  assert.equal(local.target.repo, undefined); assert.equal(local.web, undefined);
  const installed = new URL("../../skills/implementation-ledger/scripts/document-cli.mjs", import.meta.url);
  const result = JSON.parse(execFileSync(process.execPath, [installed.pathname, "revision-link", "--file", "policies/refund.md", "--rev", f.old], { cwd: f.policy }));
  assert.deepEqual(result, local);
  git(f.policy, "remote", "add", "origin", "ssh://git@example.com/team/@archives/project.git");
  assert.deepEqual(cite({ rev: f.old }), local);
  assert.match(git(f.policy, "show", local.target.commit + ":" + local.target.path), /Seven days/);
});

test("an explicit revision resolves a removed directory in the target repository", t => {
  const root = mkdtempSync(join(tmpdir(), "ak-citation-moved-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = revisionFixture(root);
  git(f.policy, "mv", "policies/more", "relocated-terms");
  const file = join(f.policy, "policies/more/terms.md");
  const cited = createRevisionCitation({ file, rev: f.old, heading: "Exception" }, f.code);
  assert.deepEqual(cited.target, { commit: f.old, repo: f.citation.target.repo, path: "policies/more/terms.md", anchor: "exception" });
});

test("only immutable provider URLs and safe Git paths round-trip", () => {
  const oid = "abcd".repeat(10);
  for (const repo of ["github.com/acme/p", "gitlab.com/acme/team/p", "git.example.test/repo", undefined]) {
    for (const anchor of ["L2-L5", "한글-정책", undefined]) {
      const citation = revisionCitation({ repo, commit: oid, path: "참조/(a) #%?.md", anchor }, { published: true });
      assert.deepEqual(parseRevisionLink(citation.href), citation.target);
      if (citation.web) assert.deepEqual(parseRevisionLink(citation.web), citation.target);
    }
  }
  assert.equal(normalizeGitRemote("https://user:token@github.com/acme/p.git"), "github.com/acme/p");
  for (const bad of ["/x", "../a", ".git/config", "a\\b", "a//b"]) assert.throws(() => formatRevisionLink({ commit: oid, path: bad }));
  for (const bad of ["web+akgit:/" + oid + "/%2Fetc", "https://github.com/acme/p/blob/main/a", "https://github.com/acme/p/blob/deadbeef/a",
    "https://github.com/acme/pull/7", "https://github.com/acme/p/blob/" + oid + "/a#L5-L2"]) assert.equal(parseRevisionLink(bad), undefined);
});

test("moving a record updates ordinary backlinks but leaves inline and reference-style citations byte-exact", async t => {
  const f = await makeFixture(t), c = revisionCitation({ repo: "github.com/acme/p", commit: "ab".repeat(20), path: "docs/a.md", anchor: "L1" }, { published: true });
  const unchanged = c.markdown + "\n\n[Past][a] · [Original][b]\n\n[a]: " + c.href + "\n[b]: " + c.web + "\n";
  await f.put("docs/a.md", "# A\n");
  await f.put("docs/cite.md", "# Citation\n\n" + unchanged + "\n[Local](a.md)\n");
  const plan = await reviewed(f, moveRequest());
  assert.equal(plan.decision, "ready");
  assert.equal((await applyDocumentPlan(plan, { cwd: f.root, home: f.home, approve: plan.id })).status, "completed");
  assert.equal(readFileSync(join(f.root, "docs/cite.md"), "utf8"), "# Citation\n\n" + unchanged + "\n[Local](nested/a.md)\n");
});
