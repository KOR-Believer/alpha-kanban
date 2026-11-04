import type { MarkdownFileSummary, TicketDocument } from "@alpha-kanban/shared";
import { normalizeTicketQuery } from "./ticketSearch";

export type DocumentSearchEntry = {
  version: 1; id: string; workspaceId: string; path: string; hash: string;
  text: string; folded: string;
  tickets: { id: string; start: number; end: number }[];
};
export type DocumentSearchMatch = {
  ticketIds: string[]; documentMatch: boolean; excerpt: string; line: number;
};

/** Use exactly the existing parser's ranges, including unknown ticket fields. */
export function createDocumentSearchEntry(file: MarkdownFileSummary, text: string, document?: TicketDocument): DocumentSearchEntry {
  const folded = text.toLowerCase();
  const offsets = [0];
  for (let i = 0; i < folded.length; i++) if (folded[i] === "\n") offsets.push(i + 1);
  return {
    version: 1, id: file.id, workspaceId: file.workspaceId, path: file.workspaceRelativePath, hash: file.hash,
    text, folded,
    tickets: (document?.tickets ?? []).map((ticket) => ({ id: ticket.id,
      start: offsets[ticket.range.startLine - 1] ?? 0, end: offsets[ticket.range.endLine] ?? folded.length })),
  };
}

export function matchesSearchEntry(entry: DocumentSearchEntry | undefined, file: MarkdownFileSummary): entry is DocumentSearchEntry {
  return entry?.version === 1 && entry.id === file.id && entry.workspaceId === file.workspaceId &&
    entry.path === file.workspaceRelativePath && entry.hash === file.hash && typeof entry.text === "string" &&
    typeof entry.folded === "string" && Array.isArray(entry.tickets) && entry.tickets.every((ticket) =>
      ticket && typeof ticket.id === "string" && Number.isInteger(ticket.start) && Number.isInteger(ticket.end) && ticket.start >= 0 && ticket.end >= ticket.start && ticket.end <= entry.folded.length);
}

/** Case folding can expand a character (for example İ); source locations remain original offsets. */
export function sourceOffset(text: string, foldedOffset: number, foldedLength: number): number {
  if (foldedOffset < 0 || text.length === foldedLength) return foldedOffset;
  let original = 0, folded = 0;
  for (const character of text) {
    if (folded >= foldedOffset) return original;
    folded += character.toLowerCase().length;
    original += character.length;
  }
  return original;
}

export function searchDocument(entry: DocumentSearchEntry, query: string): DocumentSearchMatch | undefined {
  const needle = normalizeTicketQuery(query);
  if (!needle) return undefined;
  let first = -1, cursor = 0, documentMatch = false;
  const ticketIds: string[] = [];
  const match = (start: number, end: number) => {
    const local = entry.folded.slice(start, end).indexOf(needle);
    if (local < 0) return false;
    const offset = start + local;
    if (first < 0 || offset < first) first = offset;
    return true;
  };
  for (const ticket of entry.tickets) {
    if (match(cursor, ticket.start)) documentMatch = true;
    if (match(ticket.start, ticket.end)) ticketIds.push(ticket.id);
    cursor = ticket.end;
  }
  if (match(cursor, entry.folded.length)) documentMatch = true;
  if (first < 0) return undefined;
  first = sourceOffset(entry.text, first, entry.folded.length);
  const lineStart = entry.text.lastIndexOf("\n", first) + 1;
  const nextLine = entry.text.indexOf("\n", first + needle.length);
  const lineEnd = nextLine < 0 ? entry.text.length : nextLine;
  const start = Math.max(lineStart, first - 40), end = Math.min(lineEnd, first + needle.length + 100);
  return { ticketIds, documentMatch, line: entry.text.slice(0, first).split("\n").length,
    excerpt: `${start > lineStart ? "…" : ""}${entry.text.slice(start, end).replace(/\s+/g, " ")}${end < lineEnd ? "…" : ""}` };
}

export const searchYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
