// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { DEFAULT_PANEL, PANEL_STORAGE_KEY, COLUMN_STORAGE_KEY, dockLimits, fitFloating, normalizePanelPreferences, useDocumentColumnFilters } from "./documentPanelState";
import { DocumentPanelShell } from "./DocumentPanelShell";

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
  async function mount() {
    await act(async () => root.render(<DocumentPanelShell contextKey="example" count={12} total={12} ownerControl={null} currentDocument="Current document" toolbar={(controls) => controls} navigation={(view) => <p>{view}</p>}><Draft /></DocumentPanelShell>));
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
  it.each(["left", "bottom", "floating"] as const)("toggles %s without changing the layout, view or size and remembers a closed panel", async (mode) => {
    const saved = { ...DEFAULT_PANEL, pinned: mode !== "floating", placement: mode === "bottom" ? "bottom" : "left", view: "details", floating: { width: 600, height: 620 }, leftWidth: 380, bottomHeight: 300 };
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
