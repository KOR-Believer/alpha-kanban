import type { ReferenceDocument, ReferenceIssue, SectionRemoval, ReferenceAnalysis } from "./documentReferences.mjs";
export interface MigrationTarget { path: string; assignId?: boolean; cleanupLegacy?: boolean; reconcileOwner?: boolean; allowPlainMarkdown?: boolean; }
export interface MigrationInput { root: string; documentRoot?: string | null; documents: ReferenceDocument[]; targets: MigrationTarget[]; available?: string[]; generatedIds?: Record<string, string>; relativeReferencesOnly?: boolean; }
export interface MigrationRetained { path: string; rule: string; section: string; code: string; message: string; }
export interface MigrationPreview {
  schema: 1; decision: "ready" | "noop" | "blocked"; generatedIds: Record<string, string>;
  rules: (SectionRemoval & { rule: string; tableOnly?: boolean; contentOnly?: boolean })[]; retained: MigrationRetained[]; issues: ReferenceIssue[];
  changes: { path: string; afterPath: string | null; before: string; after: string }[];
  references: ReferenceAnalysis["references"];
}
export const DOCUMENT_MIGRATIONS: readonly { id: string; sourceFormats: string[]; targetFormat: string; section: string }[];
export function inspectLegacySections(markdown: string, path: string): { removals: MigrationPreview["rules"]; contentEdits: MigrationPreview["rules"]; retained: MigrationRetained[]; sections: (SectionRemoval & { rule: string; section: string; edits: MigrationPreview["rules"] })[] };
export function previewDocumentMigrations(input: MigrationInput): MigrationPreview;
export function hasCompleteMigrationHeader(markdown: string): boolean;
export interface MigrationPreparation { preview: MigrationPreview; readIds: boolean; readReferences: boolean; }
export function prepareDocumentMigration(input: MigrationInput): MigrationPreparation;
