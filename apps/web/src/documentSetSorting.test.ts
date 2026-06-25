import { describe, expect, it } from "vitest";

import type {
  DocumentSetSummary,
  MarkdownFileSummary,
  MarkdownFileType,
} from "@alpha-kanban/shared";

import { sortDocumentSets } from "./documentSetSorting";

describe("sortDocumentSets", () => {
  it("keeps slug groups together and uses min sequence for ascending document order", () => {
    const sets = [
      makeSet("b", [
        makeFile("03_B_plan.md", "plan", 3),
        makeFile("04_B_tickets.md", "tickets", 4),
      ]),
      makeSet("a", [
        makeFile("02_A_tickets.md", "tickets", 2),
        makeFile("05_A_inventory.md", "inventory", 5),
        makeFile("01_A_plan.md", "plan", 1),
      ]),
    ];

    const sorted = sortDocumentSets(sets, {
      direction: "asc",
      mode: "document_order",
    });

    expect(sorted.map((set) => set.slug)).toEqual(["a", "b"]);
    expect(sorted[0]?.documents.map((document) => document.type)).toEqual([
      "plan",
      "tickets",
      "inventory",
    ]);
  });

  it("uses max sequence for descending document order without reversing documents inside a set", () => {
    const sorted = sortDocumentSets(
      [
        makeSet("b", [
          makeFile("03_B_plan.md", "plan", 3),
          makeFile("04_B_tickets.md", "tickets", 4),
        ]),
        makeSet("a", [
          makeFile("01_A_plan.md", "plan", 1),
          makeFile("02_A_tickets.md", "tickets", 2),
          makeFile("05_A_inventory.md", "inventory", 5),
        ]),
      ],
      {
        direction: "desc",
        mode: "document_order",
      },
    );

    expect(sorted.map((set) => set.slug)).toEqual(["a", "b"]);
    expect(sorted[0]?.documents.map((document) => document.filename)).toEqual([
      "01_A_plan.md",
      "02_A_tickets.md",
      "05_A_inventory.md",
    ]);
  });

  it("sorts recently updated by the newest file mtime inside each set", () => {
    const sorted = sortDocumentSets(
      [
        makeSet("old", [
          makeFile("01_old_plan.md", "plan", 1, 100),
          makeFile("02_old_tickets.md", "tickets", 2, 200),
        ]),
        makeSet("new", [
          makeFile("03_new_plan.md", "plan", 3, 150),
          makeFile("04_new_tickets.md", "tickets", 4, 300),
        ]),
      ],
      {
        direction: "desc",
        mode: "recently_updated",
      },
    );

    expect(sorted.map((set) => set.slug)).toEqual(["new", "old"]);
  });

  it("keeps sets with missing sort values stable behind comparable sets", () => {
    const sorted = sortDocumentSets(
      [
        makeSet("missing", [makeFile("missing.md", "markdown", undefined)]),
        makeSet("numbered", [makeFile("01_numbered_plan.md", "plan", 1)]),
      ],
      {
        direction: "asc",
        mode: "document_order",
      },
    );

    expect(sorted.map((set) => set.slug)).toEqual(["numbered", "missing"]);
  });
});

function makeSet(slug: string, documents: MarkdownFileSummary[]): DocumentSetSummary {
  const sortedDocuments = [...documents];
  const primaryFile =
    sortedDocuments.find((document) => document.type === "tickets") ??
    sortedDocuments.find((document) => document.type === "plan") ??
    sortedDocuments[0];

  if (!primaryFile) {
    throw new Error("test document set requires at least one file");
  }

  const sequenceNumbers = sortedDocuments
    .map((document) => document.sequenceNumber)
    .filter((value): value is number => value !== undefined);

  return {
    directory: "docs",
    documents: sortedDocuments,
    id: `set-${slug}`,
    label: slug,
    primaryFile,
    sequenceNumber:
      sequenceNumbers.length > 0 ? Math.min(...sequenceNumbers) : undefined,
    slug,
    types: [...new Set(sortedDocuments.map((document) => document.type))],
    workspaceId: "workspace",
  };
}

function makeFile(
  filename: string,
  type: MarkdownFileType,
  sequenceNumber?: number,
  mtimeMs = sequenceNumber ?? 0,
): MarkdownFileSummary {
  return {
    absolutePath: `/workspace/docs/${filename}`,
    directory: "docs",
    filename,
    hash: `hash-${filename}`,
    id: `file-${filename}`,
    mtimeMs,
    relativePath: `docs/${filename}`,
    sequenceNumber,
    slug: filename.replace(/^\d+_/, "").replace(/_(plan|tickets|inventory)\.md$/, ""),
    type,
    workspaceId: "workspace",
    workspaceRelativePath: `docs/${filename}`,
  };
}
