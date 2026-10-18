// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSelector } from "../components/LanguageSelector";
import { i18n, LANGUAGE_STORAGE_KEY, locale, readLanguage, setLanguage, t } from "./index";
import { english, korean } from "./messages";
import { errorDetails, errorSummary } from "./errors";

beforeEach(async () => {
  window.localStorage.clear();
  await setLanguage("ko");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("UI language", () => {
  it("defaults to Korean, restores English, and rejects unknown persisted values", () => {
    window.localStorage.clear();
    expect(readLanguage()).toBe("ko");
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(readLanguage()).toBe("en");
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readLanguage()).toBe("ko");
  });

  it("persists immediately and updates document language and date locale", async () => {
    expect(document.documentElement.lang).toBe("ko");
    expect(locale()).toBe("ko-KR");
    await setLanguage("en");
    expect(readLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(locale()).toBe("en-US");
    expect(t("All tickets")).toBe("All tickets");
    await setLanguage("ko");
    expect(t("All tickets")).toBe("전체 티켓");
  });

  it("still switches when browser storage is unavailable", async () => {
    const storage = Object.getPrototypeOf(window.localStorage);
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readLanguage()).toBe("ko");
    await expect(setLanguage("en")).resolves.toBeDefined();
    expect(t("All tickets")).toBe("All tickets");
  });

  it("syncs another tab's preference and resets safely after storage is cleared", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    window.dispatchEvent(new StorageEvent("storage", { key: LANGUAGE_STORAGE_KEY, newValue: "en" }));
    expect(i18n.language).toBe("en");
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(i18n.language).toBe("ko");
  });

  it("translates full sentences and display labels without changing canonical codes", async () => {
    expect(t("TODO")).toBe("할 일");
    expect(t("{{status}} tickets", { status: t("DONE") })).toBe("완료 티켓");
    expect(t("{{done}} / {{total}} tickets done", { done: 2, total: 4 })).toBe("티켓 2 / 4개 완료");
    await setLanguage("en");
    expect(t("TODO")).toBe("TODO");
    expect(t("수동 지시")).toBe("Manual instruction");
  });

  it("localizes the launcher and intro while preserving URLs in installation requests", async () => {
    expect(t("Register workspace")).toBe("워크스페이스 등록");
    expect(t("Search {{list}}", { list: t("Other projects") })).toBe("다른 프로젝트 검색");
    expect(t("View ticket detail")).toBe("티켓 상세 보기");
    expect(t("Ask your AI to implement the latest tickets, then connect the project folder to review progress. Moving tickets and leaving instructions are optional.")).toContain("선택 사항");
    await setLanguage("en");
    expect(t("Register workspace")).toBe("Register workspace");
    expect(t("About Alpha Kanban")).toBe("About Alpha Kanban");
  });

  it("exposes readable errors while preserving original diagnostic details", async () => {
    const error = Object.assign(new Error("File /repo/docs/tickets.md has changed"), { code: "STALE_FILE" });
    expect(errorSummary(error)).toContain("외부에서 문서가 변경");
    expect(errorDetails(error)).toBe("STALE_FILE: File /repo/docs/tickets.md has changed");
    expect(errorSummary(new Error("Folder access was not granted."))).toBe(t("Folder access was not granted."));
    await setLanguage("en");
    expect(errorSummary(error)).toBe("The document changed externally. Reload before saving.");
  });

  it("switches through the shadcn select without a Save action", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<LanguageSelector />));
      const trigger = container.querySelector<HTMLElement>('[aria-label="언어"]')!;
      expect(trigger.getAttribute("data-size")).toBe("sm");
      expect(trigger.classList.contains("h-7")).toBe(true);
      expect(trigger.classList.contains("text-xs")).toBe(true);
      await act(async () => { trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
      const englishOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === "English");
      expect(englishOption).toBeDefined();
      await act(async () => { englishOption!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
      expect(readLanguage()).toBe("en");
      expect(container.querySelector('[aria-label="Language"]')?.textContent).toBe("English");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});

describe("translation catalogs", () => {
  it("has both languages and identical interpolation variables for every message", () => {
    const variables = (value: string) => [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
    expect(Object.keys(korean).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(korean)) {
      expect(value.trim(), key).not.toBe("");
      expect(variables(value), key).toEqual(variables(english[key]!));
    }
  });
});
