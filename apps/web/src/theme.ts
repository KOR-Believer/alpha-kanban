import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "alpha-kanban.theme";

export function readTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

let theme = readTheme();
const listeners = new Set<() => void>();

function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.classList.toggle("dark", next === "dark");
  listeners.forEach((listener) => listener());
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
