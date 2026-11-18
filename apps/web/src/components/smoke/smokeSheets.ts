import type { SmokeDocument, SmokeIndex, SmokeIndexEntry } from "@alpha-kanban/shared/smokeMarkdown";

export type SmokeSheetTab = { id: string; title: string; number: number | null; definition: boolean; path: string; duplicateNumber?: boolean };

/** UUID relationships are scoped by the caller to one connected project. Never join by slug. */
export function smokeSheetTabs(currentId: string, index: SmokeIndex, entries: SmokeIndexEntry[]): SmokeSheetTab[] {
  const run = index.runs.find(item => item.localId === currentId);
  const definition = index.definitions.find(item => item.localId === (run?.sourceLocalId ?? currentId));
  const ids = new Set<string>([currentId]);
  if (definition && !definition.duplicate) {
    ids.add(definition.localId);
    definition.runLocalIds.forEach(id => ids.add(id));
  } else if (run?.status === "orphan" && run.sourceId) {
    index.runs.filter(item => item.projectId === run.projectId && item.status === "orphan" && item.sourceId === run.sourceId).forEach(item => ids.add(item.localId));
  }
  return entries.filter(entry => ids.has(entry.localId) && entry.document).map(entry => ({
    id: entry.localId, title: entry.document!.title, number: entry.document!.run?.number ?? null,
    definition: entry.document!.kind === "smoke", path: entry.path,
    duplicateNumber: index.runs.find(run => run.localId === entry.localId)?.duplicateNumber,
  })).sort((a, b) => Number(b.definition) - Number(a.definition) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.path.localeCompare(b.path));
}

export function snapshotPath(document: SmokeDocument): string | undefined {
  const path = document.run?.sourcePath;
  return path && !/^[\\/]|[:\\\u0000-\u001f]/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..") ? path : undefined;
}

export const resultLabel = { NOT_RUN: "Not run", PASS: "Pass", FAIL: "Fail", BLOCKED: "Blocked", SKIPPED: "Skipped" } as const;
export const resultVariant = { NOT_RUN: "muted", PASS: "success", FAIL: "danger", BLOCKED: "warning", SKIPPED: "outline" } as const;
