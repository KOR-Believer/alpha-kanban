import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewDocumentMigrations, inspectLegacySections } from "../src/documentMigration.mjs";
import { parseTicketDocument } from "../src/ticketMarkdown";

const fullLegacy = readFileSync(new URL("../../../docs/02_alpha_kanban_tickets.md", import.meta.url), "utf8");
// Progress Board cases isolate that rule; fullLegacy exercises all four sections below.
const legacy = fullLegacy.replace(/^## (?:티켓 상태|Progress 기준|Ticket Template)\n[\s\S]*?(?=^## )/gm, "");
const path = "docs/02_test_tickets.md";
const uuid = "8fbbabf1-8c97-4e17-ae58-4105bf3e523c";
const run = (markdown = legacy, extra: Record<string, unknown> = {}) => previewDocumentMigrations({ root: "/repo", documents: [{ path, markdown, writable: true }], targets: [{ path, cleanupLegacy: true }], ...extra });
describe("explicit document migration", () => {
  it.each(["\n", "\r\n"])("corrects Owner to the nearest folder and preserves ID, body and line endings %j", (eol) => {
    const target = "docs/@bob/archive/@alice/02_test_tickets.md";
    const markdown = "\uFEFF" + legacy.replace(/\n/, `\nOwner: @previous-owner\nDocument-ID: ${uuid}\n`).replaceAll("\n", eol);
    const request = { root: "/repo", documents: [{ path: target, markdown, writable: true }], targets: [{ path: target, reconcileOwner: true }] };
    const result = previewDocumentMigrations(request);
    expect(result.decision).toBe("ready"); expect(result.generatedIds).toEqual({});
    expect(result.changes[0]!.after).toBe(markdown.replace("Owner: @previous-owner", "Owner: @alice"));
    expect(previewDocumentMigrations({ ...request, documents: [{ ...request.documents[0]!, markdown: result.changes[0]!.after }] }).decision).toBe("noop");
  });

  it("combines missing Owner and ID with cleanup without changing actual tickets or unrelated broken links", () => {
    const target = "docs/@bob/@alice/02_test_tickets.md";
    const result = previewDocumentMigrations({ root: "/repo", documents: [
      { path: target, markdown: fullLegacy, writable: true },
      { path: "README.md", markdown: "# Index\n[x](file:///other/pc/missing.md)\n", writable: false },
    ], targets: [{ path: target, assignId: true, cleanupLegacy: true, reconcileOwner: true }], generatedIds: { [target]: uuid } });
    expect(result.decision).toBe("ready"); expect(result.changes).toHaveLength(1);
    const after = result.changes[0]!.after;
    expect(after).toContain("Owner: @alice\n"); expect(after).toContain(`Document-ID: ${uuid}\n`);
    expect(after).not.toContain("## Progress Board\n");
    expect(after.slice(after.indexOf("## Ticket List"))).toBe(fullLegacy.slice(fullLegacy.indexOf("## Ticket List")));
  });

  it.each(["docs/02_test_tickets.md", "docs/@bob/@/02_test_tickets.md"])("keeps Owner when the path has no confirmed owner while other maintenance proceeds: %s", (target) => {
    const markdown = legacy.replace(/\n/, "\nOwner: @previous-owner\n");
    const result = previewDocumentMigrations({ root: "/repo", documents: [{ path: target, markdown, writable: true }], targets: [{ path: target, assignId: true, cleanupLegacy: true, reconcileOwner: true }], generatedIds: { [target]: uuid } });
    expect(result.decision).toBe("ready");
    expect(result.changes[0]!.after).toContain("Owner: @previous-owner\n");
    expect(result.changes[0]!.after).toContain(`Document-ID: ${uuid}\n`);
    expect(result.retained).toContainEqual(expect.objectContaining({ code: "OWNER_PATH_UNRESOLVED" }));
    const basic = run(legacy, { targets: [{ path, reconcileOwner: true }] });
    expect(basic.decision).toBe("noop"); expect(basic.retained).toEqual([]);
  });

  it.each(["Owner: invalid", "Owner: @alice\nOwner: @bob"])("does not guess how to repair malformed or duplicated Owner records: %s", (header) => {
    const target = "docs/@bob/@alice/02_test_tickets.md", markdown = legacy.replace(/\n/, `\n${header}\n`);
    const result = previewDocumentMigrations({ root: "/repo", documents: [{ path: target, markdown, writable: true }], targets: [{ path: target, assignId: true, cleanupLegacy: true, reconcileOwner: true }] });
    expect(result.decision).toBe("blocked"); expect(result.changes).toEqual([]);
  });

  it("removes only the demonstrated duplicate table, preserving ticket facts and every other byte", () => {
    const result = run(); expect(result.decision).toBe("ready");
    const range = result.rules[0]!;
    expect(result.changes[0]!.after).toBe(legacy.slice(0, range.start) + legacy.slice(range.end));
    const semantics = (text: string) => JSON.parse(JSON.stringify(parseTicketDocument(text).tickets, (key, value) => ["range", "lineStart", "lineEnd", "startLine", "endLine"].includes(key) ? undefined : value));
    expect(semantics(result.changes[0]!.after)).toEqual(semantics(legacy));
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
  it("keeps referenced headings and their duplicate suffixes without editing another document", () => {
    const markdown = legacy + "\n# Progress Board\nKeep this different section.\n";
    const documents = [{ path, markdown, writable: true }, { path: "docs/index.md", markdown: "# Index\n[x](02_test_tickets.md#progress-board-1)\n", writable: true }];
    const result = run(markdown, { documents });
    expect(result.decision).toBe("noop"); expect(result.changes).toEqual([]); expect(result.issues).toEqual([]);
    expect(result.retained).toContainEqual(expect.objectContaining({ section: "Progress Board", code: "LEGACY_REFERENCED_SECTION" }));
    expect(run(markdown, { documents: [documents[0]!, { ...documents[1]!, writable: false }] }).decision).toBe("noop");
    expect(run(markdown, { documents: [documents[0]!, { path: "README.md", markdown: `[x](docs/02_test_tickets.md#progress-board)`, writable: false }] }).decision).toBe("noop");
  });
  it("preserves sections linked by literal HTML/wiki references without treating them as errors", () => {
    for (const link of ['<a href="#progress-board">x</a>', '[[02_test_tickets#Progress Board]]']) {
      const result = run(legacy + "\n" + link);
      expect(result.decision).toBe("noop"); expect(result.issues).toEqual([]);
      expect(result.retained.some(({ code }) => code === "LEGACY_REFERENCED_SECTION")).toBe(true);
    }
  });
  it("still refuses duplicate document IDs", () => {
    const withId = legacy.replace(/\n/, `\nDocument-ID: ${uuid}\n`);
    expect(run(withId, { documents: [{ path, markdown: withId, writable: true }, { path: "docs/copy.md", markdown: withId }] }).decision).toBe("blocked");
  });
  it("does not classify unrelated sections or unsupported embedded templates as removable", () => {
    expect(inspectLegacySections("# Plain\n## Ticket Template\n```md\n## Progress Board\n```", "docs/readme.md").removals).toEqual([]);
    expect(run("# Plain\n", { targets: [{ path, assignId: true }] }).decision).toBe("ready");
  });

  it.each(["\n", "\r\n"])("removes all four legacy sections including dated template examples, preserving ticket bytes and %j", (eol) => {
    const markdown = "\uFEFF" + fullLegacy.trimEnd().replaceAll("\n", eol);
    const result = run(markdown, { targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.decision).toBe("ready");
    expect(result.rules.map(({ rule }) => rule).sort()).toEqual(["legacy-progress-board-v1", "legacy-progress-guide-v1", "legacy-ticket-status-v1", "legacy-ticket-template-v1"].sort());
    const after = result.changes[0]!.after;
    expect(after).toContain(`Document-ID: ${uuid}${eol}`);
    expect(after.startsWith("\uFEFF")).toBe(true); expect(after.endsWith(eol)).toBe(false);
    expect(after).not.toMatch(/^## (?:Progress Board|티켓 상태|Progress 기준|Ticket Template)$/m);
    expect(after).not.toContain("사용자 요청 또는 작업 방향을 기록한다.");
    expect(after.slice(after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
    const tickets = (text: string) => JSON.parse(JSON.stringify(parseTicketDocument(text).tickets, (key, value) => ["range", "lineStart", "lineEnd", "startLine", "endLine"].includes(key) ? undefined : value));
    expect(tickets(after)).toEqual(tickets(markdown));
    expect(run(after, { targets: [{ path, assignId: true, cleanupLegacy: true }] }).decision).toBe("noop");
  });

  it("maintains incomplete and noncanonical tickets without rewriting them", () => {
    const markdown = fullLegacy.replace("Status: DONE", "Status: WATCH").replace("Progress: 100%", "Progress: 80%")
      .replace(/^제외 범위:\n[\s\S]*?(?=^완료 기준:)/m, "");
    const result = run(markdown, { targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.decision).toBe("ready");
    const after = result.changes[0]!.after;
    expect(after.slice(after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
    expect(after).toContain("Status: WATCH"); expect(after).toContain("Progress: 80%");
  });

  it("preserves extra prose around glossary lists and template fences", () => {
    const sample = "```md\n### EX-00. Example\nStatus: READY\nProgress: 25%\n사용자 지시:\n- 2026-07-10: Sample direction\n진행 메모:\n- 2026-07-10: Sample note\n```\n";
    const markdown = "# Title\n\n## 티켓 상태\n\n- `WATCH`: 예전 상태\n\nKeep status policy.\n\n## Progress 기준\n\n- `80%`: 예전 단계\n\nKeep progress policy.\n\n## Ticket Template\n\n새 티켓을 추가할 때는 아래 형식을 따른다.\n\n" + sample + "\nKeep template note.\n\n## Ticket List\n\n### LIVE-01. Actual ticket\nStatus: WATCH\nProgress: 80%\n";
    const result = run(markdown); expect(result.decision).toBe("ready");
    const after = result.changes[0]!.after;
    expect(after).not.toContain("Sample direction"); expect(after).not.toContain("Sample note");
    expect(after).not.toContain("새 티켓을 추가할 때는");
    for (const note of ["Keep status policy.", "Keep progress policy.", "Keep template note."]) expect(after).toContain(note);
    expect(result.retained.map(({ section }) => section)).toEqual(["티켓 상태", "Progress 기준", "Ticket Template"]);
    expect(after.slice(after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
  });

  it.each([
    "## 티켓 상태\n\n- Business decision must stay.\n",
    "## Progress 기준\n\nKeep this explanation.\n",
    "## Ticket Template\n\n### REAL-01. Unfenced work\nStatus: READY\nProgress: 25%\n",
    "## Ticket Template\n\n```md\n### EX-01. Unclosed sample\nStatus: READY\nProgress: 25%\n",
    "> ## 티켓 상태\n> - `TODO`: Quoted documentation\n",
  ])("preserves unrelated or unbounded content under similar headings", (section) => {
    const markdown = "# Title\n\n" + section;
    const result = run(markdown);
    expect(result.decision).toBe("noop"); expect(result.changes).toEqual([]);
  });

  it("leaves matching subheadings and fenced examples inside actual tickets unchanged", () => {
    const markdown = "# Title\n\n## Ticket List\n\n### REAL-01. Work\nStatus: WATCH\nProgress: 80%\n\n### 티켓 상태\n- `TODO`: Keep\n\n```md\n## Ticket Template\n### EX-01. Keep\nStatus: READY\nProgress: 25%\n```\n";
    expect(run(markdown).decision).toBe("noop");
    const result = run(markdown, { targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.changes[0]!.after.replace(`Document-ID: ${uuid}\n`, "")).toBe(markdown);
  });

  it.each(["티켓-상태", "progress-기준", "ticket-template"])("keeps the referenced guide %s and cleans the other sections", (anchor) => {
    const result = run(fullLegacy + `\n[Keep](#${anchor})\n`);
    expect(result.decision).toBe("ready"); expect(result.issues).toEqual([]);
    expect(result.rules).toHaveLength(3);
    expect(result.retained.filter(({ code }) => code === "LEGACY_REFERENCED_SECTION")).toHaveLength(1);
    expect(result.changes[0]!.after).toContain(`[Keep](#${anchor})`);
  });

  it("keeps a heading that affects a ticket link while cleaning other sections", () => {
    const markdown = fullLegacy + "\n[Keep](#ticket-template-1)\n\n## Notes\n\n# Ticket Template\nKeep this other heading.\n";
    const result = run(markdown);
    expect(result.decision).toBe("ready"); expect(result.issues).toEqual([]);
    expect(result.changes[0]!.after).toContain("## Ticket Template");
    expect(result.changes[0]!.after).not.toMatch(/^## Progress Board$/m);
    expect(result.changes[0]!.after.slice(result.changes[0]!.after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
  });

  it("ignores unrelated broken/wiki/HTML/absolute links and changes only selected targets", () => {
    const noise = "# Other\n[[not-this-document#Unknown]]\n<a href='missing.md#missing'>link</a>\n[PC](file:///old/checkout/docs/02_test_tickets.md#progress-board)\n[Broken](missing.md)\n[Bad](%zz.md#bad)\n[Unknown](docs/02_test_tickets.md#already-missing)\n";
    const documents = [{ path, markdown: fullLegacy, writable: true }, ...["CLAUDE.md", "inbox/other.md", "archive/report.md"].map((path) => ({ path, markdown: noise + fullLegacy, writable: true }))];
    const result = run(fullLegacy, { documents, targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.decision).toBe("ready"); expect(result.issues).toEqual([]); expect(result.rules).toHaveLength(4);
    expect(result.changes.map((change) => change.path)).toEqual([path]);
    expect(result.changes[0]!.after).toContain(`Document-ID: ${uuid}`);
    expect(result.references).toEqual([]);
  });

  it("continues ID assignment and cleanup when one section is referenced", () => {
    const documents = [{ path, markdown: fullLegacy, writable: true }, { path: "README.md", markdown: `[Board](docs/02_test_tickets.md?view=markdown#progress-board)`, writable: false }];
    const result = run(fullLegacy, { documents, targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.decision).toBe("ready"); expect(result.issues).toEqual([]); expect(result.changes).toHaveLength(1);
    const after = result.changes[0]!.after;
    expect(after).toContain(`Document-ID: ${uuid}`); expect(after).toContain("## Progress Board");
    expect(after).not.toMatch(/^## (?:티켓 상태|Progress 기준|Ticket Template)$/m);
    expect(after.slice(after.indexOf("## Ticket List"))).toBe(fullLegacy.slice(fullLegacy.indexOf("## Ticket List")));
    expect(run(after, { documents: [{ ...documents[0]!, markdown: after }, documents[1]!] }).decision).toBe("noop");
  });

  it("assigns an ID when every cleanup candidate must remain", () => {
    const markdown = fullLegacy + "\n[1](#progress-board) [2](#티켓-상태) [3](#progress-기준) [4](#ticket-template)\n";
    const result = run(markdown, { targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: uuid } });
    expect(result.decision).toBe("ready"); expect(result.rules).toEqual([]); expect(result.issues).toEqual([]);
    expect(result.changes[0]!.after.replace(`Document-ID: ${uuid}\n`, "")).toBe(markdown);
  });

  it("does not retain sections for unused definitions, code examples or links being removed", () => {
    const markdown = fullLegacy.replace("- `TODO`: 아직 시작하지 않음", "- `TODO`: [old guide](#progress-board)") + "\n[unused]: #progress-board\n\n```md\n[x](#ticket-template)\n- 기준 문서: `docs/02_test_tickets.md#progress-board`\n```\n`[x](#progress-기준)`\n";
    const result = run(markdown); expect(result.decision).toBe("ready"); expect(result.rules).toHaveLength(4);
    expect(result.retained).toEqual([]);
  });

  it("keeps referenced partial sections and follows links exposed by keeping them", () => {
    const markdown = fullLegacy.replace("- `TODO`: 아직 시작하지 않음", "- `TODO`: [old board](#progress-board)") + "\n[guide][state]\n\n[state]: #티켓-상태\n";
    const result = run(markdown); expect(result.decision).toBe("ready"); expect(result.rules).toHaveLength(2);
    expect(result.changes[0]!.after).toContain("## 티켓 상태"); expect(result.changes[0]!.after).toContain("## Progress Board");
    const partial = legacy.replace("## Progress Board\n", "## Progress Board\n\nKeep note.\n") + "\n[x](#progress-board)\n";
    expect(run(partial).decision).toBe("noop");
  });

  it("recognizes exact native absolute targets but never guesses another PC's root", () => {
    const documents = [{ path, markdown: fullLegacy, writable: true }, { path: "README.md", markdown: `[board](file:///repo/${path}#progress-board)` }];
    expect(run(fullLegacy, { documents }).rules).toHaveLength(3);
    expect(run(fullLegacy, { documents, relativeReferencesOnly: true }).rules).toHaveLength(4);
    documents[1]!.markdown = `[board](file:///another-repo/${path}#progress-board)`;
    expect(run(fullLegacy, { documents }).rules).toHaveLength(4);
  });

  it("keeps only contributing duplicate headings when a numbered heading depends on both", () => {
    const section = inspectLegacySections(fullLegacy, path).sections.find((section) => section.section === "Progress Board")!;
    const extra = fullLegacy.slice(section.start, section.end);
    const markdown = fullLegacy.replace("## Ticket List", extra + "## Ticket List") + "\n[Keep](#progress-board-1-1)\n\n## Notes\n\n# Progress Board-1\nKeep this heading.\n";
    const result = run(markdown); expect(result.decision).toBe("ready"); expect(result.issues).toEqual([]);
    expect(result.retained.filter(({ code }) => code === "LEGACY_REFERENCED_SECTION").map(({ section }) => section)).toEqual(["Progress Board", "Progress Board"]);
    expect(result.rules).toHaveLength(3);
    expect(result.changes[0]!.after).not.toMatch(/^## (?:티켓 상태|Progress 기준|Ticket Template)$/m);
    expect(result.changes[0]!.after.slice(result.changes[0]!.after.indexOf("## Ticket List"))).toBe(markdown.slice(markdown.indexOf("## Ticket List")));
  });
});
