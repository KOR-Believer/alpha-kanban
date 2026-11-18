export type SmokeKind = "smoke" | "smoke-run";
export type SmokeResult = "NOT_RUN" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
export const SMOKE_RESULTS: readonly SmokeResult[];
export type SmokeRange = { start: number; end: number; startLine: number; endLine: number };
export type SmokeField = { name: string; value: string; raw: string; range: SmokeRange };
export type SmokeSection = { name: string; content: string; range: SmokeRange; headingRange: SmokeRange };
export type SmokeDiagnostic = { code: string; message: string; scope: string; range: SmokeRange; severity: "error" | "warning" };
export type SmokeLog = {
  id: string; kind: "EXECUTION" | "USER_EDIT" | "NOTE" | null; at: string | null; actor: string | null;
  method: "HUMAN" | "COMPUTER_USE" | "BROWSER_USE" | null; from: SmokeResult | null; to: SmokeResult | null;
  memo: SmokeSection | null; evidence: SmokeSection | null; reason: SmokeSection | null;
  fields: SmokeField[]; sections: SmokeSection[]; range: SmokeRange;
};
export type SmokeCase = {
  id: string | null; title: string; revision: number | null; lifecycle: "ACTIVE" | "RETIRED" | null;
  summary: string | null; changeReason: string | null; retiredAt: string | null; retirementReason: string | null;
  result: SmokeResult | null; fields: SmokeField[]; sections: SmokeSection[];
  prerequisites: SmokeSection | null; steps: SmokeSection | null; expected: SmokeSection | null; records: SmokeSection | null;
  logs: SmokeLog[]; range: SmokeRange;
};
export type SmokeDocument = {
  kind: SmokeKind; source: string; title: string; documentId: string | null; owner: string | null;
  format: { status: string; version: string | null; readable: boolean; writable: boolean; code: string | null };
  fields: SmokeField[]; sections: SmokeSection[]; memo: SmokeSection | null; common: SmokeSection | null;
  run: { sourceId: string | null; sourceTitle: string | null; sourcePath: string | null; number: number | null;
    state: "OPEN" | "CLOSED" | null; target: string | null; environment: string | null; createdAt: string | null;
    closedAt: string | null; closeReason: string | null } | null;
  cases: SmokeCase[]; counts: Record<SmokeResult | "invalid", number> | null; diagnostics: SmokeDiagnostic[]; valid: boolean;
};
export type SmokeIndexEntry = { projectId: string; localId: string; path: string; documentId?: string | null; document?: SmokeDocument };
export type SmokeIndex = {
  definitions: { projectId: string; localId: string; documentId: string | null; duplicate: boolean; runLocalIds: string[] }[];
  runs: { projectId: string; localId: string; sourceId: string | null; sourceLocalId: string | null;
    status: "linked" | "orphan" | "ambiguous" | "invalid" | "wrong-type"; number: number | null; duplicateNumber: boolean }[];
  duplicates: { projectId: string; documentId: string; localIds: string[] }[];
};
export function smokeFileKind(path: string): SmokeKind | null;
export function parseSmokeDocument(source: string, kind: SmokeKind, options?: { newRun?: boolean }): SmokeDocument;
export function buildSmokeIndex(entries: SmokeIndexEntry[]): SmokeIndex;
