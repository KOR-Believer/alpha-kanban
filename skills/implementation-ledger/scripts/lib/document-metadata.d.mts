import type { LedgerCompatibility } from "./ledger-format.mjs";
export type MetadataField = { status: "missing" | "valid" | "invalid"; value: string | null; raw: string | null; code: string | null };
export type DocumentMetadata = { format: LedgerCompatibility; documentId: MetadataField; owner: MetadataField };
export type MetadataAnalysis = DocumentMetadata & {
  pathOwner: { status: "owned" | "unassigned" | "invalid"; value: string | null };
  ownerState: "invalid" | "unassigned" | "recorded-only" | "legacy-adoption" | "aligned" | "reconcile";
};
export type MetadataPreview = {
  schema: 1; path: string; before: string; after: string; documentId: string | null;
  operations: { assignId: boolean; clone: boolean; reconcileOwner: boolean };
  edits: Array<{ start: number; end: number; before: string; after: string }>;
};
export function normalizeDocumentId(value: unknown): string | null;
export function readDocumentMetadata(markdown: string): DocumentMetadata;
export function analyzeDocumentMetadata(markdown: string, path: string, options?: { documentRoot?: string | null }): MetadataAnalysis;
export function previewDocumentMetadata(input: {
  markdown: string; path: string; assignId?: boolean; clone?: boolean; reconcileOwner?: boolean;
  allowPlainMarkdown?: boolean; generateId?: () => string; documentRoot?: string | null;
}): MetadataPreview;
export function resumeMetadataPreview(preview: MetadataPreview, current: string, currentPath: string): string;
export function indexDocumentIds(entries: Array<{ projectId: string; localId: string; path: string; documentId?: string | null }>): Array<{
  projectId: string; documentId: string; status: "unique" | "duplicate"; documents: Array<{ localId: string; path: string }>;
}>;
export class MetadataPreviewError extends Error { readonly code: string; constructor(code: string, message: string); }
