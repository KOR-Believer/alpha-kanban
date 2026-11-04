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
  it("names the shared site menu in both languages", async () => {
    expect(["Kanban", "About", "Site navigation"].map(key => t(key))).toEqual(["칸반", "소개", "사이트 메뉴"]);
    await setLanguage("en");
    expect(["Kanban", "About", "Site navigation"].map(key => t(key))).toEqual(["Kanban", "About", "Site navigation"]);
  });
  it("explains folder drop, separate consent and access recovery in both languages", async () => {
    const keys = ["Connected", "Drop your installed folder here", "Allow access and connect", "Connecting does not change files. Each update needs a separate confirmation.", "Your connection is saved. Allow access again to check the installed files.", "Drop one implementation-ledger folder at a time. Your existing connection is unchanged."];
    for (const key of keys) expect(t(key)).not.toBe(key);
    expect(t("Connected")).toBe("연결됨");
    await setLanguage("en");
    for (const key of keys) expect(t(key)).toBe(key);
  });
  it("explains unified search results and retry states in both languages", async () => {
    expect(t("Search documents and tickets")).toBe("문서·티켓 검색");
    expect(t("{{count}} documents could not be searched. Results are incomplete.", { count: 2 })).toContain("문서 2개");
    expect(t("View whole document")).toBe("이 문서 전체 보기");
    await setLanguage("en");
    expect(t("Results for “{{query}}”", { query: "needle" })).toBe("Results for “needle”");
    expect(t("Retry search preparation")).toBe("Retry search preparation");
  });
  it("explains a failed maintenance analysis with a retry action in both languages", async () => {
    const message = "Document analysis could not finish. Try the preview again.";
    expect(errorSummary(new Error(message))).toBe("문서 분석을 완료하지 못했습니다. 미리보기를 다시 시도해 주세요.");
    await setLanguage("en");
    expect(errorSummary(new Error(message))).toBe(message);
  });
  it("localizes format and duplicate-ID errors with a concrete next action", async () => {
    for (const code of ["UNSUPPORTED_FORMAT", "INVALID_FORMAT", "DUPLICATE_DOCUMENT_ID"]) {
      const error = Object.assign(new Error("technical details"), { code });
      const ko = errorSummary(error);
      expect(ko).toMatch(/수정|확인/);
      await setLanguage("en");
      expect(errorSummary(error)).not.toBe(ko);
      expect(errorSummary(error)).toMatch(/edit|format/);
      await setLanguage("ko");
    }
  });
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

  it("uses concise owner options and preserves owner names in both languages", async () => {
    expect(t("All")).toBe("전체");
    expect(t("Unassigned")).toBe("미지정");
    expect(t("Search owners")).toBe("소유자 검색");
    expect(t("Remove owner {{owner}}", { owner: "@alice" })).toBe("@alice 선택 해제");
    expect(t("Available changes include missing document IDs, folder-based Owner correction, and removal of obsolete guidance and templates.")).toContain("폴더에 맞춘 Owner 교정");
    expect(t("Owner is kept because the document has no confirmed owner folder.")).toBe("소유자 폴더를 확인할 수 없어 Owner는 그대로 둡니다.");
    await setLanguage("en");
    expect(t("All")).toBe("All");
    expect(t("Unassigned")).toBe("Unassigned");
    expect(t("Remove owner {{owner}}", { owner: "@alice" })).toBe("Remove owner @alice");
    expect(t("Available changes include missing document IDs, folder-based Owner correction, and removal of obsolete guidance and templates.")).toContain("folder-based Owner correction");
    expect(t("Owner is kept because the document has no confirmed owner folder.")).toBe("Owner is kept because the document has no confirmed owner folder.");
  });

  it("localizes explicit skill replacement consent and backup retention separately from normal updates", async () => {
    expect(t("Review reinstall")).toBe("재설치 내용 확인");
    expect(t("Back up and reinstall")).toBe("백업 후 다시 설치");
    expect(t("I have reviewed the changes and agree to replace this installation, including personal changes and extra files.")).toContain("추가 파일");
    expect(t("Backups stay on this site in this browser and are not automatically deleted, even after restoring or disconnecting.")).toContain("자동으로 지우지 않습니다");
    expect(t("Total backup file contents: {{size}}.", { size: "327 kB" })).toContain("327 kB");
    await setLanguage("en");
    expect(t("Review reinstall")).toBe("Review reinstall");
    expect(t("This installation differs from known official bundles. Regular updates will not replace it.")).toContain("Regular updates will not replace it");
  });

  it("localizes skill dialog sizing controls and file change labels", async () => {
    expect(t("Expand dialog")).toBe("전체 화면으로 보기");
    expect(t("Restore dialog size")).toBe("이전 크기로 복원");
    expect(t("Resize dialog {{edge}}", { edge: t("bottom-right") })).toBe("창 오른쪽 아래 크기 조절");
    expect([t("Add file"), t("Change file"), t("Remove file")]).toEqual(["추가", "변경", "삭제"]);
    expect([t("Installed skill"), t("Skill to apply"), t("Bundle ID"), t("Source commit")]).toEqual(["현재 설치본", "적용할 스킬", "번들 ID", "원본 커밋"]);
    expect(t("Unrecognized installation")).toBe("배포본 식별 안 됨");
    await setLanguage("en");
    expect(t("Expand dialog")).toBe("Expand dialog");
    expect(t("Resize dialog {{edge}}", { edge: t("bottom-right") })).toBe("Resize dialog bottom-right");
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
