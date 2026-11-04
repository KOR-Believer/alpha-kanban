import { useLayoutEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export type HeaderSurface = "--background" | "--ak-surface";
export const THEME_STORAGE_KEY = "alpha-kanban.theme";

export function readTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

let theme = readTheme();
let headerSurface: HeaderSurface = "--background";
const listeners = new Set<() => void>();

function syncThemeColor() {
  const tokens = getComputedStyle(document.documentElement);
  const channelSurface = headerSurface === "--ak-surface" ? "--ak-header-surface" : "--ak-header-background";
  const color = tokens.getPropertyValue(channelSurface).trim() || tokens.getPropertyValue(headerSurface).trim();
  if (!color) return;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  // The app's explicit theme wins over the operating system's color scheme.
  meta.removeAttribute("media");
  meta.content = color;
}

function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.classList.toggle("dark", next === "dark");
  syncThemeColor();
  listeners.forEach((listener) => listener());
}

export function useThemeColor(surface: HeaderSurface) {
  useLayoutEffect(() => {
    headerSurface = surface;
    syncThemeColor();
    return () => {
      headerSurface = "--background";
      syncThemeColor();
    };
  }, [surface]);
}

export function initializeTheme() {
  applyTheme(readTheme());
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(readTheme());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function setTheme(next: Theme) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Session-only preference. */ }
  applyTheme(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTheme() {
  return useSyncExternalStore(subscribe, () => theme);
}
