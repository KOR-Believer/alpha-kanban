import { describe, expect, it, vi } from "vitest";
import { analyzeDocumentMetadata, indexDocumentIds, previewDocumentMetadata, readDocumentMetadata, resumeMetadataPreview } from "../src/documentMetadata";

const id = "33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1";
const nextId = "15d42c34-1c96-4401-a771-24b9202fd341";
const path = "docs/01_search_plan.md";
const ownedPath = "docs/@alice/01_search_plan.md";
const source = "# 검색 계획\n\n작성일: 2026-10-28\n\n## 목표\n\n원문 [참조](../src/search.ts#lookup)\n";

describe("optional document metadata analysis", () => {
  it.each([
    [path, "", "unassigned"], [path, "Owner: @bob", "recorded-only"],
    [ownedPath, "", "legacy-adoption"], [ownedPath, "Owner: @bob", "reconcile"],
    [ownedPath, "Owner: @alice", "aligned"], [ownedPath, "Owner: invalid", "invalid"],
    [ownedPath, "Owner: @alice\nOwner: @alice", "invalid"], [ownedPath, "owner: @alice", "invalid"],
    ["docs/@@bad/01_search_plan.md", "", "invalid"], ["docs/nested/@alice/01_search_plan.md", "", "unassigned"],
  ])("classifies %s / %s without deriving history or requiring an ID", (path, header, expected) => {
    const markdown = source.replace("\n", `\n${header}\n`);
    const before = markdown;
    const analysis = analyzeDocumentMetadata(markdown, path);
    expect(analysis.ownerState).toBe(expected);
    expect(analysis.documentId.status).toBe("missing");
    expect(markdown).toBe(before);
    expect(analysis).not.toHaveProperty("previousPath"); expect(analysis).not.toHaveProperty("linksValid");
  });

  it("keeps other tools' YAML, comments and body fields opaque", () => {
    const markdown = `---\ntitle: Other title\nid: other-tool\nOwner: @yaml\nDocument-ID: bad\n---\n` +
      source + `\n<!-- Document-ID: bad -->\n\nOwner: @body\nDocument-ID: bad\n`;
    expect(readDocumentMetadata(markdown).owner.status).toBe("missing");
    expect(readDocumentMetadata(markdown).documentId.status).toBe("missing");
    const preview = previewDocumentMetadata({ markdown, path, assignId: true, generateId: () => id });
    expect(preview.after.replace(`Document-ID: ${id}\n`, "")).toBe(markdown);
    expect(preview.after).not.toContain("Ledger-Format:");
    expect(preview.after).not.toContain("Owner: @alice");
  });

  it.each(["bad", "00000000-0000-0000-0000-000000000000", "33cfe3fc-a0ab-1d1e-9b8b-f30501a2bac1", `${id}\nDocument-ID: ${id}`])("refuses invalid or duplicate ID %s instead of replacing it", (value) => {
    const markdown = source.replace("\n", `\nDocument-ID: ${value}\n`);
    expect(readDocumentMetadata(markdown).documentId.status).toBe("invalid");
    expect(() => previewDocumentMetadata({ markdown, path, assignId: true })).toThrow(/Invalid metadata/);
  });

  it.each(["\n", "\r\n"])("changes only requested header spans with %j and BOM", (eol) => {
    const markdown = "\uFEFF" + (`---\ntitle: Preserve\n---\n` + source.replace("\n", "\nOwner: @bob\n")).trimEnd().replaceAll("\n", eol);
    const preview = previewDocumentMetadata({ markdown, path: ownedPath, reconcileOwner: true });
    expect(preview.after).toBe(markdown.replace("Owner: @bob", "Owner: @alice"));
    expect(preview.documentId).toBeNull(); expect(preview.after.endsWith(eol)).toBe(false);
    expect(preview.edits).toHaveLength(1);
    expect(resumeMetadataPreview(JSON.parse(JSON.stringify(preview)), markdown, ownedPath)).toBe(preview.after);
    expect(resumeMetadataPreview(preview, preview.after, ownedPath)).toBe(preview.after);
    expect(() => resumeMetadataPreview(preview, markdown + "external", ownedPath)).toThrow(/changed/);
    expect(() => resumeMetadataPreview(preview, markdown, "docs/@bob/01_search_plan.md")).toThrow(/changed/);
  });

  it("fixes an ID in the plan once and is idempotent after apply, while explicit cloning gets a new ID", () => {
    const generateId = vi.fn(() => id);
    const preview = previewDocumentMetadata({ markdown: source, path, assignId: true, generateId });
    expect(generateId).toHaveBeenCalledOnce();
    expect(resumeMetadataPreview(preview, source, path)).toBe(preview.after);
    const repeated = previewDocumentMetadata({ markdown: preview.after, path, assignId: true, generateId });
    expect(repeated.edits).toEqual([]); expect(generateId).toHaveBeenCalledOnce();
    const uppercase = preview.after.replace(id, id.toUpperCase());
    expect(previewDocumentMetadata({ markdown: uppercase, path, assignId: true }).after).toBe(uppercase);
    const clone = previewDocumentMetadata({ markdown: uppercase, path, clone: true, generateId: () => nextId });
    expect(clone.after).toBe(uppercase.replace(id.toUpperCase(), nextId));
    expect(resumeMetadataPreview(clone, clone.after, path)).toBe(clone.after);
  });

  it("requires ordinary Markdown selection and refuses invalid formats, paths and stale plans", () => {
    expect(() => previewDocumentMetadata({ markdown: source, path: "notes.md", assignId: true })).toThrow(/explicitly/);
    const preview = previewDocumentMetadata({ markdown: source, path: "notes.md", allowPlainMarkdown: true, assignId: true });
    expect(readDocumentMetadata(preview.after).documentId.status).toBe("valid");
    for (const markdown of [source.replace("\n", "\nLedger-Format: 99\n"), "---\n" + source, "No title", source.replace("\n", "\r\n")]) {
      expect(() => previewDocumentMetadata({ markdown, path, assignId: true })).toThrow();
    }
    expect(() => previewDocumentMetadata({ markdown: source, path: "../01_test_plan.md", assignId: true })).toThrow();
    expect(() => previewDocumentMetadata({ markdown: source, path, reconcileOwner: true })).toThrow(/current docs/);
    expect(() => resumeMetadataPreview({ ...preview, after: "tampered" }, source, "notes.md")).toThrow(/changed/);
  });

  it("can independently select owner and ID, including a title without a final newline", () => {
    const both = previewDocumentMetadata({ markdown: "# Title", path: ownedPath, assignId: true, reconcileOwner: true, generateId: () => id });
    expect(both.after).toBe(`# Title\nDocument-ID: ${id}\nOwner: @alice`);
    expect(previewDocumentMetadata({ markdown: both.after, path: ownedPath, assignId: true, reconcileOwner: true }).edits).toEqual([]);
    const ownerOnly = previewDocumentMetadata({ markdown: source, path: ownedPath, reconcileOwner: true });
    expect(ownerOnly.after).toContain("Owner: @alice"); expect(ownerOnly.after).not.toContain("Document-ID");
  });

  it("indexes duplicate files within a project but never merges clones/checkouts or missing/invalid IDs", () => {
    const entries = [
      { projectId: "project-a", localId: "d_old", path, documentId: id },
      { projectId: "project-a", localId: "d_copy", path: ownedPath, documentId: id.toUpperCase() },
      { projectId: "worktree-b", localId: "d_other", path, documentId: id },
      { projectId: "project-a", localId: "d_legacy", path: "notes.md" },
      { projectId: "project-a", localId: "d_invalid", path: "bad.md", documentId: "bad" },
    ];
    const index = indexDocumentIds(entries);
    expect(index).toHaveLength(2);
    expect(index[0]).toMatchObject({ projectId: "project-a", status: "duplicate", documents: [{ localId: "d_old" }, { localId: "d_copy" }] });
    expect(index[1]).toMatchObject({ projectId: "worktree-b", status: "unique" });
    expect(entries[0]?.localId).toBe("d_old");
  });
});
