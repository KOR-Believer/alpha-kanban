import type {
  DocumentSetSummary,
  MarkdownFileSummary,
  MarkdownFileType,
} from "@alpha-kanban/shared";

export type DocumentSetSortMode =
  | "document_order"
  | "recently_updated"
  | "type"
  | "progress"
  | "name"
  | "directory";

export type DocumentSetSortDirection = "asc" | "desc";

export type DocumentSetSortPreference = {
  direction: DocumentSetSortDirection;
  mode: DocumentSetSortMode;
};

export const DOCUMENT_SET_SORT_OPTIONS: Array<{
  label: string;
  mode: DocumentSetSortMode;
  title: string;
}> = [
  {
    label: "Document order",
    mode: "document_order",
    title: "Sort grouped documents by numeric file prefix",
  },
  {
    label: "Recently updated",
    mode: "recently_updated",
    title: "Sort by file modified time",
  },
  {
    label: "Type",
    mode: "type",
    title: "Sort by primary document type",
  },
  {
    label: "Progress",
    mode: "progress",
    title: "Sort ticket sets by completion ratio",
  },
  {
    label: "Name",
    mode: "name",
    title: "Sort by document set name",
  },
  {
    label: "Directory",
    mode: "directory",
    title: "Sort by containing directory",
  },
];

export const DEFAULT_DOCUMENT_SET_SORT_PREFERENCE: DocumentSetSortPreference = {
  direction: "asc",
  mode: "document_order",
};

const TEXT_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function defaultDirectionForDocumentSetSortMode(
  mode: DocumentSetSortMode,
): DocumentSetSortDirection {
  return mode === "recently_updated" ? "desc" : "asc";
}

export function isDocumentSetSortMode(value: unknown): value is DocumentSetSortMode {
  return DOCUMENT_SET_SORT_OPTIONS.some((option) => option.mode === value);
}

export function isDocumentSetSortDirection(
  value: unknown,
): value is DocumentSetSortDirection {
  return value === "asc" || value === "desc";
}

export function sortDocumentSets(
  documentSets: DocumentSetSummary[],
  preference: DocumentSetSortPreference,
): DocumentSetSummary[] {
  return documentSets
    .map((documentSet) => ({
      ...documentSet,
      documents: sortDocumentsWithinSet(documentSet.documents),
    }))
    .sort((left, right) => compareDocumentSets(left, right, preference));
}

export function sortDocumentsWithinSet(
  documents: MarkdownFileSummary[],
): MarkdownFileSummary[] {
  return [...documents].sort(
    (left, right) =>
      internalDocumentTypeOrder(left.type) - internalDocumentTypeOrder(right.type) ||
      compareOptionalNumber(left.sequenceNumber, right.sequenceNumber, "asc") ||
      compareText(left.relativePath, right.relativePath, "asc"),
  );
}

function compareDocumentSets(
  left: DocumentSetSummary,
  right: DocumentSetSummary,
  preference: DocumentSetSortPreference,
): number {
  const primaryComparison = compareDocumentSetsByMode(left, right, preference);
  return primaryComparison || compareDocumentSetFallback(left, right);
}

function compareDocumentSetsByMode(
  left: DocumentSetSummary,
  right: DocumentSetSummary,
  preference: DocumentSetSortPreference,
): number {
  switch (preference.mode) {
    case "document_order":
      return compareOptionalNumber(
        documentOrderSequence(left, preference.direction),
        documentOrderSequence(right, preference.direction),
        preference.direction,
      );
    case "recently_updated":
      return compareOptionalNumber(
        maxModifiedTime(left),
        maxModifiedTime(right),
        preference.direction,
      );
    case "type":
      return compareNumber(
        documentSetTypeOrder(primaryDocumentType(left)),
        documentSetTypeOrder(primaryDocumentType(right)),
        preference.direction,
      );
    case "progress":
      return compareOptionalNumber(
        ticketProgressRatio(left),
        ticketProgressRatio(right),
        preference.direction,
      );
    case "name":
      return compareText(left.label, right.label, preference.direction);
    case "directory":
      return (
        compareText(left.directory, right.directory, preference.direction) ||
        compareText(left.label, right.label, preference.direction)
      );
  }
}

function compareDocumentSetFallback(
  left: DocumentSetSummary,
  right: DocumentSetSummary,
): number {
  return (
    compareOptionalNumber(
      minSequenceNumber(left.documents),
      minSequenceNumber(right.documents),
      "asc",
    ) ||
    compareText(left.directory, right.directory, "asc") ||
    compareText(left.label, right.label, "asc") ||
    compareText(left.id, right.id, "asc")
  );
}

function compareNumber(
  left: number,
  right: number,
  direction: DocumentSetSortDirection,
): number {
  return direction === "asc" ? left - right : right - left;
}

function compareOptionalNumber(
  left: number | undefined,
  right: number | undefined,
  direction: DocumentSetSortDirection,
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return compareNumber(left, right, direction);
}

function compareText(
  left: string,
  right: string,
  direction: DocumentSetSortDirection,
): number {
  const comparison = TEXT_COLLATOR.compare(left, right);
  return direction === "asc" ? comparison : -comparison;
}

function documentOrderSequence(
  documentSet: DocumentSetSummary,
  direction: DocumentSetSortDirection,
): number | undefined {
  return direction === "desc"
    ? maxSequenceNumber(documentSet.documents)
    : minSequenceNumber(documentSet.documents);
}

function maxModifiedTime(documentSet: DocumentSetSummary): number | undefined {
  return maxNumber(documentSet.documents.map((document) => document.mtimeMs));
}

function maxSequenceNumber(documents: MarkdownFileSummary[]): number | undefined {
  return maxNumber(documents.map((document) => document.sequenceNumber));
}

function minSequenceNumber(documents: MarkdownFileSummary[]): number | undefined {
  return minNumber(documents.map((document) => document.sequenceNumber));
}

function maxNumber(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => value !== undefined);
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

function minNumber(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => value !== undefined);
  return numbers.length > 0 ? Math.min(...numbers) : undefined;
}

function primaryDocumentType(documentSet: DocumentSetSummary): MarkdownFileType {
  return documentSet.primaryFile.type ?? documentSet.documents[0]?.type ?? "markdown";
}

function ticketProgressRatio(documentSet: DocumentSetSummary): number | undefined {
  const totalTickets = documentSet.ticketProgress?.totalTickets;
  if (!totalTickets) {
    return undefined;
  }

  return (documentSet.ticketProgress?.doneTickets ?? 0) / totalTickets;
}

function internalDocumentTypeOrder(type: MarkdownFileType): number {
  return {
    plan: 0,
    tickets: 1,
    inventory: 2,
    markdown: 3,
  }[type];
}

function documentSetTypeOrder(type: MarkdownFileType): number {
  return {
    tickets: 0,
    plan: 1,
    inventory: 2,
    markdown: 3,
  }[type];
}
