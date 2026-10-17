import type { DocumentSetSummary, DocumentSetTicketProgress, MarkdownFileSummary, MarkdownFileType, MarkdownHeading } from "./index.js";

export function sumDocumentSetTicketProgress(
  values: Array<DocumentSetTicketProgress | undefined>,
): DocumentSetTicketProgress | undefined {
  if (!values.length) return undefined;
  let doneTickets = 0;
  let totalTickets = 0;
  for (const value of values) {
    if (value?.doneTickets === undefined || value.totalTickets === undefined || value.doneTickets > value.totalTickets) return undefined;
    doneTickets += value.doneTickets;
    totalTickets += value.totalTickets;
  }
  return { doneTickets, totalTickets };
}

export function buildDocumentSets(files: MarkdownFileSummary[]): DocumentSetSummary[] {
  const groups = new Map<string, MarkdownFileSummary[]>();

  for (const file of files) {
    const key = `${file.workspaceId}::${file.directory}::${file.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  return [...groups.values()]
    .map((documents) => {
      const sortedDocuments = [...documents].sort(compareDocumentFiles);
      const primaryFile = choosePrimaryFile(sortedDocuments);
      const sequenceNumber = minSequenceNumber(sortedDocuments);
      const types = uniqueTypes(sortedDocuments);

      return {
        id: encodeDocumentSetId({
          directory: primaryFile.directory,
          slug: primaryFile.slug,
          workspaceId: primaryFile.workspaceId,
        }),
        workspaceId: primaryFile.workspaceId,
        directory: primaryFile.directory,
        slug: primaryFile.slug,
        label: formatDocumentSetLabel(primaryFile.slug),
        sequenceNumber,
        documents: sortedDocuments,
        types,
        primaryFile,
      };
    })
    .sort(compareDocumentSets);
}

export function inferMarkdownFileType(filePath: string): MarkdownFileType {
  const basename = filePath.split(/[\\/]/).at(-1) ?? filePath;

  if (basename.endsWith("_tickets.md")) {
    return "tickets";
  }
  if (basename.endsWith("_plan.md")) {
    return "plan";
  }
  if (basename.endsWith("_inventory.md")) {
    return "inventory";
  }
  return "markdown";
}

export function inferSlug(filePath: string): string {
  return (filePath.split(/[\\/]/).at(-1) ?? filePath).replace(/\.md$/, "")
    .replace(/^\d+_/, "")
    .replace(/_(tickets|plan|inventory)$/, "");
}

export function inferSequenceNumber(filePath: string): number | undefined {
  const match = /^(\d+)_/.exec(filePath.split(/[\\/]/).at(-1) ?? filePath);
  if (!match?.[1]) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMarkdownOutline(markdown: string): MarkdownHeading[] {
  let fence = "";
  return markdown.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      return [];
    }
    if (marker) { fence = marker; return []; }
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match?.[1] || !match[2]?.trim()) {
      return [];
    }

    return [
      {
        level: match[1].length,
        title: match[2].trim(),
        line: index + 1,
      },
    ];
  });
}

function compareDocumentFiles(
  left: MarkdownFileSummary,
  right: MarkdownFileSummary,
): number {
  return (
    documentTypeSortOrder(left.type) - documentTypeSortOrder(right.type) ||
    (left.sequenceNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.sequenceNumber ?? Number.MAX_SAFE_INTEGER) ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

function compareDocumentSets(
  left: DocumentSetSummary,
  right: DocumentSetSummary,
): number {
  return (
    (left.sequenceNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.sequenceNumber ?? Number.MAX_SAFE_INTEGER) ||
    left.directory.localeCompare(right.directory) ||
    left.label.localeCompare(right.label)
  );
}

function choosePrimaryFile(files: MarkdownFileSummary[]): MarkdownFileSummary {
  return (
    files.find((file) => file.type === "tickets") ??
    files.find((file) => file.type === "plan") ??
    files.find((file) => file.type === "inventory") ??
    files[0] ??
    unreachablePrimaryFile()
  );
}

function unreachablePrimaryFile(): never {
  throw new Error("Document set requires at least one file.");
}

function uniqueTypes(files: MarkdownFileSummary[]): MarkdownFileType[] {
  return [...new Set(files.map((file) => file.type))].sort(
    (left, right) => documentTypeSortOrder(left) - documentTypeSortOrder(right),
  );
}

function minSequenceNumber(files: MarkdownFileSummary[]): number | undefined {
  const values = files
    .map((file) => file.sequenceNumber)
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function documentTypeSortOrder(type: MarkdownFileType): number {
  return {
    plan: 0,
    tickets: 1,
    inventory: 2,
    markdown: 3,
  }[type];
}

function encodeDocumentSetId(input: {
  directory: string;
  slug: string;
  workspaceId: string;
}): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(input))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formatDocumentSetLabel(slug: string): string {
  return slug.replace(/[_-]+/g, " ");
}
