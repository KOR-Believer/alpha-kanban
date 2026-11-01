import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { normalizeDocumentOwner } from "@alpha-kanban/shared/documents";
import { useCallback, useEffect, useState } from "react";
import { matchesOwnerFilter, type OwnerFilter } from "./ownerFilters";

export type BoardOwnerSelection = Exclude<OwnerFilter, "all">;
export const ALL_BOARD_OWNER_FILTERS_KEY = "alpha-kanban.allBoardOwnerFilters.v1";
const CHANGE_EVENT = "alpha-kanban:all-board-owner-filters";

export function parseBoardOwnerSelection(raw: string | null): BoardOwnerSelection[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.flatMap((item): BoardOwnerSelection[] => {
      if (item === "unassigned") return [item];
      const owner = typeof item === "string" ? normalizeDocumentOwner(item) : null;
      return owner ? [owner as BoardOwnerSelection] : [];
    }))];
  } catch { return []; }
}

function readSelection(): BoardOwnerSelection[] {
  try { return parseBoardOwnerSelection(window.localStorage.getItem(ALL_BOARD_OWNER_FILTERS_KEY)); }
  catch { return []; }
}

/** All-board display state only. Project sidebar preferences are never read or changed. */
export function useAllBoardOwnerFilters() {
  const [selected, setSelected] = useState(readSelection);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === ALL_BOARD_OWNER_FILTERS_KEY || event.key === null) setSelected(readSelection());
    };
    const local = (event: Event) => setSelected((event as CustomEvent<BoardOwnerSelection[]>).detail);
    window.addEventListener("storage", storage);
    window.addEventListener(CHANGE_EVENT, local);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(CHANGE_EVENT, local);
    };
  }, []);
  const update = useCallback((value: BoardOwnerSelection[]) => {
    const next = parseBoardOwnerSelection(JSON.stringify(value));
    try { window.localStorage.setItem(ALL_BOARD_OWNER_FILTERS_KEY, JSON.stringify(next)); }
    catch { /* Keep the selection in this session when preferences cannot be saved. */ }
    setSelected(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }, []);
  return { selected, update };
}

export function matchesBoardOwnerSelection(file: MarkdownFileSummary, selected: BoardOwnerSelection[]): boolean {
  return !selected.length || selected.some((owner) => matchesOwnerFilter(file, owner));
}
