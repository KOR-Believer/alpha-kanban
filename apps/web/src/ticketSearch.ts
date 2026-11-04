import type { TicketDocument, TicketItem } from "@alpha-kanban/shared";

const indexes = new WeakMap<TicketItem, { text: string; folded: string; body: string }>();
export const normalizeTicketQuery = (query: string) => query.trim().toLowerCase();

/** Preserve the parser's ticket boundaries, including fields it does not render. */
export function attachTicketSearch(document: TicketDocument, markdown: string): TicketDocument {
  const lines = markdown.split(/\r?\n/);
  for (const ticket of document.tickets) {
    ticket.searchText = lines.slice(ticket.range.startLine - 1, ticket.range.endLine).join("\n");
  }
  return document;
}

function index(ticket: TicketItem) {
  let result = indexes.get(ticket);
  if (!result) {
    const body = ticket.searchText !== undefined ? ticket.searchText.slice(ticket.searchText.indexOf("\n") + 1) : [
      ticket.status, ticket.priority, ticket.type, ...ticket.repository, ...ticket.dependsOn,
      ...ticket.goal, ...ticket.currentProblem, ...ticket.implementationScope, ...ticket.outOfScope,
      ...ticket.completionCriteria, ...ticket.validation,
      ...ticket.userInstructions.map((entry) => entry.raw), ...ticket.progressNotes.map((entry) => entry.raw),
      ...ticket.unknownBlocks,
    ].join("\n");
    const text = `${ticket.id} ${ticket.title}\n${body}`;
    result = { text, folded: text.toLowerCase(), body };
    indexes.set(ticket, result);
  }
  return result;
}

/** Query is normalized once by the caller, not once per card. */
export function matchesTicketSearch(ticket: TicketItem, query: string) {
  return !query || index(ticket).folded.includes(query);
}

export function ticketSearchExcerpt(ticket: TicketItem, query: string) {
  const needle = normalizeTicketQuery(query);
  if (!needle) return undefined;
  const body = index(ticket).body;
  const offset = body.toLowerCase().indexOf(needle);
  if (offset < 0) return undefined;
  const lineStart = body.lastIndexOf("\n", offset) + 1;
  const nextLine = body.indexOf("\n", offset + needle.length);
  const lineEnd = nextLine < 0 ? body.length : nextLine;
  const start = Math.max(lineStart, offset - 48), end = Math.min(lineEnd, offset + needle.length + 100);
  return `${start > lineStart ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ")}${end < lineEnd ? "…" : ""}`;
}
