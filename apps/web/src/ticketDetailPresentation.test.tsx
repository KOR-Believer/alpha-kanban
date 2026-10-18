// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detailLimits, fitDetailSize, resizeDetailSize, useTicketDetailPresentation,
  type TicketDetailPresentation,
} from "./components/tickets/useTicketDetailPresentation";

const viewport = { width: 1600, height: 1000 };
describe("ticket peek geometry", () => {
  it("allows wide side peeks and bounds every dimension to the viewport", () => {
    expect(fitDetailSize({ width: 1400, height: 600 }, "side", viewport)).toEqual({ width: 1400, height: 1000 });
    expect(fitDetailSize({ width: 5000, height: 5000 }, "modal", viewport)).toEqual({ width: 1552, height: 952 });
    expect(fitDetailSize({ width: 1, height: 1 }, "modal", viewport)).toEqual({ width: 480, height: 320 });
    expect(fitDetailSize({ width: 1000, height: 800 }, "side", { width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
    expect(fitDetailSize({ width: 1, height: 1 }, "modal", { width: 300, height: 200 })).toEqual({ width: 290, height: 190 });
    expect(fitDetailSize({ width: 500, height: 500 }, "full", viewport)).toEqual(viewport);
  });
  it("resizes centered edges symmetrically and supports two-axis corners", () => {
    const start = { width: 800, height: 600 };
    expect(resizeDetailSize(start, "modal", "bottom-right", 100, 50, viewport)).toEqual({ width: 1000, height: 700 });
    expect(resizeDetailSize(start, "modal", "left", -100, 50, viewport)).toEqual({ width: 1000, height: 600 });
    expect(resizeDetailSize(start, "modal", "top", 100, -50, viewport)).toEqual({ width: 800, height: 700 });
    expect(resizeDetailSize(start, "side", "left", -100, 50, viewport)).toEqual({ width: 900, height: 1000 });
  });
});

describe("ticket presentation preferences and gestures", () => {
  let root: Root;
  let container: HTMLDivElement;
  let current: TicketDetailPresentation;
  function Harness() { current = useTicketDetailPresentation(); return null; }
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("innerWidth", 1600); vi.stubGlobal("innerHeight", 1000);
    window.localStorage.clear();
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); vi.unstubAllGlobals();
    document.body.style.cursor = ""; document.body.style.userSelect = "";
  });
  async function mount() { await act(async () => root.render(<Harness />)); }
  async function resizeWindow(width: number, height: number) {
    vi.stubGlobal("innerWidth", width); vi.stubGlobal("innerHeight", height);
    await act(async () => { window.dispatchEvent(new Event("resize")); });
  }
  async function pointer(type: string, x = 0, y = 0, id = 1) {
    await act(async () => { window.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y })); });
  }
  it("remembers independent peek sizes and restores after a temporary viewport shrink", async () => {
    await mount();
    await act(async () => current.nudgeResize("left", -500, 0));
    expect(current.width).toBe(1220);
    await act(async () => current.setMode("modal"));
    await act(async () => current.nudgeResize("bottom-right", 100, -50));
    expect([current.width, current.height]).toEqual([1200, 700]);
    await resizeWindow(600, 400);
    expect([current.width, current.height]).toEqual([580, 380]);
    expect(JSON.parse(localStorage.getItem("alpha-kanban.ticketDetailModalSize")!)).toEqual({ width: 1200, height: 700 });
    await resizeWindow(1600, 1000);
    expect([current.width, current.height]).toEqual([1200, 700]);
    await act(async () => current.setMode("full"));
    expect([current.width, current.height]).toEqual([1600, 1000]);
    await act(async () => current.restorePeek());
    expect(current.mode).toBe("modal");
    expect([current.width, current.height]).toEqual([1200, 700]);
    await act(async () => current.setMode("side"));
    expect(current.width).toBe(1220);
    await act(async () => root.unmount()); root = createRoot(container);
    await mount();
    expect(current.mode).toBe("side"); expect(current.width).toBe(1220);
    await act(async () => current.setMode("modal"));
    expect([current.width, current.height]).toEqual([1200, 700]);
  });
  it("falls back safely on malformed preferences and supports limit/reset controls", async () => {
    localStorage.setItem("alpha-kanban.ticketDetailWidth", "NaN");
    localStorage.setItem("alpha-kanban.ticketDetailModalSize", '{"width":-4,"height":"no"}');
    localStorage.setItem("alpha-kanban.ticketDetailMode", "invalid");
    await mount(); expect(current.width).toBe(720); expect(current.mode).toBe("side");
    await act(async () => current.resizeToLimit("left", "max")); expect(current.width).toBe(1600);
    await act(async () => current.resetSize()); expect(current.width).toBe(720);
    await act(async () => current.setMode("modal"));
    expect([current.width, current.height]).toEqual([1000, 800]);
    await act(async () => current.resizeToLimit("bottom-right", "min"));
    expect([current.width, current.height]).toEqual([480, 320]);
    await act(async () => current.resetSize());
    expect([current.width, current.height]).toEqual([1000, 800]);
    expect(current.limits).toEqual(detailLimits("modal", viewport));
  });
  it.each(["pointerup", "pointercancel", "blur"])("cleans up a resize on %s and ignores other pointers", async (stop) => {
    document.body.style.cursor = "help"; document.body.style.userSelect = "text";
    await mount();
    await act(async () => current.startResize("left", 880, 0, 1));
    expect(document.body.style.cursor).toBe("ew-resize");
    await pointer("pointermove", 500, 0, 2); expect(current.width).toBe(720);
    await pointer("pointermove", 500); expect(current.width).toBe(1100);
    if (stop === "blur") await act(async () => { window.dispatchEvent(new Event("blur")); });
    else await pointer(stop);
    expect(current.isResizing).toBe(false);
    expect(document.body.style.cursor).toBe("help"); expect(document.body.style.userSelect).toBe("text");
    await pointer("pointermove", 100); expect(current.width).toBe(1100);
  });
  it("ends the gesture on mode change or unmount", async () => {
    await mount(); await act(async () => current.startResize("left", 800, 0, 1));
    await act(async () => current.setMode("modal"));
    expect(current.isResizing).toBe(false); expect(document.body.style.cursor).toBe("");
    await act(async () => current.startResize("bottom-right", 1000, 800, 1));
    await act(async () => root.unmount()); root = createRoot(container);
    expect(document.body.style.cursor).toBe(""); expect(document.body.style.userSelect).toBe("");
  });
});
