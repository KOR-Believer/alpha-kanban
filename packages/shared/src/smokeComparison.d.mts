import type { SmokeDocument, SmokeCase } from "./smokeMarkdown.mjs";
export type SmokeComparisonRow = { id: string; left: SmokeCase | null; right: SmokeCase | null; currentLifecycle: SmokeCase["lifecycle"];
  revisionChanged: boolean; criteriaChanged: boolean; resultChanged: boolean; notesChanged: boolean; historyChanged: boolean; different: boolean };
export function smokeCriteria(document: SmokeDocument, item: SmokeCase): string;
export function compareSmokeRuns(left: SmokeDocument, right: SmokeDocument, definition?: SmokeDocument): {
  rows: SmokeComparisonRow[]; commonChanged: boolean; memoChanged: boolean; currentDefinitionAvailable: boolean;
};
