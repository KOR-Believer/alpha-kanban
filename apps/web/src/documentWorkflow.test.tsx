// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TicketItem } from "@alpha-kanban/shared";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TicketDetailDrawer } from "./App";
import { setLanguage, t } from "./i18n";
import type { TicketDetailMode } from "./appRoute";
import { useTicketDetailPresentation } from "./components/tickets/useTicketDetailPresentation";

const ticket: TicketItem = {
  id: "DOC-01",
  title: "Document workflow",
  status: "READY",
  progress: 25,
  repository: ["alpha-kanban"],
  priority: "P1",
  type: "Feature",
  dependsOn: [],
  goal: ["Leave directions in Markdown"],
  currentProblem: [],
  implementationScope: [],
  outOfScope: [],
  completionCriteria: ["Preserve records"],
  completionCriteriaItems: [],
  validation: [],
  validationItems: [],
  userInstructions: [{
    date: "2026-10-13",
    text: "Existing user direction",
    raw: "- 2026-10-13: Existing user direction",
    index: 0,
    lineStart: 40,
    lineEnd: 40,
  }],
  progressNotes: [{
    date: "2026-10-13",
    text: "Existing verification result",
    raw: "- 2026-10-13: Existing verification result",
    index: 0,
    lineStart: 44,
    lineEnd: 44,
  }],
  hasUserInstructionsSection: true,
  unknownBlocks: [],
  range: { startLine: 10, endLine: 45 },
  missingFields: [],
};

describe("document-only ticket detail", () => {
  let queryClient: QueryClient;
  let root: Root;
  let container: HTMLDivElement;
  const onPatchTicket = vi.fn(async () => {});
  const onAppendInstruction = vi.fn(async () => {});
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    window.localStorage.clear();
    await setLanguage("ko");
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear(); container.remove(); vi.unstubAllGlobals();
  });
  function Harness({ mode }: { mode: TicketDetailMode }) {
    const presentation = useTicketDetailPresentation(mode);
    const [open, setOpen] = useState(true);
    return <>
      <button onClick={() => setOpen(true)}>Open ticket</button>
      {open ? (
        <QueryClientProvider client={queryClient}>
          <TicketDetailDrawer
            presentation={presentation}
            onAppendInstruction={onAppendInstruction}
            onPatchTicket={onPatchTicket}
            onClose={() => setOpen(false)}
            onExternalFileReload={async () => {}}
            onReload={async () => {}}
            ticket={ticket}
          />
        </QueryClientProvider>
      ) : null}
    </>;
  }
  function button(label: string) {
    label = t(label);
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label);
    expect(found, label).toBeDefined(); return found!;
  }
  async function click(label: string) { await act(async () => button(label).click()); }
  async function mount(mode: TicketDetailMode) {
    await act(async () => root.render(<Harness mode={mode} />));
  }
  it.each(["side", "modal", "full"] as const)("keeps document editing and hides chat in %s mode", async (mode) => {
      await mount(mode);
      const html = document.body.innerHTML;
      expect(html).toContain("Existing user direction");
      expect(html).toContain("Existing verification result");
      expect(html).toContain("속성");
      expect(html).not.toContain("기록 유형");
      expect(html).toContain("수동 지시");
      expect(html).toContain("문서에 추가");
      expect(html).not.toContain("Ticket chat");
      expect(html).not.toContain("Run with Codex");
      expect(html).not.toContain("Prompt preview");
      expect(html).not.toContain("contenteditable");
      expect(onPatchTicket).not.toHaveBeenCalled();
      expect(onAppendInstruction).not.toHaveBeenCalled();
  });

  it("preserves the same draft element across peek/full transitions and confirms before discarding", async () => {
    await mount("side");
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Preserve my draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Ticket view"); await click("Center peek");
    expect(document.querySelector('.ak-ticket-detail-shell')?.getAttribute("data-mode")).toBe("modal");
    expect(input.isConnected).toBe(true);
    await click("Expand ticket detail");
    expect(document.querySelectorAll(".ak-ticket-resize-handle")).toHaveLength(0);
    await click("Restore ticket peek");
    expect(document.querySelector('.ak-ticket-detail-shell')?.getAttribute("data-mode")).toBe("modal");
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Preserve my draft");
    await click("Close ticket detail");
    expect(document.body.textContent).toContain("작성 중인 내용을 버릴까요?");
    await click("계속 작성");
    expect(input.value).toBe("Preserve my draft");
    await click("Close ticket detail"); await click("버리고 닫기");
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    expect(onAppendInstruction).not.toHaveBeenCalled();
    expect(onPatchTicket).not.toHaveBeenCalled();
  });

  it("supports keyboard/corner resizing and reset without writing Markdown", async () => {
    await mount("modal");
    const shell = document.querySelector<HTMLElement>(".ak-ticket-detail-shell")!;
    const corner = button(t("Resize ticket {{edge}}", { edge: t("bottom-right") }));
    const width = () => parseFloat(shell.style.getPropertyValue("--ticket-detail-width"));
    const height = () => parseFloat(shell.style.getPropertyValue("--ticket-detail-height"));
    const initial = [width(), height()];
    await act(async () => { corner.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect([width(), height()]).toEqual([480, 320]);
    await act(async () => { corner.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    await act(async () => { corner.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, shiftKey: true })); });
    expect([width(), height()]).toEqual([500, 400]);
    await act(async () => { corner.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    expect([width(), height()]).toEqual(initial);
    expect(onAppendInstruction).not.toHaveBeenCalled(); expect(onPatchTicket).not.toHaveBeenCalled();
  });

  it("uses Escape to end resizing first, then dismisses and restores the opener's focus", async () => {
    await mount("side"); await click("Close ticket detail");
    button("Open ticket").focus(); await click("Open ticket");
    const handle = button(t("Resize ticket {{edge}}", { edge: t("left") }));
    await act(async () => { handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, clientX: 400 })); });
    expect(document.querySelector("[data-resizing]")).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(document.querySelector("[data-resizing]")).toBeNull();
    expect(document.querySelector(".ak-ticket-detail-shell")).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(document.activeElement).toBe(button("Open ticket"));
  });
  it("switches language live without remounting the form, translating document content, or saving", async () => {
    await mount("modal");
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "원문을 그대로 keep my draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await setLanguage("en"); });
    expect(document.body.textContent).toContain("Properties");
    expect(document.body.textContent).toContain("Manual instruction");
    expect(document.body.textContent).toContain("Existing user direction");
    expect(document.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("원문을 그대로 keep my draft");
    await act(async () => { await setLanguage("ko"); });
    expect(document.body.textContent).toContain("속성");
    expect(input.value).toBe("원문을 그대로 keep my draft");
    expect(onAppendInstruction).not.toHaveBeenCalled();
    expect(onPatchTicket).not.toHaveBeenCalled();
  });
});
