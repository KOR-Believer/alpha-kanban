import { describe, expect, it } from "vitest";
import { parseTicketDocument } from "@alpha-kanban/shared/ticketMarkdown";
import { ledger } from "./browser/browserFixtures";
import { attachTicketSearch, matchesTicketSearch, normalizeTicketQuery, ticketSearchExcerpt } from "./ticketSearch";
import { boardTickets, filterBoardTickets } from "./allProjectsData";
import { documentFixture, projectFixture } from "./allProjectsFixtures";

describe("ticket source search", () => {
  it("includes unknown Markdown and log continuations only inside the matching ticket", () => {
    const source = ledger.replace("### TEST-02", "임의 설명:\n\n| 키 | 값 |\n| -- | -- |\n| 독특한 | Cobalt needle |\n\n### TEST-02")
      .replace("old direction", "old direction\n  여러 줄 지시의 연속") + "\n문서 밖 전용 문장\n";
    const doc = attachTicketSearch(parseTicketDocument(source), source);
    expect(doc.tickets.filter((t) => matchesTicketSearch(t, normalizeTicketQuery(" COBALT needle "))).map((t) => t.id)).toEqual(["TEST-01"]);
    expect(matchesTicketSearch(doc.tickets[0]!, "여러 줄 지시의 연속")).toBe(true);
    expect(doc.tickets.some((t) => matchesTicketSearch(t, "문서 밖 전용 문장"))).toBe(false);
    expect(matchesTicketSearch(doc.tickets[0]!, "test-02")).toBe(false);
    expect(ticketSearchExcerpt(doc.tickets[0]!, "cobalt needle")).toContain("Cobalt needle");
    expect(parseTicketDocument(source).tickets[0]?.searchText).toBeUndefined();
  });
  it("keeps project, owner and done filters intersected with body matches", () => {
    const workspace = projectFixture("/work/example", "w_test");
    const response = documentFixture(workspace);
    response.file.pathOwner = { status: "owned", value: "@alice" };
    response.document.tickets[0]!.searchText = "### TEST-01. Heading\nOnly in body";
    const tickets = boardTickets({ documents: [{ workspace, response }], issues: [] });
    const filters = { projectIds: [], hideDone: false, search: "ONLY IN BODY" };
    expect(filterBoardTickets(tickets, filters)).toHaveLength(1);
    expect(filterBoardTickets(tickets, { ...filters, hideDone: true })).toHaveLength(0);
    expect(filterBoardTickets(tickets, { ...filters, projectIds: ["different"] })).toHaveLength(0);
    expect(filterBoardTickets(tickets, filters, ["@bob"])).toHaveLength(0);
  });
  it("uses a new index after a ticket changes, including an identical-length edit", () => {
    const original = parseTicketDocument(ledger).tickets[0]!;
    expect(matchesTicketSearch(original, "goal")).toBe(true);
    const changed = { ...original, goal: ["next"] };
    expect(matchesTicketSearch(changed, "goal")).toBe(false);
    expect(matchesTicketSearch(changed, "next")).toBe(true);
  });
});
