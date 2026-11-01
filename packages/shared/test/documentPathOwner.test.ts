import { describe, expect, it } from "vitest";
import { buildDocumentSets, inferDocumentPathOwner, normalizeDocumentOwner } from "../src/documents.js";
import type { MarkdownFileSummary } from "../src/index.js";
import { normalizeOwner, ownerFromPath } from "../../../skills/implementation-ledger/scripts/lib/document-owner.mjs";

describe("visible project-relative document ownership", () => {
  it.each([
    ["docs/@alice/01_search_tickets.md", "owned", "@alice"],
    ["docs/@alice/archive/@bob/01_search_plan.md", "owned", "@alice"],
    ["docs/@홍길동/01_search_plan.md".normalize("NFD"), "owned", "@홍길동"],
    ["docs/@Alice/01_search_plan.md", "owned", "@Alice"],
    ["docs/01_search_plan.md", "unassigned", null],
    ["docs/research/@alice/01_search_plan.md", "unassigned", null],
    ["@alice/01_search_plan.md", "unassigned", null],
    ["01_search_plan.md", "unassigned", null],
    ["other/docs/@alice/01_search_plan.md", "unassigned", null],
    ["docs/@/01_search_plan.md", "invalid", null],
    ["docs/@@team/01_search_plan.md", "invalid", null],
    ["docs/@alice./01_search_plan.md", "invalid", null],
  ] as const)("classifies %s without hidden parents or metadata", (path, status, value) => {
    expect(inferDocumentPathOwner(path)).toEqual({ status, value });
    expect(ownerFromPath(path)).toMatchObject({ status, value });
  });

  it("requires an owner directory, not a Markdown filename starting with @", () => {
    expect(inferDocumentPathOwner("docs/@notes.md")).toEqual({ status: "unassigned", value: null });
  });

  it("stays in agreement with the installed skill's identifier contract", () => {
    for (const value of ["@alice", "@ALICE", "@123", "@홍길동".normalize("NFD"), "@alice.dev", "@a_b-c", "@", "@@x", "@a.", "@a b", "@a/b", "@a\\b", "@a\u0000", "@" + "a".repeat(239), "@" + "a".repeat(240)]) {
      let expected = null;
      try { expected = normalizeOwner(value); } catch { /* Invalid is not absence for the CLI. */ }
      expect(normalizeDocumentOwner(value), value).toBe(expected);
    }
  });

  it("keeps equal slugs, numbers and filenames separate across owner paths", () => {
    const files = ["docs/@alice", "docs/@bob", "docs"].map((directory, index) => ({
      id: `d_${index}`, workspaceId: "bw_project", type: "tickets", directory, filename: "01_search_tickets.md",
      relativePath: `${directory}/01_search_tickets.md`, workspaceRelativePath: `${directory}/01_search_tickets.md`,
      hash: "same-content", mtimeMs: 1, slug: "search", sequenceNumber: 1,
    } as MarkdownFileSummary));
    const sets = buildDocumentSets(files);
    expect(new Set(sets.map((set) => set.id)).size).toBe(3);
    expect(sets.map((set) => set.pathOwner?.value).sort()).toEqual(["@alice", "@bob", null].sort());
    expect(sets.flatMap((set) => set.documents)).toHaveLength(3);
  });
});
