// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { DEFAULT_PANEL, PANEL_STORAGE_KEY, COLUMN_STORAGE_KEY, dockLimits, fitFloating, normalizePanelPreferences, useDocumentColumnFilters } from "./documentPanelState";
import { DocumentPanelShell } from "./DocumentPanelShell";
import { DOCK_NEUTRAL_ZONE_RATIO, getCardinalDirection, neutralDockBounds, panelDockTarget } from "./documentPanelDocking";

describe("document docking direction", () => {
  it.each([{ width: 1200, height: 600 }, { width: 700, height: 1400 }])("uses both diagonals for the $width by $height workspace", (area) => {
    const at = (x: number, y: number) => getCardinalDirection(x * area.width, y * area.height, area);
    expect(at(.5, .1)).toBe("top"); expect(at(.9, .5)).toBe("right");
    expect(at(.5, .9)).toBe("bottom"); expect(at(.1, .5)).toBe("left");
    expect(at(.25, .25)).toBe("left"); expect(at(.75, .25)).toBe("right");
    expect(at(.25, .75)).toBe("bottom"); expect(at(.75, .75)).toBe("bottom");
  });
  it("uses the same adjustable neutral bounds for display and hit testing", () => {
    const area = { width: 1000, height: 600 }, neutral = neutralDockBounds(area);
    expect(neutral.width).toBe(area.width * DOCK_NEUTRAL_ZONE_RATIO);
    expect(neutral.height).toBe(area.height * DOCK_NEUTRAL_ZONE_RATIO);
    expect(panelDockTarget(neutral.x, neutral.y, area)).toBeNull();
    expect(panelDockTarget(neutral.x + neutral.width, neutral.y + neutral.height, area)).toBeNull();
    expect(panelDockTarget(500, 210, area)).toBe("top");
    expect(panelDockTarget(500, 210, area, .4)).toBeNull();
    expect(panelDockTarget(500, 300, area, 0)).toBe("bottom");
    expect(panelDockTarget(500, 0, area, 1)).toBeNull();
  });
  it("rejects outside/invalid coordinates and side docks that cannot fit", () => {
    for (const [x, y] of [[-1, 20], [1001, 20], [50, -1], [50, 601], [NaN, 2]] as const) {
      expect(panelDockTarget(x, y, { width: 1000, height: 600 })).toBeNull();
    }
    expect(panelDockTarget(0, 0, { width: 0, height: 0 })).toBeNull();
    expect(panelDockTarget(0, 0, { width: Infinity, height: 600 })).toBeNull();
    expect(panelDockTarget(380, 300, { width: 390, height: 600 })).toBeNull();
    expect(panelDockTarget(195, 20, { width: 390, height: 600 })).toBe("top");
  });
});

describe("document panel bounds and preferences", () => {
  it("fits a small screen without changing the remembered size, then restores it", () => {
    const remembered = { width: 668, height: 620 };
    expect(fitFloating(remembered, { width: 350, height: 410 })).toEqual({ width: 334, height: 394 });
    expect(remembered).toEqual({ width: 668, height: 620 });
    expect(fitFloating(remembered, { width: 1280, height: 780 })).toEqual(remembered);
    expect(fitFloating({ width: 1, height: 1 }, { width: 1280, height: 780 })).toEqual(DEFAULT_PANEL.floating);
  });
  it("validates saved settings and preserves only a valid legacy left width", () => {
    expect(normalizePanelPreferences(null)).toEqual(DEFAULT_PANEL);
    expect(normalizePanelPreferences({}, 400).leftWidth).toBe(400);
    expect(normalizePanelPreferences({ pinned: "true", view: "evil", floating: { width: NaN, height: -2 } }).floating).toEqual(DEFAULT_PANEL.floating);
    expect(normalizePanelPreferences({ pinned: "true" }).pinned).toBe(true);
    expect(normalizePanelPreferences({ pinned: false, placement: "bottom", view: "details" })).toMatchObject({ pinned: false, expanded: false, placement: "bottom", view: "details" });
  });
  it("leaves a usable board and constrains the dock on short screens", () => {
    const normal = dockLimits({ width: 1000, height: 800 }, "bottom", 128);
    expect(normal.min).toBe(192); expect(normal.max).toBe(440);
    const short = dockLimits({ width: 1000, height: 300 }, "bottom", 128);
    expect(short.min).toBeLessThanOrEqual(short.max); expect(short.max).toBe(165);
    expect(dockLimits({ width: 700, height: 800 }, "left", 128).max).toBe(340);
  });
  it("restores a wide side dock and only fits it temporarily when the workspace shrinks", () => {
    const saved = normalizePanelPreferences({ ...DEFAULT_PANEL, leftWidth: 960 });
    expect(saved.leftWidth).toBe(960);
    const fittedWidth = (width: number, placement: "left" | "right") => {
      const bounds = dockLimits({ width, height: 800 }, placement, 128);
      return Math.max(bounds.min, Math.min(bounds.max, saved.leftWidth));
    };
    for (const placement of ["left", "right"] as const) {
      expect(fittedWidth(1600, placement)).toBe(960);
      expect(fittedWidth(1000, placement)).toBe(640);
      expect(fittedWidth(1600, placement)).toBe(960);
    }
    expect(saved.leftWidth).toBe(960);
  });
});

describe("document panel interaction", () => {
  let root: Root, container: HTMLDivElement;
  let width = 1280, height = 780;
  const observers = new Set<() => void>();
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { constructor(readonly callback: () => void) {} observe() { observers.add(this.callback); } disconnect() { observers.delete(this.callback); } });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return new DOMRect(0, 0, width, this.classList.contains("ak-document-panel-toolbar") ? 128 : height); });
    window.localStorage.clear(); await setLanguage("en");
    width = 1280; height = 780; container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function button(label: string) { const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label); expect(node, label).toBeDefined(); return node!; }
  async function click(label: string) { await act(async () => button(label).click()); }
  const Draft = () => { const [value, setValue] = useState(""); return <textarea aria-label="draft" value={value} onChange={(event) => setValue(event.target.value)} />; };
  async function mount(contextKey = "example") {
    await act(async () => root.render(<DocumentPanelShell contextKey={contextKey} count={12} total={12} ownerControl={null} currentDocument="Current document" toolbar={(controls, _close, moveHandle) => <>{moveHandle}{controls}</>} navigation={(view) => <p>{view}</p>}><Draft /></DocumentPanelShell>));
  }
  it("starts as left-pinned Cards and keeps the same board DOM and draft through pin, view and placement changes", async () => {
    await mount();
    const panel = container.querySelector("aside")!;
    const draft = container.querySelector("textarea")!;
    draft.value = "unfinished input";
    expect(panel.hidden).toBe(false);
    expect(panel.dataset.view).toBe("cards");
    expect(container.querySelector('[data-panel-mode="left"]')).not.toBeNull();
    await click("Details");
    await click("Panel position"); await click("Dock at the bottom");
    expect(container.querySelector('[data-panel-mode="bottom"]')).not.toBeNull();
    await click("Panel position"); await click("Dock on the left");
    expect(container.querySelector('[data-panel-mode="left"]')).not.toBeNull();
    await click("Unpin document panel");
    expect(container.querySelector('[data-panel-mode="floating"]')).not.toBeNull();
    expect(container.querySelector("textarea")).toBe(draft); expect(draft.value).toBe("unfinished input");
  });
  it("handles minimum, keyboard growth, viewport shrink/restore and reset without persisting the clamp", async () => {
    await mount(); await click("Unpin document panel");
    const handle = container.querySelector<HTMLElement>('[aria-label="Resize document panel"]')!;
    const body = container.querySelector<HTMLElement>('.ak-document-workspace-body')!;
    const key = async (key: string, shiftKey = false) => act(async () => { handle.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })); });
    await key("ArrowLeft"); expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("368px");
    await key("ArrowRight", true); expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("408px");
    await key("ArrowUp", true); expect(body.style.getPropertyValue("--ak-document-float-height")).toBe("580px");
    await act(async () => { width = 350; height = 400; observers.forEach((update) => update()); });
    expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("334px");
    await act(async () => { width = 1280; height = 780; observers.forEach((update) => update()); });
    expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("408px");
    expect(body.style.getPropertyValue("--ak-document-float-height")).toBe("580px");
    await key("Enter"); expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("368px");
  });
  it("closes on outside pointer without blocking the action, and returns focus on Escape", async () => {
    await mount(); const launcher = container.querySelector<HTMLButtonElement>('[data-tour="document-panel-toggle"]')!;
    await click("Unpin document panel");
    await act(async () => container.querySelector("textarea")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector("aside")!.hidden).toBe(true);
    await act(async () => launcher.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true })));
    expect(container.querySelector("aside")!.hidden).toBe(false);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(container.querySelector("aside")!.hidden).toBe(true); expect(document.activeElement).toBe(launcher);
  });
  it("captures a corner drag and stops on cancellation, retaining the bottom-left anchor", async () => {
    await mount(); await click("Unpin document panel");
    const handle = container.querySelector<HTMLElement>('[aria-label="Resize document panel"]')!;
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = vi.fn(() => true); handle.releasePointerCapture = vi.fn();
    const pointer = async (type: string, x: number, y: number) => act(async () => { handle.dispatchEvent(new PointerEvent(type, { pointerId: 3, clientX: x, clientY: y, button: 0, bubbles: true })); });
    await pointer("pointerdown", 376, 100); await pointer("pointermove", 676, 20);
    const body = container.querySelector<HTMLElement>('.ak-document-workspace-body')!;
    expect(handle.setPointerCapture).toHaveBeenCalledWith(3);
    expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("668px");
    expect(body.style.getPropertyValue("--ak-document-float-height")).toBe("620px");
    await pointer("pointercancel", 676, 20); await pointer("pointermove", 900, 0);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("668px");
    expect(document.body.style.userSelect).toBe("");
  });
  it.each(["left", "right", "top", "bottom", "floating"] as const)("toggles %s without changing the layout, view or size and remembers a closed panel", async (mode) => {
    const saved = { ...DEFAULT_PANEL, pinned: mode !== "floating", placement: mode === "floating" ? "left" : mode, view: "details", floating: { width: 600, height: 620 }, leftWidth: 380, bottomHeight: 300 };
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(saved));
    await mount();
    const panel = container.querySelector("aside")!, body = container.querySelector<HTMLElement>(".ak-document-workspace-body")!;
    const draft = container.querySelector("textarea")!; draft.value = "keep draft";
    await click("Documents");
    expect(panel.hidden).toBe(true); expect(body.dataset.panelOpen).toBe("false");
    expect(body.dataset.panelMode).toBe(mode);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)); });
    expect(JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY)!)).toEqual({ ...saved, expanded: false });
    await click("Documents");
    expect(panel.hidden).toBe(false); expect(panel.dataset.view).toBe("details"); expect(body.dataset.panelMode).toBe(mode);
    expect(body.style.getPropertyValue("--ak-document-float-width")).toBe("600px");
    expect(container.querySelector("textarea")).toBe(draft); expect(draft.value).toBe("keep draft");
    await click("Documents");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)); });
    await act(async () => root.unmount()); root = createRoot(container); await mount();
    expect(container.querySelector("aside")!.hidden).toBe(true);
    await click("Documents"); expect(container.querySelector("aside")!.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>(".ak-document-workspace-body")!.dataset.panelMode).toBe(mode);
  });
  function movingHandle() {
    const handle = button("Move document panel");
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = vi.fn(() => true); handle.releasePointerCapture = vi.fn();
    return handle;
  }
  const pointer = async (handle: HTMLElement, type: string, x: number, y: number, pointerId = 9) => act(async () => {
    handle.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, button: 0, isPrimary: true, bubbles: true, cancelable: true }));
  });
  it.each([
    ["top", 640, 20], ["right", 1260, 390], ["bottom", 640, 760], ["left", 20, 390],
  ] as const)("previews %s in workspace coordinates and only commits on drop", async (target, x, y) => {
    const saved = { ...DEFAULT_PANEL, leftWidth: 380, bottomHeight: 280, view: "details" };
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(saved));
    await mount();
    const body = container.querySelector<HTMLElement>(".ak-document-workspace-body")!, draft = container.querySelector("textarea")!;
    body.getBoundingClientRect = () => new DOMRect(40, 70, width, height);
    draft.value = "keep this draft";
    const handle = movingHandle();
    await pointer(handle, "pointerdown", 180, 90);
    await pointer(handle, "pointermove", x + 40, y + 70);
    expect(container.querySelector("[data-dock-preview]")?.getAttribute("data-dock-preview")).toBe(target);
    expect(body.dataset.panelMode).toBe("left");
    expect(JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY)!)).toEqual(saved);
    await pointer(handle, "pointerup", x + 40, y + 70);
    expect(body.dataset.panelMode).toBe(target); expect(container.querySelector("[data-dock-preview]")).toBeNull();
    expect(container.querySelector("textarea")).toBe(draft); expect(draft.value).toBe("keep this draft");
    expect(container.querySelector("aside")!.dataset.view).toBe("details");
    expect(body.style.getPropertyValue("--ak-document-dock-size")).toBe(target === "left" || target === "right" ? "380px" : "280px");
    expect(handle.setPointerCapture).toHaveBeenCalledWith(9); expect(handle.releasePointerCapture).toHaveBeenCalledWith(9);
    await act(async () => handle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it.each(["neutral", "outside", "escape", "pointercancel", "lostpointercapture", "blur", "context", "hidden"])("cancels %s without changing the saved dock", async (reason) => {
    await mount(); const handle = movingHandle();
    await pointer(handle, "pointerdown", 180, 20); await pointer(handle, "pointermove", 1260, 390);
    if (reason === "neutral" || reason === "outside") {
      const x = reason === "neutral" ? width / 2 : width + 1;
      await pointer(handle, "pointermove", x, height / 2);
      expect(container.querySelector('[data-dock-preview="neutral"]')).not.toBeNull();
      await pointer(handle, "pointerup", x, height / 2);
    } else if (reason === "escape") {
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    } else if (reason === "blur") await act(async () => window.dispatchEvent(new Event("blur")));
    else if (reason === "context") await mount("another");
    else if (reason === "hidden") await click("Documents");
    else await pointer(handle, reason, 1260, 390);
    await pointer(handle, "pointermove", 1260, 390); await pointer(handle, "pointerup", 1260, 390);
    expect(container.querySelector<HTMLElement>("[data-panel-mode]")!.dataset.panelMode).toBe("left");
    expect(container.querySelector("[data-dock-preview]")).toBeNull();
    expect(document.body.style.cursor).toBe(""); expect(document.body.style.userSelect).toBe("");
  });
  it("ignores small gestures and other pointers, and releases capture on unmount", async () => {
    await mount(); const handle = movingHandle();
    await pointer(handle, "pointerdown", 160, 20); await pointer(handle, "pointermove", 163, 21);
    expect(container.querySelector("[data-dock-preview]")).toBeNull();
    await pointer(handle, "pointermove", 1260, 390, 10); await pointer(handle, "pointerup", 1260, 390, 10);
    expect(container.querySelector("[data-dock-preview]")).toBeNull();
    await pointer(handle, "pointermove", 1260, 390);
    expect(container.querySelector('[data-dock-preview="right"]')).not.toBeNull();
    await act(async () => root.unmount()); root = createRoot(container);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(9); expect(document.body.style.cursor).toBe("");
  });
  it("opens the position menu from the handle and preserves side placement through a narrow viewport", async () => {
    await mount(); await click("Move document panel"); await click("Dock on the right");
    const body = container.querySelector<HTMLElement>("[data-panel-mode]")!;
    expect(body.dataset.panelMode).toBe("right");
    await act(async () => { width = 390; observers.forEach((update) => update()); });
    expect(body.dataset.panelMode).toBe("bottom");
    await click("Panel position"); expect(button("Dock on the right").disabled).toBe(true); expect(button("Dock at the top").disabled).toBe(false);
    await click("Panel position");
    await act(async () => { width = 1280; observers.forEach((update) => update()); });
    expect(body.dataset.panelMode).toBe("right");
  });
  it.each([
    ["Dock on the right", "ArrowLeft", 312, 322, -50],
    ["Dock at the top", "ArrowDown", 240, 250, 50],
  ] as const)("resizes the %s boundary in its physical direction and shares opposite-side sizes", async (label, key, before, after, delta) => {
    await mount(); await click("Panel position"); await click(label);
    const handle = container.querySelector<HTMLElement>('[aria-label="Resize document panel"]')!;
    expect(handle.getAttribute("aria-valuenow")).toBe(String(before));
    await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    expect(handle.getAttribute("aria-valuenow")).toBe(String(after));
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = vi.fn(() => true); handle.releasePointerCapture = vi.fn();
    await pointer(handle, "pointerdown", 900, 250);
    await pointer(handle, "pointermove", key === "ArrowLeft" ? 900 + delta : 900, key === "ArrowDown" ? 250 + delta : 250);
    await pointer(handle, "pointerup", 900, 250);
    expect(handle.getAttribute("aria-valuenow")).toBe(String(after + 50));
    await click("Panel position"); await click(key === "ArrowLeft" ? "Dock on the left" : "Dock at the bottom");
    expect(container.querySelector('[aria-label="Resize document panel"]')!.getAttribute("aria-valuenow")).toBe(String(after + 50));
  });
  it("keeps column filters project-specific without modifying owner preferences", async () => {
    localStorage.setItem("alpha-kanban.ownerFilters.v1", '{"a":"@alice"}');
    function Filters({ project }: { project: string }) {
      const [filters, update] = useDocumentColumnFilters(project);
      return <button onClick={() => update({ ...filters, name: "needle" })}>{filters.name || "empty"}</button>;
    }
    await act(async () => root.render(<Filters project="a" />)); await click("empty");
    await act(async () => root.render(<Filters project="b" />)); expect(container.textContent).toBe("empty");
    await act(async () => root.render(<Filters project="a" />)); expect(container.textContent).toBe("needle");
    expect(JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY)!).a.name).toBe("needle");
    expect(localStorage.getItem("alpha-kanban.ownerFilters.v1")).toBe('{"a":"@alice"}');
  });
});
