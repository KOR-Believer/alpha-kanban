import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewDocumentMigrations, inspectLegacySections } from "../src/documentMigration.mjs";
import { parseTicketDocument } from "../src/ticketMarkdown";

const legacy = readFileSync(new URL("../../../docs/02_alpha_kanban_tickets.md", import.meta.url), "utf8");
const path = "docs/02_test_tickets.md";
const uuid = "8fbbabf1-8c97-4e17-ae58-4105bf3e523c";
const run = (markdown = legacy, extra: Record<string, unknown> = {}) => previewDocumentMigrations({ root: "/repo", documents: [{ path, markdown, writable: true }], targets: [{ path, cleanupLegacy: true }], ...extra });
describe("explicit document migration", () => {
  it("removes only the demonstrated duplicate table, preserving ticket facts and every other byte", () => {
    const result = run(); expect(result.decision).toBe("ready");
    const range = result.rules[0]!;
    expect(result.changes[0]!.after).toBe(legacy.slice(0, range.start) + legacy.slice(range.end));
    const semantics = (text: string) => JSON.parse(JSON.stringify(parseTicketDocument(text).tickets, (key, value) => ["range", "lineStart", "lineEnd", "startLine", "endLine"].includes(key) ? undefined : value));
    expect(semantics(result.changes[0]!.after)).toEqual(semantics(legacy));
    expect(result.changes[0]!.after).toContain("## Ticket Template");
    expect(run(result.changes[0]!.after).decision).toBe("noop");
  });
  it.each([
    legacy.replace("| AKB-00 | DONE", "| OLD-999 | TODO"),
    legacy.replace(/\| AKB-0[1-7] \|[^\n]*\n/g, ""),
    legacy.replace("| AKB-00 |", "| AKB-01 |"),
    legacy.replace("| AKB-00 | DONE | 100%", "| MISSING-900 | old state | obsolete progress"),
  ])("removes recognized old boards regardless of body values, IDs or row count", (markdown) => {
    const result = run(markdown); expect(result.decision).toBe("ready");
    expect(result.changes[0]!.after).not.toMatch(/^## Progress Board$/m);
    expect(result.changes[0]!.after.slice(result.changes[0]!.after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
  });
  it("preserves notes and the heading while removing only a recognized table", () => {
    const markdown = legacy.replace("## Progress Board\n", "## Progress Board\n\nKeep my note.\n");
    const result = run(markdown); expect(result.decision).toBe("ready");
    expect(result.changes[0]!.after).toContain("## Progress Board\n\nKeep my note.");
    expect(result.changes[0]!.after).not.toContain("| Ticket | Status |");
    expect(result.retained[0]!.code).toBe("LEGACY_NOTES_PRESERVED");
    expect(result.rules[0]!.tableOnly).toBe(true);
    expect(run(result.changes[0]!.after).decision).toBe("noop");
  });
  it.each([
    legacy.replace("| Ticket | Status | Progress | Repository | Depends on |", "| Ticket | Status | Progress | Repository | Notes |"),
    legacy.replace("## Progress Board", "## My Progress Board"),
    legacy.replace("| AKB-00 | DONE | 100% |", "| AKB-00 | DONE | 100% | Extra |"),
  ])("preserves different titles, columns and malformed table structure", (markdown) => {
    expect(run(markdown).decision).toBe("noop"); expect(run(markdown).changes).toEqual([]);
  });
  it("leaves a fenced table example alone even beneath a matching heading", () => {
    const section = inspectLegacySections(legacy, path).removals[0]!;
    const body = legacy.slice(section.start, section.end);
    const markdown = legacy.slice(0, section.start) + body.replace("\n\n|", "\n\n```md\n|").trimEnd() + "\n```\n\n" + legacy.slice(section.end);
    expect(run(markdown).decision).toBe("noop");
  });
  it("keeps ID and cleanup independent, reuses reviewed IDs and preserves BOM/CRLF/unknown metadata", () => {
    const markdown = "\uFEFF" + legacy.replace(/\n/g, "\r\n");
    const result = run(markdown, { targets: [{ path, assignId: true }], generatedIds: { [path]: uuid } });
    expect(result.changes[0]!.after.replace(`Document-ID: ${uuid}\r\n`, "")).toBe(markdown);
    expect(result.changes[0]!.after).not.toMatch(/Completed at:|Updated at:|Ledger-Format:/);
    expect(run(result.changes[0]!.after, { targets: [{ path, assignId: true }] }).decision).toBe("noop");
    const combined = run(markdown, { targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(combined.changes[0]!.after).toContain(`Document-ID: ${uuid}\r\n`);
    expect(combined.changes[0]!.after).not.toContain("## Progress Board\r\n");
  });
  it.each(["Ledger-Format: 999", "Ledger-Format: bad", "Document-ID: bad", "Owner: bad"])("refuses invalid or future headers: %s", (header) => {
    expect(run(legacy.replace(/\n/, `\n${header}\n`)).decision).toBe("blocked");
  });
  it("blocks deleting referenced headings and repairs surviving duplicate heading fragments", () => {
    const markdown = legacy + "\n# Progress Board\nKeep this different section.\n";
    const documents = [{ path, markdown, writable: true }, { path: "docs/index.md", markdown: "# Index\n[x](02_test_tickets.md#progress-board-1)\n", writable: true }];
    const result = run(markdown, { documents });
    expect(result.decision).toBe("ready"); expect(result.changes.find((c) => c.path === "docs/index.md")?.after).toContain("#progress-board)");
    expect(run(markdown, { documents: [documents[0]!, { ...documents[1]!, writable: false }] }).issues.some((i) => i.code === "OUTSIDE_WRITE_SCOPE")).toBe(true);
    expect(run(markdown, { documents: [documents[0]!, { path: "README.md", markdown: `[x](docs/02_test_tickets.md#progress-board)`, writable: false }] }).issues.some((i) => i.code === "DELETED_OR_UNKNOWN_ANCHOR")).toBe(true);
  });
  it("does not hide ambiguous anchors, custom HTML/wiki links or duplicate IDs", () => {
    expect(run(legacy + '\n<a href="#progress-board">x</a>').decision).toBe("blocked");
    expect(run(legacy + '\n[[02_test_tickets#Progress Board]]').decision).toBe("blocked");
    const withId = legacy.replace(/\n/, `\nDocument-ID: ${uuid}\n`);
    expect(run(withId, { documents: [{ path, markdown: withId, writable: true }, { path: "docs/copy.md", markdown: withId }] }).decision).toBe("blocked");
  });
  it("does not classify unrelated sections or unsupported embedded templates as removable", () => {
    expect(inspectLegacySections("# Plain\n## Ticket Template\n```md\n## Progress Board\n```", "docs/readme.md").removals).toEqual([]);
    expect(run("# Plain\n", { targets: [{ path, assignId: true }] }).decision).toBe("blocked");
  });
});
