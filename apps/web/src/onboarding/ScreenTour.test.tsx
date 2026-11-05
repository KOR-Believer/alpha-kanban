// @vitest-environment happy-dom
import { act, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage, t } from "../i18n";
import { TourButton, tourSteps, useScreenTour, type TourKind } from "./ScreenTour";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { availableTourSteps } from "./tourSteps";
import { english, korean } from "../i18n/messages";
import { claimTourOffer, readTourResult, saveTourResult, subscribeToTours, tourStorageKey } from "./tourState";

function Harness({ enabled = true, eligible = true, scope = "test", kind = "start" }: {
  enabled?: boolean; eligible?: boolean; scope?: string; kind?: TourKind;
}) {
  const tour = useScreenTour(kind, { enabled, eligible, scope });
  return <>
    <TourButton tour={tour} />
    <button data-tour-help="" onClick={tour.start}>{"Replay"}</button>
    {tourSteps(kind, t).map((step) => {
      const name = String(step.element).match(/"([^"]+)"/)![1];
      return <button key={name} data-tour={name}>{name}</button>;
    })}
  </>;
}

function ModalHarness({ open = true }: { open?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("maintenance", { enabled: open, eligible: false, container: host });
  return <Dialog open={open}><DialogContent ref={host} aria-describedby={undefined} style={{ transform: "translate(-50%, -50%)" }} onEscapeKeyDown={event => { if (tour.active) event.preventDefault(); }}>
    <DialogTitle>Maintenance</DialogTitle><TourButton tour={tour} />
    <div data-tour="maintenance-purpose">Preview only</div><button data-tour="maintenance-apply">Apply</button>
  </DialogContent></Dialog>;
}

describe("screen tours", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    localStorage.clear(); await setLanguage("ko");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.hidden ? [] : [new DOMRect(0, 0, 100, 28)]) as unknown as DOMRectList;
    });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const render = (props: Parameters<typeof Harness>[0] = {}) => act(async () => root.render(<StrictMode><Harness {...props} /></StrictMode>));
  const click = (selector: string) => act(async () => { document.querySelector<HTMLButtonElement>(selector)!.click(); });

  it("offers without opening automatically, saves skipping and still supports replay", async () => {
    await render();
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
    expect(document.querySelector(".driver-popover")).toBeNull();
    await click("[data-tour-offer] button:last-child");
    expect(readTourResult("start")).toBe("dismissed");
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    await render();
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("프로젝트 하나 열기");
    await click(".driver-popover-next-btn");
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("여러 프로젝트 함께 연결하기");
    for (let index = 1; index < tourSteps("start", t).length; index++) await click(".driver-popover-next-btn");
    expect(readTourResult("start")).toBe("completed");
    expect(document.querySelector(".driver-overlay")).toBeNull();
    expect(localStorage.getItem(tourStorageKey("board"))).toBeNull();
  });

  it("preserves the step across language changes and records Escape as dismissal", async () => {
    await render(); await click("[data-tour-help]"); await click(".driver-popover-next-btn");
    await act(async () => { await setLanguage("en"); });
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("Connect several projects");
    expect(document.querySelector(".driver-popover-close-btn")?.textContent).toBe("Skip tour");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape" })); });
    expect(document.querySelector(".driver-popover")).toBeNull();
    expect(readTourResult("start")).toBe("dismissed");
  });

  it("offers only on the first visit even when the user leaves without starting or skipping", async () => {
    await render();
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
    expect(readTourResult("start")).toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    expect(readTourResult("start")).toBeNull();
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-popover")).not.toBeNull();
    await click(".driver-popover-close-btn");
  });

  it("does not consume a first visit while disabled or ineligible and does not repeat across project scopes", async () => {
    await render({ enabled: false });
    expect(localStorage.getItem(`${tourStorageKey("start")}.offered`)).toBeNull();
    await render({ eligible: false });
    expect(localStorage.getItem(`${tourStorageKey("start")}.offered`)).toBeNull();
    await render({ kind: "project", scope: "first-project" });
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
    await render({ kind: "project", scope: "second-project" });
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    await render({ kind: "project", scope: "first-project" });
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    expect(readTourResult("project")).toBeNull();
  });

  it("does not offer on an ineligible surface but permits explicit replay", async () => {
    await render({ eligible: false });
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    await click("[data-tour-help]");
    expect(document.querySelectorAll(".driver-popover")).toHaveLength(1);
    await click(".driver-popover-close-btn");
    expect(readTourResult("start")).toBe("dismissed");
  });

  it.each(["scope", "disabled", "dialog", "target", "hidden", "resize", "unmount"])("cleans up on %s without recording completion or restarting", async (reason) => {
    await render(); await click("[data-tour-help]");
    let dialog: HTMLDivElement | undefined;
    if (reason === "scope") await render({ scope: "other" });
    if (reason === "disabled") { await render({ enabled: false }); await render(); }
    if (reason === "dialog") await act(async () => {
      dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (reason === "target") await act(async () => {
      const removed = document.querySelector('[data-tour="register-workspace"]')!;
      removed.remove();
      await new Promise((resolve) => setTimeout(resolve, 10));
      container.append(removed);
    });
    if (reason === "hidden") await act(async () => {
      document.querySelector<HTMLElement>('[data-tour="open-project"]')!.hidden = true;
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    if (reason === "resize") await act(async () => { window.dispatchEvent(new Event("resize")); });
    if (reason === "unmount") await act(async () => root.render(null));
    expect(document.querySelector(".driver-overlay")).toBeNull();
    expect(document.querySelector(".driver-popover")).toBeNull();
    expect(document.body.classList.contains("driver-active")).toBe(false);
    expect(readTourResult("start")).toBeNull();
    dialog?.remove();
  });

  it("keeps a separate first-use record for each surface and always exposes replay", async () => {
    await render({ kind: "project" }); await click("[data-tour-offer] button:last-child");
    await render({ kind: "all" });
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("보고 싶은 프로젝트 고르기");
    await click(".driver-popover-close-btn");
    expect(readTourResult("all")).toBe("dismissed");
    expect(readTourResult("project")).toBe("dismissed");
    expect(readTourResult("start")).toBeNull();
    expect(container.querySelector("[data-tour-replay]")).not.toBeNull();
  });

  it("adapts to missing and hidden targets instead of refusing the whole tour", async () => {
    await render();
    const target = document.querySelector('[data-tour="open-project"]')!;
    const hidden = document.querySelector<HTMLElement>('[data-tour="new-project"]')!;
    hidden.hidden = true; target.remove();
    expect(availableTourSteps("start", t)).toHaveLength(tourSteps("start", t).length - 2);
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("여러 프로젝트 함께 연결하기");
    await click(".driver-popover-close-btn");
    container.append(target);
  });

  it("does not start without any targets or over another dialog", async () => {
    await render();
    const targets = [...container.querySelectorAll<HTMLElement>("[data-tour]")];
    targets.forEach((target) => { target.hidden = true; });
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-overlay")).toBeNull();
    targets.forEach((target) => { target.hidden = false; });
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    await click("[data-tour-help]");
    expect(document.querySelector(".driver-overlay")).toBeNull();
    dialog.remove();
  });

  it("reacts to another tab's dismissal", async () => {
    await render();
    await act(async () => {
      localStorage.setItem(tourStorageKey("start"), "dismissed");
      window.dispatchEvent(new StorageEvent("storage", { key: tourStorageKey("start"), newValue: "dismissed" }));
    });
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
  });

  it("restores nested scrolling and preserves inputs through a language change and dismissal", async () => {
    await render({ kind: "project", eligible: false });
    const input = document.createElement("input"); input.value = "keep my search"; container.append(input);
    const help = container.querySelector<HTMLButtonElement>("[data-tour-help]")!;
    help.focus();
    const originalFocus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      originalFocus.call(this, options);
      if (this === help && !options?.preventScroll) container.scrollTop = 0;
    });
    container.scrollTop = 135; container.scrollLeft = 22;
    await click("[data-tour-help]");
    container.scrollTop = 600; container.scrollLeft = 0;
    await act(async () => { await setLanguage("en"); });
    container.scrollTop = 900;
    await click(".driver-popover-close-btn");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(container.scrollTop).toBe(135); expect(container.scrollLeft).toBe(22);
    expect(input.value).toBe("keep my search");
  });

  it("keeps a dialog tour inside its focus boundary, ignores hidden parent dialogs and restores its position", async () => {
    const background = document.createElement("div"); background.setAttribute("role", "dialog"); background.setAttribute("aria-hidden", "true"); document.body.append(background);
    await act(async () => root.render(<ModalHarness />));
    expect(document.querySelector("[data-tour-offer]")).toBeNull();
    expect(localStorage.getItem(`${tourStorageKey("maintenance")}.offered`)).toBeNull();
    await click("[data-tour-replay]");
    const host = document.querySelector<HTMLElement>('[role="dialog"][data-tour-positioned]')!;
    expect(host).not.toBeNull();
    expect(host.contains(document.querySelector(".driver-overlay"))).toBe(true);
    expect(host.contains(document.querySelector(".driver-popover"))).toBe(true);
    for (let i = 0; i < 8; i++) {
      await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey: i > 3 })); });
      expect(document.activeElement?.closest(".driver-popover")).not.toBeNull();
    }
    await click(".driver-popover-next-btn");
    expect(document.querySelector(".driver-popover-title")?.textContent).toBe("확인한 뒤 적용하기");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape" })); });
    expect(host.isConnected).toBe(true); expect(host.hasAttribute("data-tour-positioned")).toBe(false);
    expect(document.querySelector(".driver-overlay")).toBeNull();
    expect(readTourResult("maintenance")).toBe("dismissed");
    await click("[data-tour-replay]");
    await act(async () => root.render(<ModalHarness open={false} />));
    expect(document.querySelector(".driver-overlay")).toBeNull();
    background.remove();
  });

  it("has localized steps and shared button variants", async () => {
    for (const kind of ["start", "project", "all", "detail", "linked", "maintenance", "link", "connections", "skill", "docs", "releases"] as const) {
      expect(tourSteps(kind, t).length).toBeGreaterThanOrEqual(3);
      expect(tourSteps(kind, t).every((step) => /[가-힣]/.test(step.popover!.title!))).toBe(true);
      tourSteps(kind, ((key: string) => {
        expect(korean[key], key).toBeTruthy(); expect(english[key], key).toBeTruthy(); return key;
      }) as typeof t);
    }
    await render(); await click("[data-tour-help]");
    expect(document.querySelector(".driver-popover-next-btn")?.classList.contains("bg-primary")).toBe(true);
    expect(document.querySelector(".driver-popover-prev-btn")?.classList.contains("h-7")).toBe(true);
    expect(document.querySelector(".driver-popover")?.getAttribute("aria-modal")).toBe("true");
  });
});

describe("tour preferences", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it("ignores unknown formats and preserves unrelated preferences", () => {
    localStorage.setItem(tourStorageKey("start"), "bad-value");
    localStorage.setItem("alpha-kanban.locale", "en");
    expect(readTourResult("start")).toBeNull();
    saveTourResult("start", "completed");
    expect(readTourResult("start")).toBe("completed");
    expect(localStorage.getItem("alpha-kanban.locale")).toBe("en");
  });
  it("records an invitation independently and honors old completed and dismissed tours", () => {
    localStorage.setItem("alpha-kanban.locale", "en");
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", "true");
    expect(claimTourOffer("start")).toBe(true);
    expect(claimTourOffer("start")).toBe(false);
    expect(readTourResult("start")).toBeNull();
    saveTourResult("board", "dismissed");
    expect(claimTourOffer("project")).toBe(false);
    expect(claimTourOffer("all")).toBe(false);
    expect(localStorage.getItem("alpha-kanban.locale")).toBe("en");
    expect(localStorage.getItem("alpha-kanban.autoOpenLastWorkspace")).toBe("true");
  });
  it("remembers an invitation in this session when storage is unavailable", () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(claimTourOffer("detail")).toBe(true);
    expect(claimTourOffer("detail")).toBe(false);
    expect(readTourResult("detail")).toBeNull();
  });
  it("honors existing shared board results without deleting or rewriting preferences", () => {
    saveTourResult("board", "dismissed");
    expect(readTourResult("project")).toBe("dismissed");
    expect(readTourResult("all")).toBe("dismissed");
    saveTourResult("project", "completed");
    expect(readTourResult("project")).toBe("completed");
    expect(readTourResult("all")).toBe("dismissed");
    expect(localStorage.getItem(tourStorageKey("board"))).toBe("dismissed");
  });
  it("supports storage subscriptions with cleanup and session fallback on write failure", () => {
    const changed = vi.fn(); const unsubscribe = subscribeToTours(changed);
    const setItem = vi.spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => { throw new Error("quota"); });
    saveTourResult("start", "dismissed");
    expect(readTourResult("start")).toBe("dismissed");
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe(); setItem.mockRestore(); saveTourResult("start", "completed");
    expect(changed).toHaveBeenCalledOnce();
  });
});
