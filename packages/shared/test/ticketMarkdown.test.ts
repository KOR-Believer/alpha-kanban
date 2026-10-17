import { describe, expect, it } from "vitest";

import {
  appendProgressNote,
  appendUserInstruction,
  parseTicketDocument,
  TICKET_WRITE_ERROR,
  TicketMarkdownWriteError,
  updateTicketStatusAndProgress,
} from "../src/ticketMarkdown";

function ticket(id: string, status = "READY", progress = 25): string {
  return `### ${id}. Title for ${id}

Status: ${status}
Progress: ${progress}%
Repository:
- example
Priority: P1
Type: Feature
Depends on:
- OVF-08
목표:
- Goal for ${id}
현재 문제:
- Problem for ${id}
구현 범위:
- Scope for ${id}
제외 범위:
- Exclusion for ${id}
완료 기준:
- [x] Evidence for ${id}
검증:
- [ ] Check for ${id}
사용자 지시:
- 2026-10-18: Direction for ${id}
진행 메모:
- 2026-10-18: Note for ${id}

`;
}

function document(...bodies: string[]): string {
  return `# Example tickets

## Status

- 현재 진행률: \`1 / 3 tickets\`

## Ticket List

${bodies.join("")}`;
}

function ticketBody(markdown: string, id: string): string {
  const item = parseTicketDocument(markdown).tickets.find((item) => item.id === id)!;
  return markdown.split("\n").slice(item.range.startLine - 1, item.range.endLine).join("\n");
}

const source = document(ticket("OVF-09"), ticket("OVF-09A", "IN_PROGRESS", 75), ticket("OVF-10", "DONE", 100));

describe("ticket IDs and section boundaries", () => {
  it.each(["OVF-09A", "OVF-09a", "OVF-09AB"])("reads %s as a separate ticket without mixing adjacent fields", (id) => {
    const parsed = parseTicketDocument(document(ticket("OVF-09"), ticket(id, "IN_PROGRESS", 75), ticket("OVF-10", "DONE", 100)));

    expect(parsed.tickets.map((item) => item.id)).toEqual(["OVF-09", id, "OVF-10"]);
    expect(parsed.tickets.map((item) => item.status)).toEqual(["READY", "IN_PROGRESS", "DONE"]);
    expect(parsed.tickets.map((item) => item.progress)).toEqual([25, 75, 100]);
    expect(parsed.tickets.filter((item) => item.status === "DONE")).toHaveLength(parsed.status.doneTickets!);
    expect(parsed.tickets).toHaveLength(parsed.status.totalTickets!);
    for (const item of parsed.tickets) {
      expect(item.goal).toEqual([`Goal for ${item.id}`]);
      expect(item.currentProblem).toEqual([`Problem for ${item.id}`]);
      expect(item.implementationScope).toEqual([`Scope for ${item.id}`]);
      expect(item.outOfScope).toEqual([`Exclusion for ${item.id}`]);
      expect(item.completionCriteriaItems.map((entry) => entry.text)).toEqual([`Evidence for ${item.id}`]);
      expect(item.validationItems.map((entry) => entry.text)).toEqual([`Check for ${item.id}`]);
      expect(item.userInstructions.map((entry) => entry.text)).toEqual([`Direction for ${item.id}`]);
      expect(item.progressNotes.map((entry) => entry.text)).toEqual([`Note for ${item.id}`]);
      expect(item.missingFields).toEqual([]);
    }
  });

  it.each(["OVF-09", "OVF-09A"])("updates only %s and recomputes the complete ticket count", (id) => {
    const updated = updateTicketStatusAndProgress(source, id, { status: "DONE", progress: 100, reason: "Verified" });
    const parsed = parseTicketDocument(updated);
    const changed = parsed.tickets.find((item) => item.id === id)!;

    expect(parsed.status).toMatchObject({ doneTickets: 2, totalTickets: 3 });
    expect(changed).toMatchObject({ status: "DONE", progress: 100 });
    expect(changed.completedAt).toBeDefined();
    expect(changed.userInstructions.at(-1)?.text).toContain("Verified");
    expect(changed.goal).toEqual([`Goal for ${id}`]);
    for (const other of parsed.tickets.filter((item) => item.id !== id)) {
      expect(ticketBody(updated, other.id)).toBe(ticketBody(source, other.id));
    }
  });

  it.each(["OVF-09", "OVF-09A"])("appends directions and notes only to %s", (id) => {
    const directed = appendUserInstruction(source, id, "New direction", { date: "2026-10-18", kind: "manual" });
    const updated = appendProgressNote(directed, id, "New note", { date: "2026-10-18" });
    const parsed = parseTicketDocument(updated);
    const changed = parsed.tickets.find((item) => item.id === id)!;

    expect(changed.userInstructions.map((entry) => entry.text)).toEqual([`Direction for ${id}`, "[수동지시] New direction"]);
    expect(changed.progressNotes.map((entry) => entry.text)).toEqual([`Note for ${id}`, "New note"]);
    for (const other of parsed.tickets.filter((item) => item.id !== id)) {
      expect(ticketBody(updated, other.id)).toBe(ticketBody(source, other.id));
    }
  });

  it.each(["### OVF-09-A. Unsupported ID", "### OVF-09A Missing period", "   ### OVF-X. Indented unsupported ID"])("isolates an unrecognized heading: %s", (heading) => {
    const unknown = ticket("OVF-09A", "DONE", 100).replace("### OVF-09A. Title for OVF-09A", heading);
    const markdown = document(ticket("OVF-09"), unknown, ticket("OVF-10", "DONE", 100));
    const parsed = parseTicketDocument(markdown);

    expect(parsed.tickets.map((item) => item.id)).toEqual(["OVF-09", "OVF-10"]);
    expect(parsed.tickets[0]).toMatchObject({ status: "READY", progress: 25, goal: ["Goal for OVF-09"] });
    expect(parsed.tickets[0]?.progressNotes.map((entry) => entry.text)).toEqual(["Note for OVF-09"]);
    expect(ticketBody(markdown, "OVF-09").trimEnd()).toBe(ticket("OVF-09").trimEnd());
    for (const mutate of [
      () => updateTicketStatusAndProgress(markdown, "OVF-09", { status: "DONE", progress: 100 }),
      () => updateTicketStatusAndProgress(markdown, "OVF-10", { status: "READY", progress: 25 }),
      () => appendUserInstruction(markdown, "OVF-09", "New direction"),
      () => appendProgressNote(markdown, "OVF-09", "New note"),
    ]) {
      expect(mutate).toThrow(TicketMarkdownWriteError);
      expect(mutate).toThrow(expect.objectContaining({ code: TICKET_WRITE_ERROR.NEEDS_REPAIR }));
    }
  });

  it("does not consume a trailing unsupported ticket or overwrite its count", () => {
    const markdown = document(ticket("OVF-09"), ticket("OVF-unknown", "DONE", 100));
    const parsed = parseTicketDocument(markdown);

    expect(parsed.tickets).toHaveLength(1);
    expect(parsed.tickets[0]?.goal).toEqual(["Goal for OVF-09"]);
    expect(ticketBody(markdown, "OVF-09").trimEnd()).toBe(ticket("OVF-09").trimEnd());
    expect(() => updateTicketStatusAndProgress(markdown, "OVF-09", { status: "DONE" })).toThrow(TicketMarkdownWriteError);
  });

  it("keeps ordinary peer sections separate and unchanged during appends", () => {
    const notes = "### Additional context\n\n- 2026-10-18: Not a ticket note\n\n";
    const markdown = document(ticket("OVF-09"), notes, ticket("OVF-09A"));
    const updated = appendProgressNote(markdown, "OVF-09", "New note", { date: "2026-10-18" });

    expect(parseTicketDocument(updated).tickets[0]?.progressNotes.map((entry) => entry.text)).toEqual(["Note for OVF-09", "New note"]);
    expect(updated.slice(updated.indexOf(notes))).toBe(markdown.slice(markdown.indexOf(notes)));
    expect(ticketBody(updated, "OVF-09")).not.toContain("Additional context");
  });

  it.each(["```", "~~~"])("ignores %s-fenced ticket examples as boundaries", (fence) => {
    const example = `${fence}md\n### OVF-09A. Example\nStatus: DONE\nProgress: 100%\n### OVF-unknown. Example\nStatus: DONE\n${fence}\n`;
    const first = ticket("OVF-09").replace("목표:\n", `${example}\n목표:\n`);
    const markdown = document(first, ticket("OVF-09A", "IN_PROGRESS", 75), ticket("OVF-10", "DONE", 100));
    const updated = updateTicketStatusAndProgress(markdown, "OVF-09", { status: "DONE", progress: 100 });

    expect(parseTicketDocument(markdown).tickets.map((item) => item.id)).toEqual(["OVF-09", "OVF-09A", "OVF-10"]);
    expect(parseTicketDocument(markdown).tickets[0]?.status).toBe("READY");
    expect(updated).toContain(example);
    expect(parseTicketDocument(updated).status).toMatchObject({ doneTickets: 2, totalTickets: 3 });
    expect(ticketBody(updated, "OVF-09A")).toBe(ticketBody(markdown, "OVF-09A"));
  });

  it("retains duplicate-ID write protection for suffixed IDs", () => {
    const markdown = document(ticket("OVF-09A"), ticket("OVF-09A"));
    expect(() => appendUserInstruction(markdown, "OVF-09A", "New direction")).toThrow(expect.objectContaining({ code: TICKET_WRITE_ERROR.NEEDS_REPAIR }));
  });
});
