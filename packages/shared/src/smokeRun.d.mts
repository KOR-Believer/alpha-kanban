export type NewSmokeRunFields = { title: string; target: string; environment: string; caseIds: string[] };
export type NewSmokeRunOptions = NewSmokeRunFields & { documentId: string; owner: string | null; sourcePath: string; number: number; createdAt: string };
export function createSmokeRun(source: string, options: NewSmokeRunOptions): string;
export type SmokeChange = { kind: "memo"; memo: string }
  | { kind: "case"; caseId: string; result: import("./smokeMarkdown.mjs").SmokeResult; memo: string; evidence: string; reason?: string; actor?: string }
  | { kind: "close"; reason: string };
export function updateSmokeDocument(source: string, kind: import("./smokeMarkdown.mjs").SmokeKind, change: SmokeChange, at: string): string;
