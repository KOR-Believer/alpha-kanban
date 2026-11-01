import type { PathMove, RootMapping } from "./documentPaths.mjs";
export * from "./documentPaths.mjs";

export interface ReferenceDocument { path: string; markdown: string; writable?: boolean; previousPath?: string; }
export interface SectionRemoval { path: string; start: number; end: number; }
export interface ReferenceInput {
  root: string;
  previousRoot?: string;
  documents: ReferenceDocument[];
  moves?: PathMove[];
  mappings?: RootMapping[];
  output?: "relative" | "file-url";
  available?: string[];
  verifyPaths?: string[];
  sectionRemovals?: SectionRemoval[];
}
export interface ReferenceIssue {
  severity: "review" | "blocked";
  code: string;
  message: string;
  path?: string;
  offset?: number;
  candidates?: string[];
}
export interface SourceReference {
  start: number; end: number; raw: string; url: string;
  base: "document" | "document-field" | "root";
  kind: "link" | "image" | "definition" | "ledger-field";
  angle: boolean;
}
export interface ReferenceEdit { start: number; end: number; before: string; after: string; }
export interface ReferenceInspection {
  references: SourceReference[];
  headings: { start: number; end: number; depth: number; text: string; supported: boolean }[];
  issues: ReferenceIssue[];
}
export interface ReferenceAnalysis {
  decision: "ready" | "review" | "blocked";
  issues: ReferenceIssue[];
  changes: { path: string; afterPath: string | null; before: string; after: string; edits: ReferenceEdit[] }[];
  references: { path: string; offset: number; beforeTarget: string; afterTarget: string; before: string; after: string }[];
}
export function inspectReferences(source: string): ReferenceInspection;
export function applyReferenceEdits(source: string, edits: ReferenceEdit[]): string;
export function referenceTargets(input: ReferenceInput): string[];
export function analyzeReferences(input: ReferenceInput): ReferenceAnalysis;
