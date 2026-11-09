import { useEffect, useState } from "react";
import { DEFAULT_COLUMN_FILTERS, type DocumentColumnFilters } from "../../documentSetFiltering";

export type PanelView = "cards" | "details";
export type PanelPlacement = "left" | "bottom";
export type PanelSize = { width: number; height: number };
export type PanelPreferences = {
  pinned: boolean; expanded: boolean; placement: PanelPlacement; view: PanelView;
  floating: PanelSize; leftWidth: number; bottomHeight: number;
};
export const PANEL_STORAGE_KEY = "alpha-kanban.documentPanel.v1";
export const COLUMN_STORAGE_KEY = "alpha-kanban.documentColumnFilters.v1";
export const DEFAULT_PANEL: PanelPreferences = {
  pinned: true, expanded: true, placement: "left", view: "cards",
  floating: { width: 368, height: 540 }, leftWidth: 312, bottomHeight: 240,
};
const validNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function normalizePanelPreferences(value: unknown, legacyWidth?: number): PanelPreferences {
  const saved = record(value) ? value : {};
  const floating = record(saved.floating) ? saved.floating : {};
  const pinned = typeof saved.pinned === "boolean" ? saved.pinned : DEFAULT_PANEL.pinned;
  return {
    pinned,
    expanded: typeof saved.expanded === "boolean" ? saved.expanded : pinned,
    placement: saved.placement === "left" || saved.placement === "bottom" ? saved.placement : DEFAULT_PANEL.placement,
    view: saved.view === "details" ? "details" : "cards",
    floating: { width: validNumber(floating.width, 368, 368, 10000), height: validNumber(floating.height, 540, 540, 10000) },
    leftWidth: validNumber(saved.leftWidth ?? legacyWidth, DEFAULT_PANEL.leftWidth, 280, 560),
    bottomHeight: validNumber(saved.bottomHeight, DEFAULT_PANEL.bottomHeight, 148, 1000),
  };
}
export function readPanelPreferences(): PanelPreferences {
  try {
    const legacy = localStorage.getItem("alpha-kanban.sidebarWidth");
    return normalizePanelPreferences(JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) ?? "null"), legacy ? Number(legacy) : undefined);
  } catch { return normalizePanelPreferences(null); }
}
export function floatingLimits(area: PanelSize) {
  const max = { width: Math.max(0, area.width - 16), height: Math.max(0, area.height - 16) };
  return { min: { width: Math.min(368, max.width), height: Math.min(540, max.height) }, max };
}
export function fitFloating(size: PanelSize, area: PanelSize): PanelSize {
  const { min, max } = floatingLimits(area);
  return { width: Math.min(max.width, Math.max(min.width, size.width)), height: Math.min(max.height, Math.max(min.height, size.height)) };
}
export function dockLimits(area: PanelSize, placement: PanelPlacement, toolbarHeight: number) {
  if (placement === "left") {
    const max = Math.min(560, Math.max(0, area.width - 360));
    return { min: Math.min(280, max), max };
  }
  const max = Math.max(0, Math.floor(Math.min(520, area.height * .55)));
  return { min: Math.min(Math.max(148, toolbarHeight + 64), max), max };
}
export function normalizeColumnFilters(value: unknown): DocumentColumnFilters {
  const saved = record(value) ? value : {};
  return {
    name: typeof saved.name === "string" ? saved.name : "",
    directory: typeof saved.directory === "string" ? saved.directory : "",
    completion: saved.completion === "complete" || saved.completion === "without-tickets" ? saved.completion : "all",
    types: Array.isArray(saved.types) ? [...new Set(saved.types.filter((type): type is DocumentColumnFilters["types"][number] => ["plan", "tickets", "inventory", "markdown"].includes(type)))] : [],
  };
}
function readColumnPreferences(): Record<string, DocumentColumnFilters> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) ?? "{}");
    return record(saved) ? Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, normalizeColumnFilters(value)])) : {};
  } catch { return {}; }
}
export function useDocumentColumnFilters(projectId: string | undefined) {
  const [preferences, setPreferences] = useState(readColumnPreferences);
  useEffect(() => { try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Session-only preferences still work. */ } }, [preferences]);
  return [projectId ? preferences[projectId] ?? DEFAULT_COLUMN_FILTERS : DEFAULT_COLUMN_FILTERS,
    (value: DocumentColumnFilters) => { if (projectId) setPreferences((current) => ({ ...current, [projectId]: value })); }] as const;
}
