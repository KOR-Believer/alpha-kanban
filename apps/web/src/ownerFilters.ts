import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { documentPathOwner, normalizeDocumentOwner } from "@alpha-kanban/shared/documents";
import { useCallback, useEffect, useState } from "react";

export type OwnerFilter = "all" | "unassigned" | `@${string}`;
export type OwnerFilters = Record<string, OwnerFilter>;
export const OWNER_FILTERS_KEY = "alpha-kanban.ownerFilters.v1";
const OWNER_FILTER_EVENT = "alpha-kanban:owner-filters";

export function parseOwnerFilters(raw: string | null): OwnerFilters {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([id, filter]) => {
      if (!id || typeof filter !== "string") return [];
      if (filter === "unassigned") return [[id, filter]];
      const owner = normalizeDocumentOwner(filter);
      return owner ? [[id, owner as OwnerFilter]] : [];
    }));
  } catch { return {}; }
}

function storedOwnerFilters(): OwnerFilters | undefined {
  try { return parseOwnerFilters(window.localStorage.getItem(OWNER_FILTERS_KEY)); }
  catch { return undefined; }
}

export function ownerFilterFor(filters: OwnerFilters, projectId?: string): OwnerFilter {
  return projectId && Object.hasOwn(filters, projectId) ? filters[projectId]! : "all";
}

function applyChanges(current: OwnerFilters, changes: OwnerFilters): OwnerFilters {
  const result = { ...current };
  for (const [id, value] of Object.entries(changes)) {
    if (value === "all") delete result[id];
    else Object.defineProperty(result, id, { value, writable: true, enumerable: true, configurable: true });
  }
  return result;
}

/** Display preferences only: no repository calls, discovery scans or Markdown writes. */
export function useOwnerFilters() {
  const [filters, setFilters] = useState<OwnerFilters>(() => storedOwnerFilters() ?? {});
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === OWNER_FILTERS_KEY || event.key === null) setFilters(storedOwnerFilters() ?? {});
    };
    const local = (event: Event) => setFilters((current) => applyChanges(current, (event as CustomEvent<OwnerFilters>).detail));
    window.addEventListener("storage", storage);
    window.addEventListener(OWNER_FILTER_EVENT, local);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(OWNER_FILTER_EVENT, local);
    };
  }, []);
  const update = useCallback((changes: OwnerFilters) => {
    const next = applyChanges(storedOwnerFilters() ?? filters, changes);
    try { window.localStorage.setItem(OWNER_FILTERS_KEY, JSON.stringify(next)); }
    catch { /* Keep this view usable when browser preferences cannot be saved. */ }
    window.dispatchEvent(new CustomEvent<OwnerFilters>(OWNER_FILTER_EVENT, { detail: changes }));
  }, [filters]);
  return { filters, update };
}

export function matchesOwnerFilter(file: MarkdownFileSummary, filter: OwnerFilter = "all"): boolean {
  if (filter === "all") return true;
  const owner = documentPathOwner(file).value;
  return filter === "unassigned" ? owner === null : owner === filter;
}

export function ownersInFiles(files: MarkdownFileSummary[]): string[] {
  return [...new Set(files.flatMap((file) => documentPathOwner(file).value ?? []))].sort();
}
