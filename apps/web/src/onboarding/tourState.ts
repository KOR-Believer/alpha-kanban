export type TourId = "start" | "board" | "project" | "all" | "detail";
export type TourResult = "dismissed" | "completed";

// This version belongs to the tour contract, not a release or service-worker cache.
export const tourStorageKey = (id: TourId) => `alpha-kanban.tours.v1.${id}`;
const changedEvent = "alpha-kanban-tour-changed";
const sessionResults = new Map<TourId, TourResult>();

export function readTourResult(id: TourId): TourResult | null {
  let value: string | null;
  try {
    value = localStorage.getItem(tourStorageKey(id));
    if (value === null && (id === "project" || id === "all")) value = localStorage.getItem(tourStorageKey("board"));
  }
  catch { return sessionResults.get(id) ?? null; }
  return value === "completed" || value === "dismissed" ? value : sessionResults.get(id) ?? null;
}

export function saveTourResult(id: TourId, result: TourResult) {
  try { localStorage.setItem(tourStorageKey(id), result); sessionResults.delete(id); }
  catch { sessionResults.set(id, result); }
  window.dispatchEvent(new Event(changedEvent));
}

export function subscribeToTours(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changedEvent, callback);
  };
}
