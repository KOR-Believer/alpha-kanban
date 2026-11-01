import type { ReferenceDocument, ReferenceIssue, SectionRemoval, ReferenceAnalysis } from "./documentReferences.mjs";
export interface MigrationTarget { path: string; assignId?: boolean; cleanupLegacy?: boolean; allowPlainMarkdown?: boolean; }
export interface MigrationInput { root: string; documents: ReferenceDocument[]; targets: MigrationTarget[]; available?: string[]; generatedIds?: Record<string, string>; }
export interface MigrationRetained { path: string; rule: string; code: string; message: string; }
export interface MigrationPreview {
  schema: 1; decision: "ready" | "noop" | "blocked"; generatedIds: Record<string, string>;
  rules: (SectionRemoval & { rule: string; tableOnly?: boolean })[]; retained: MigrationRetained[]; issues: ReferenceIssue[];
  changes: { path: string; afterPath: string | null; before: string; after: string }[];
  references: ReferenceAnalysis["references"];
}
export const DOCUMENT_MIGRATIONS: readonly { id: string; sourceFormats: string[]; targetFormat: string; section: string }[];
export function inspectLegacySections(markdown: string, path: string): { removals: MigrationPreview["rules"]; tableEdits: MigrationPreview["rules"]; retained: MigrationRetained[] };
export function previewDocumentMigrations(input: MigrationInput): MigrationPreview;
