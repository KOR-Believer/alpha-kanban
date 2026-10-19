// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { INTRO_INSTALL_REQUEST, SKILL_SOURCE_URL, SkillInstallPanel, UPDATE_REQUEST } from "../SkillGuide";
import { english, korean } from "../../i18n/messages";
import { IntroConversation } from "./IntroConversation";
import { INTRO_DURATION, INTRO_MESSAGES } from "./demo";

describe("intro interaction", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState({}, "", "/intro");
    await setLanguage("ko");
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });
  async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
  async function click(selector: string) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    expect(button, selector).not.toBeNull(); await act(async () => button!.click());
  }
  async function clickText(text: string, parent: ParentNode = document) {
    const button = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text);
    expect(button, text).toBeDefined(); await act(async () => button!.click());
  }
  async function key(key: string) {
    await act(async () => container.querySelector("#demo-transcript")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  }

  it("plays to the end, replays, pauses on language/visibility change, and clears its timer", async () => {
    vi.useFakeTimers();
    await render(<IntroConversation />);
    expect(container.querySelector("#demo-state")?.textContent).toBe("재생 준비");
    await click("#demo-play");
    await act(async () => vi.advanceTimersByTime(INTRO_DURATION));
    expect(container.querySelectorAll("[data-message]")).toHaveLength(INTRO_MESSAGES.length);
    expect(container.querySelector("#demo-state")?.textContent).toBe("재생 완료");
    expect(container.querySelector<HTMLInputElement>("#demo-seek")?.value).toBe(String(INTRO_DURATION));
    await click("#demo-play");
    expect(container.querySelectorAll("[data-message]")).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(20_000));
    await act(async () => setLanguage("en"));
    expect(container.querySelector("#demo-state")?.textContent).toBe("Playback paused");
    expect(container.querySelector<HTMLInputElement>("#demo-seek")?.value).toBe("20000");
    await click("#demo-play");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.querySelector("#demo-state")?.textContent).toBe("Playback paused");
    await click("#demo-play");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps document choice and source mode across languages and keyboard seeks", async () => {
    await render(<IntroConversation />);
    expect(container.querySelector("[data-document]")).toBeNull();
    await click("#workflow-read");
    expect(container.querySelector("#demo-document-text")?.textContent).toContain("필터를 다음 방문까지 유지할까?");
    await click('[data-file-location="tree"][data-document="tickets"]');
    await clickText("소스 보기");
    const pane = container.querySelector("#demo-document-text")!;
    expect(pane.querySelector("pre")?.textContent).toContain("Status: TODO");
    await act(async () => setLanguage("en"));
    expect(pane.isConnected).toBe(true);
    expect(pane.querySelector("pre")?.textContent).toContain("Not implemented · Human draft review.");
    expect(container.querySelector('[data-file-location="tab"][data-document="tickets"]')?.getAttribute("aria-pressed")).toBe("true");
    await click("#workflow-implement");
    await key("ArrowRight");
    expect(pane.querySelector("pre")?.textContent).toContain("Progress: 75%");
    await key("ArrowLeft");
    expect(pane.querySelector("pre")?.textContent).not.toContain("Progress: 75%");
    await key(" ");
    expect(container.querySelector("#demo-state")?.textContent).toBe("Playing");
    await key(" ");
    expect(container.querySelector("#demo-state")?.textContent).toBe("Playback paused");
  });

  it("keeps install/update hashes and request types distinct, with translated copy feedback", async () => {
    window.history.replaceState({}, "", "/intro#updates");
    await render(<SkillInstallPanel variant="intro" />);
    await clickText("업데이트 요청문 확인·복사");
    const dialog = document.querySelector('[role="dialog"]')!;
    const request = dialog.querySelector("textarea")!;
    expect(request.value).toBe(korean[UPDATE_REQUEST]!.replace("{{url}}", SKILL_SOURCE_URL));
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await clickText("요청문 복사", dialog);
    expect(document.activeElement).toBe(request);
    expect(request.selectionEnd).toBe(request.value.length);
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe(korean["Text selected. Copy it manually."]);
    await act(async () => setLanguage("en"));
    expect(dialog.isConnected).toBe(true);
    expect(request.value).toBe(UPDATE_REQUEST.replace("{{url}}", SKILL_SOURCE_URL));
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe("");
    clipboard.mockResolvedValue(undefined);
    await clickText("Copy request", dialog);
    expect(clipboard).toHaveBeenLastCalledWith(request.value);
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain("Update request copied");
    await clickText("Close", dialog);
    await act(async () => {
      window.history.replaceState({}, "", "/intro#skill"); window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await clickText("Review and copy install request");
    expect(document.querySelector("textarea")?.value).toBe(INTRO_INSTALL_REQUEST.replace("{{url}}", SKILL_SOURCE_URL));
    for (const key of [UPDATE_REQUEST, INTRO_INSTALL_REQUEST]) expect(english[key]).toBe(key);
  });

  it("ignores a clipboard completion for an earlier language", async () => {
    await render(<IntroConversation />);
    await click(".ak-conversation-copy");
    let copied!: () => void;
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(() => new Promise<void>(resolve => { copied = resolve; }));
    await clickText("요청문 복사");
    await act(async () => setLanguage("en"));
    await act(async () => copied());
    expect(document.querySelector('[role="dialog"] [role="status"]')?.textContent).toBe("");
    expect(document.querySelector("textarea")?.value).toBe(INTRO_MESSAGES[0].text);
  });

  it("keeps mode buttons and anchor destinations aligned", async () => {
    window.history.replaceState({}, "", "/intro#skill");
    await render(<SkillInstallPanel variant="intro" />);
    await clickText("기존 스킬 업데이트");
    expect(window.location.hash).toBe("#updates");
    await act(async () => setLanguage("en"));
    expect(container.textContent).toContain("Review and copy update request");
    await clickText("First installation");
    expect(window.location.hash).toBe("#skill");
    expect(container.textContent).toContain("Review and copy install request");
  });
});
