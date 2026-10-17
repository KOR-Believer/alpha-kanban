import { describe, expect, it } from "vitest";
import { appendUserInstruction, parseTicketDocument, updateTicketStatusAndProgress } from "@alpha-kanban/shared/ticketMarkdown";
import { inferMarkdownFileType, inferSequenceNumber, inferSlug, parseMarkdownOutline } from "@alpha-kanban/shared/documents";
import { ledger } from "./browserFixtures";

describe("shared Markdown mutation safety", () => {
  it("keeps native Windows document naming compatible with browser-relative names", () => {
    const path = "C:\\workspace\\project\\docs\\07_example_tickets.md";
    expect(inferMarkdownFileType(path)).toBe("tickets");
    expect(inferSequenceNumber(path)).toBe(7);
    expect(inferSlug(path)).toBe("example");
  });
  it("preserves the second ticket byte-for-byte", () => {
    const next = updateTicketStatusAndProgress(ledger, "TEST-01", { status: "DONE", progress: 100, reason: "ok" });
    expect(next.slice(next.indexOf("### TEST-02"))).toBe(ledger.slice(ledger.indexOf("### TEST-02")));
  });
  it.each([
    ledger.replace("### TEST-02.", "### TEST-01."),
    ledger.replace("Progress: 25%", "Progress: 25%\nProgress: 50%"),
    ledger.replace("## Status", "## Status\n\n## Status"),
    ledger.replace("- 현재 진행률:", "- 현재 진행률: 0 / 2 tickets\n- 현재 진행률:"),
    ledger.replace("Status: READY", "Status: READY\r"),
  ])("refuses ambiguous documents without selecting an arbitrary target", (source) => {
    expect(() => updateTicketStatusAndProgress(source, "TEST-01", { status: "DONE" })).toThrow();
    expect(() => appendUserInstruction(source, "TEST-01", "new")).toThrow();
  });
  it("ignores fenced headings and canonical fields while preserving examples", () => {
    const example = "\n~~~md\n### TEST-01. example\nStatus: DONE\nProgress: 100%\n## Status\n~~~\n";
    const source = ledger.replace("Keep this unknown section.", example);
    expect(parseTicketDocument(source).tickets).toHaveLength(2);
    const result = appendUserInstruction(source, "TEST-01", "new");
    expect(result).toContain(example);
    expect(parseMarkdownOutline("\uFEFF# Title\n" + example).map((item) => item.title)).toEqual(["Title"]);
  });
  it("preserves LF/CRLF, BOM and absence of trailing newline", () => {
    for (const newline of ["\n", "\r\n"]) for (const bom of ["", "\uFEFF"]) {
      const source = bom + ledger.trimEnd().replaceAll("\n", newline);
      const result = appendUserInstruction(source, "TEST-01", "manual");
      expect(result.startsWith("\uFEFF")).toBe(Boolean(bom));
      expect(result.endsWith("\n")).toBe(false);
      if (newline === "\r\n") expect(result.replaceAll("\r\n", "")).not.toContain("\n");
    }
  });
});
