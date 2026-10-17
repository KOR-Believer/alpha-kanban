import type { DocumentSetSummary, MarkdownFileSummary, MarkdownFileType } from "@alpha-kanban/shared";
import { buildDocumentSets, sumDocumentSetTicketProgress } from "@alpha-kanban/shared/documents";
import { describe, expect, it } from "vitest";
import { DEFAULT_DOCUMENT_FILTERS, filterDocumentSets } from "./documentSetFiltering";

function file(filename: string, type: MarkdownFileType, slug: string): MarkdownFileSummary {
  return { id: filename, workspaceId: "workspace", type, filename, slug, directory: "docs/auth",
    relativePath: `docs/auth/${filename}`, workspaceRelativePath: `docs/auth/${filename}`, hash: filename, mtimeMs: 1 };
}

const sets = buildDocumentSets([
  file("01_account_plan.md", "plan", "account"),
  file("02_account_tickets.md", "tickets", "account"),
  file("account-notes.md", "markdown", "account"),
  file("README.md", "markdown", "readme"),
  file("solo_inventory.md", "inventory", "solo"),
]);

describe("document sidebar filters", () => {
  it("leaves source groups, ordering and progress untouched", () => {
    const before = structuredClone(sets);
    const visible = filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS);
    expect(visible.map((item) => item.documentSet)).toEqual(sets);
    expect(visible[0]!.documentSet).toBe(sets[0]);
    expect(sets).toEqual(before);
  });

  it("hides ordinary Markdown, not standalone plans, tickets or inventories", () => {
    const visible = filterDocumentSets(sets, "", { ...DEFAULT_DOCUMENT_FILTERS, hidePlainMarkdown: true });
    expect(visible.map((item) => item.documentSet.slug)).toEqual(["account", "solo"]);
    expect(visible[0]!.documents.map((item) => item.type)).toEqual(["plan", "tickets"]);
    expect(visible[0]!.documentSet.documents).toHaveLength(3);
    expect(visible[1]!.documents).toHaveLength(1);
  });

  it("searches group names and file paths case-insensitively, retaining linked documents", () => {
    const visible = filterDocumentSets(sets, "  AUTH ACCOUNT_TICKETS ", DEFAULT_DOCUMENT_FILTERS);
    expect(visible.map((item) => item.documentSet.slug)).toEqual(["account"]);
    expect(visible[0]!.documents).toHaveLength(3);
    expect(filterDocumentSets(sets, "account notes", { ...DEFAULT_DOCUMENT_FILTERS, hidePlainMarkdown: true })).toEqual([]);
    expect(filterDocumentSets(sets, "not-here", DEFAULT_DOCUMENT_FILTERS)).toEqual([]);
  });

  it("normalizes Korean search text without altering document labels", () => {
    const korean = { ...sets[0]!, label: "약관 관리".normalize("NFD") };
    expect(filterDocumentSets([korean], "약관", DEFAULT_DOCUMENT_FILTERS)[0]!.documentSet).toBe(korean);
  });

  it("excludes completed sets as a unit and combines independent exclusions", () => {
    const completed: DocumentSetSummary = { ...sets[0]!, ticketProgress: { doneTickets: 4, totalTickets: 4 } };
    const all = [completed, ...sets.slice(1)];
    expect(filterDocumentSets(all, "", { ...DEFAULT_DOCUMENT_FILTERS, hideCompletedSets: true }).map((item) => item.documentSet.slug)).toEqual(["readme", "solo"]);
    expect(filterDocumentSets(all, "", { hideCompletedSets: true, hidePlainMarkdown: true }).map((item) => item.documentSet.slug)).toEqual(["solo"]);
  });

  it.each([undefined, {}, { totalTickets: 4 }, { totalTickets: 0, doneTickets: 0 }, { totalTickets: 4, doneTickets: 3 }, { totalTickets: 4, doneTickets: 5 }])("keeps incomplete or unknown counts visible: %j", (ticketProgress) => {
    expect(filterDocumentSets([{ ...sets[0]!, ticketProgress }], "", { ...DEFAULT_DOCUMENT_FILTERS, hideCompletedSets: true })).toHaveLength(1);
  });

  it("does not infer completion for a set without any tickets", () => {
    const plan = buildDocumentSets([file("solo_plan.md", "plan", "solo")])[0]!;
    expect(filterDocumentSets([{ ...plan, ticketProgress: { totalTickets: 1, doneTickets: 1 } }], "", { ...DEFAULT_DOCUMENT_FILTERS, hideCompletedSets: true })).toHaveLength(1);
  });

  it("uses whole-set completion over the first-file badge and keeps unknown multi-file sets visible", () => {
    const multiple = buildDocumentSets([file("01_batch_tickets.md", "tickets", "batch"), file("02_batch_tickets.md", "tickets", "batch")])[0]!;
    const completeBadge = { ...multiple, ticketProgress: { doneTickets: 2, totalTickets: 2 } };
    const filters = { ...DEFAULT_DOCUMENT_FILTERS, hideCompletedSets: true };
    expect(filterDocumentSets([completeBadge], "", filters)).toHaveLength(1);
    expect(filterDocumentSets([{ ...completeBadge, allTicketsDone: false }], "", filters)).toHaveLength(1);
    expect(filterDocumentSets([{ ...completeBadge, allTicketsDone: true }], "", filters)).toHaveLength(0);
  });
});

describe("whole-set ticket progress", () => {
  it("includes every ticket file instead of reporting only the first completed one", () => {
    expect(sumDocumentSetTicketProgress([{ doneTickets: 2, totalTickets: 2 }, { doneTickets: 0, totalTickets: 3 }])).toEqual({ doneTickets: 2, totalTickets: 5 });
    expect(sumDocumentSetTicketProgress([{ doneTickets: 2, totalTickets: 2 }, { doneTickets: 3, totalTickets: 3 }])).toEqual({ doneTickets: 5, totalTickets: 5 });
  });

  it("does not claim known progress when any member is missing or inconsistent", () => {
    expect(sumDocumentSetTicketProgress([])).toBeUndefined();
    expect(sumDocumentSetTicketProgress([{ doneTickets: 2, totalTickets: 2 }, undefined])).toBeUndefined();
    expect(sumDocumentSetTicketProgress([{ doneTickets: 2, totalTickets: 2 }, { totalTickets: 3 }])).toBeUndefined();
    expect(sumDocumentSetTicketProgress([{ doneTickets: 4, totalTickets: 3 }])).toBeUndefined();
  });
});
