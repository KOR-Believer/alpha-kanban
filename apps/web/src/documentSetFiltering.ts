import type { DocumentSetSummary, MarkdownFileSummary } from "@alpha-kanban/shared";

export type VisibleDocumentSet = {
  documentSet: DocumentSetSummary;
  documents: MarkdownFileSummary[];
};

export type DocumentFilters = {
  hidePlainMarkdown: boolean;
  hideCompletedSets: boolean;
};

export const DEFAULT_DOCUMENT_FILTERS: DocumentFilters = {
  hidePlainMarkdown: false,
  hideCompletedSets: false,
};

export function filterDocumentSets(
  sets: DocumentSetSummary[],
  query: string,
  filters: DocumentFilters,
): VisibleDocumentSet[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return sets.flatMap((documentSet) => {
    const progress = documentSet.ticketProgress;
    const completed = documentSet.allTicketsDone ?? (documentSet.documents.filter((file) => file.type === "tickets").length === 1 &&
      progress?.totalTickets !== undefined && progress.totalTickets > 0 &&
      progress.doneTickets === progress.totalTickets);
    if (filters.hideCompletedSets && completed) return [];
    const documents = documentSet.documents.filter((file) => !filters.hidePlainMarkdown || file.type !== "markdown");
    if (!documents.length) return [];
    const names = normalize([
      documentSet.label,
      documentSet.directory,
      documentSet.slug,
      ...documents.flatMap((file) => [file.filename, file.relativePath, file.workspaceRelativePath]),
    ].join("\n"));
    return terms.every((term) => names.includes(term)) ? [{ documentSet, documents }] : [];
  });
}

function normalize(value: string): string {
  return value.normalize("NFC").toLowerCase();
}
