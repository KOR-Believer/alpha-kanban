import type { DocumentSetSummary, MarkdownFileSummary, MarkdownFileType } from "@alpha-kanban/shared";
import { matchesOwnerFilter, type OwnerFilter } from "./ownerFilters";

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

export type DocumentColumnFilters = {
  name: string;
  directory: string;
  completion: "all" | "complete" | "without-tickets";
  types: MarkdownFileType[];
};

export const DEFAULT_COLUMN_FILTERS: DocumentColumnFilters = { name: "", directory: "", completion: "all", types: [] };

export function documentSetIsComplete(set: DocumentSetSummary): boolean {
  const progress = set.ticketProgress;
  return set.allTicketsDone ?? (set.documents.filter((file) => file.type === "tickets").length === 1 &&
    progress?.totalTickets !== undefined && progress.totalTickets > 0 && progress.doneTickets === progress.totalTickets);
}

export function filterDocumentSets(
  sets: DocumentSetSummary[],
  query: string,
  filters: DocumentFilters,
  owner: OwnerFilter = "all",
  columns: DocumentColumnFilters = DEFAULT_COLUMN_FILTERS,
): VisibleDocumentSet[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return sets.flatMap((documentSet) => {
    const completed = documentSetIsComplete(documentSet);
    if (filters.hideCompletedSets && completed) return [];
    // The existing global "hide completed" preference is the active completion
    // choice when returning to a project with its own saved column filters.
    if (!filters.hideCompletedSets && columns.completion === "complete" && !completed) return [];
    if (!filters.hideCompletedSets && columns.completion === "without-tickets" && documentSet.documents.some((file) => file.type === "tickets")) return [];
    if (!normalize(documentSet.label).includes(normalize(columns.name).trim()) || !normalize(documentSet.directory).includes(normalize(columns.directory).trim())) return [];
    const documents = documentSet.documents.filter((file) => matchesOwnerFilter(file, owner) && (!filters.hidePlainMarkdown || file.type !== "markdown") && (!columns.types.length || columns.types.includes(file.type)));
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
