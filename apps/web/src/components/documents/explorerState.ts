import { useCallback, useState } from "react";

export type ExplorerMode = "work" | "files";
export type ExplorerPreferences = { mode: ExplorerMode; expanded: string[]; query: string };
export const EXPLORER_STORAGE_KEY = "alpha-kanban.fileExplorer.v1";
const defaults: ExplorerPreferences = { mode: "work", expanded: [""], query: "" };
export function inDocumentRoot(path: string, root: string | null): boolean {
  return root !== null && path.startsWith(root + "/");
}
export function readExplorerPreferences(): Record<string, ExplorerPreferences> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(EXPLORER_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (!item || typeof item !== "object") return [];
      return [[key, { mode: item.mode === "files" ? "files" : "work", query: typeof item.query === "string" ? item.query.slice(0, 1000) : "",
        expanded: Array.isArray(item.expanded) ? [...new Set(["", ...item.expanded.filter((p: unknown) => typeof p === "string" && !p.split("/").some(part => part === ".." || part === "."))])].slice(0, 500) : [""] }]];
    }));
  } catch { return {}; }
}
export function useExplorerPreferences(projectId?: string) {
  const [all, setAll] = useState(readExplorerPreferences);
  const update = useCallback((patch: Partial<ExplorerPreferences>) => {
    if (!projectId) return;
    setAll(current => {
      const next = { ...current, [projectId]: { ...(current[projectId] ?? defaults), ...patch } };
      try { localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify(next)); } catch { /* Session remains usable. */ }
      return next;
    });
  }, [projectId]);
  return [projectId && all[projectId] || defaults, update] as const;
}
