export type TourId = "start" | "board" | "project" | "all" | "detail";
export type TourResult = "dismissed" | "completed";

// This version belongs to the tour contract, not a release or service-worker cache.
export const tourStorageKey = (id: TourId) => `alpha-kanban.tours.v1.${id}`;
const changedEvent = "alpha-kanban-tour-changed";
const sessionResults = new Map<TourId, TourResult>();
const sessionOffers = new Set<TourId>();

// Seeing an invitation is separate from completing or dismissing its tour.
export function claimTourOffer(id: TourId): boolean {
  if (readTourResult(id) || sessionOffers.has(id)) return false;
  const key = `${tourStorageKey(id)}.offered`;
  try {
    if (localStorage.getItem(key) === "true") return false;
    localStorage.setItem(key, "true");
  } catch { sessionOffers.add(id); }
  return true;
}

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
