// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./components/ThemeToggle";
import { setLanguage } from "./i18n";
import { initializeTheme, readTheme, setTheme, THEME_STORAGE_KEY } from "./theme";

describe("display theme", () => {
  let stop: () => void;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    await setLanguage("ko");
    stop = initializeTheme();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    stop();
    container.remove();
    document.documentElement.classList.remove("dark");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defaults to light and restores only a valid saved theme before mounting", () => {
    expect(readTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    stop();
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    stop = initializeTheme();
    expect(readTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    stop();
    window.localStorage.setItem(THEME_STORAGE_KEY, "invalid");
    stop = initializeTheme();
    expect(readTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles both ways, localizes its action, and preserves mounted drafts and preferences", async () => {
    window.localStorage.setItem("alpha-kanban.document-sort", "recent");
    const href = window.location.href;
    await act(async () => root.render(<><ThemeToggle /><ThemeToggle /><textarea defaultValue="draft" /></>));
    const draft = container.querySelector("textarea")!;
    draft.value = "unsaved direction";
    const buttons = () => [...container.querySelectorAll("button")];
    expect(buttons().every((button) => button.title === "다크 모드로 전환")).toBe(true);
    expect(buttons()[0]!.classList.contains("size-7")).toBe(true);
    await act(async () => buttons()[0]!.click());
    expect(readTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(buttons().every((button) => button.getAttribute("aria-label") === "라이트 모드로 전환")).toBe(true);
    await act(async () => { await setLanguage("en"); });
    expect(buttons()[0]!.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => buttons()[1]!.click());
    expect(readTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(buttons()[0]!.title).toBe("Switch to dark mode");
    expect(container.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("unsaved direction");
    expect(window.location.href).toBe(href);
    expect(window.localStorage.getItem("alpha-kanban.document-sort")).toBe("recent");
    expect(window.localStorage.getItem("alpha-kanban.locale")).toBe("en");
  });

  it("still switches when preference storage is blocked", () => {
    const storage = Object.getPrototypeOf(window.localStorage);
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readTheme()).toBe("light");
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("syncs across tabs without responding to unrelated preference changes", async () => {
    await act(async () => root.render(<ThemeToggle />));
    await act(async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(container.querySelector("button")!.title).toBe("라이트 모드로 전환");
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null })));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await act(async () => setTheme("dark"));
    await act(async () => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("removes its cross-tab listener when stopped", () => {
    stop();
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps both color schemes and document surfaces tied to semantic theme colors", () => {
    const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
    const app = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    expect(css).toMatch(/:root\s*\{\s*color-scheme: light/);
    expect(css).toMatch(/\.dark\s*\{\s*color-scheme: dark/);
    expect(app).not.toMatch(/bg-(blue|red|amber)-50\b|bg-neutral-100\b/);
    expect(app).toContain("bg-[var(--ak-primary-soft)] text-foreground");
    expect(app).toContain("bg-[var(--ak-danger-soft)]");
    expect(app).toContain("bg-[var(--ak-warning-soft)]");
  });

  it("separates dark surfaces and keeps small labels readable without changing the primary", () => {
    const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
    const dark = css.match(/\.dark\s*\{([^}]+)\}/)![1]!;
    const light = css.match(/:root\s*\{([^}]+)\}/)![1]!;
    const token = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))![1]!;
    const lightness = (name: string) => Number(token(dark, name).match(/oklch\(([\d.]+)/)![1]);

    expect(lightness("sidebar") - lightness("background")).toBeGreaterThanOrEqual(0.02);
    expect(lightness("card") - lightness("sidebar")).toBeGreaterThanOrEqual(0.05);
    expect(lightness("popover")).toBeGreaterThan(lightness("card"));
    expect(lightness("muted")).toBeGreaterThan(lightness("card"));
    expect(lightness("muted-foreground")).toBeGreaterThanOrEqual(0.75);
    expect(token(dark, "ak-ink-faint")).toBe("var(--muted-foreground)");
    expect(token(dark, "primary")).toBe(token(light, "primary"));
    expect(token(dark, "primary-foreground")).toBe(token(light, "primary-foreground"));
  });
});
