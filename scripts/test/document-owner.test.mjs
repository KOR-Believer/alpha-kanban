import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOwner, ownerFromPath, readOwnerHeader, checkNewOwner } from "../../skills/implementation-ledger/scripts/lib/document-owner.mjs";
import { parseSettings } from "../../skills/implementation-ledger/scripts/lib/document-settings.mjs";

test("Git-style settings support comments, quoting, BOM and case-insensitive keys without merging", () => {
  assert.deepEqual(parseSettings('\uFEFF[DOCUMENTS]\r\n  OwnerFolders = "true" # shared\r\n', "config"), { present: true, value: true });
  assert.equal(parseSettings('[USER]\n ID = @alice ; private\n', "user").value, "@alice");
  assert.equal(parseSettings('[user]\n id = "@ali"ce\n', "user").value, "@alice");
  assert.deepEqual(parseSettings('# empty\n[documents]\n', "config"), { present: false, value: null });
  for (const raw of ['[documents]\nownerFolders\n', '[documents "repo"]\nownerFolders=true\n', '[documents]\nownerFolders="true\n', '[documents]\nownerFolders=tr\\\nue\n', '[documents]\nownerFolders=true\n[documents]\nownerFolders=true\n', '[documents]\nownerFolders=TRUE\n']) assert.throws(() => parseSettings(raw, "config"));
});

test("owner identifiers are portable single path segments, not display names or inferred Git identities", () => {
  for (const value of ["@alice", "@alice.dev", "@홍길동", "@a_b-2"]) assert.equal(normalizeOwner(value), value);
  assert.equal(normalizeOwner("@홍길동".normalize("NFD")), "@홍길동");
  for (const value of ["@", "@@team", "@a.", "@../alice", "@a/b", "@a\\b", "@two people", " @alice", "@alice ", "@a\n", "@" + "가".repeat(81)]) assert.throws(() => normalizeOwner(value));
});

test("only docs direct @ children own paths; deeper @ names inherit their existing owner", () => {
  assert.equal(ownerFromPath("docs/@alice/research/@bob/01_plan.md").value, "@alice");
  for (const name of ["docs/01_plan.md", "docs/research/@alice/01_plan.md", "notes/@alice/01_plan.md", "@alice/01_plan.md"]) assert.equal(ownerFromPath(name).status, "unassigned");
  assert.equal(ownerFromPath("docs/@/01_plan.md").status, "invalid");
});

test("Owner is recognized only in the document header and leaves body examples alone", () => {
  const examples = [
    "# Plan\n\nOwner: @alice\n작성일: 2026-11-01\n\n## Goal\nOwner: @bob\n",
    "# Plan\n\nOwner: @alice\n\nA paragraph ends the header.\nOwner: @bob\n",
    "# Plan\n\nOwner: @alice\n\n```md\nOwner: @bob\n```\n",
    "# Plan\n\nOwner: @alice\n\n- Owner: @bob\n",
    "---\nowner: '@foreign'\n---\n\n# Plan\n\nOwner: @alice\n\n## Goal\n",
  ];
  for (const example of examples) for (const eol of ["\n", "\r\n"]) for (const bom of ["", "\uFEFF"]) assert.equal(checkNewOwner(bom + example.replaceAll("\n", eol), "@alice").value, "@alice");
  assert.equal(readOwnerHeader("# Basic\n\n## Body\nOwner: @alice\n").value, null);
  assert.equal(readOwnerHeader("# Basic\n\n```md\nOwner: @alice\n```\n").value, null);
  assert.equal(readOwnerHeader("---\nOwner: '@foreign'\n---\n# Basic\n").value, null);
});

test("invalid, duplicated or noncanonical header owners are not absence", () => {
  for (const header of ["Owner: @alice\nOwner: @alice", "Owner: @alice\nOwner: @bob", "owner: @alice", "Owner : @alice", "Owner:", 'Owner: "@alice"', "Owner: @alice # note", "Owner: ../alice"]) assert.throws(() => readOwnerHeader("# Plan\n\n" + header + "\n\n## Goal\n"));
  assert.throws(() => readOwnerHeader("---\nowner: @alice\n# Plan\n"));
  assert.throws(() => checkNewOwner("# Plan\n", "@alice"));
  assert.throws(() => checkNewOwner("# Plan\n\nOwner: @alice\n", null));
  assert.equal(checkNewOwner("# Plan\n\n작성일: 2026-11-01\n\n## Goal\n", null).value, null);
});
