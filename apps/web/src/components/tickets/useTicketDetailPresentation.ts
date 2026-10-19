import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketDetailMode } from "../../appRoute";

const MODE_KEY = "alpha-kanban.ticketDetailMode";
const WIDTH_KEY = "alpha-kanban.ticketDetailWidth";
const MODAL_SIZE_KEY = "alpha-kanban.ticketDetailModalSize";
const DEFAULT_SIDE_WIDTH = 720;
const DEFAULT_MODAL_SIZE = { width: 1000, height: 800 };
export type DetailSize = { width: number; height: number };
export type ResizeEdge = "left" | "right" | "top" | "bottom" | "bottom-right";
type Gesture = DetailSize & { edge: ResizeEdge; x: number; y: number; pointerId: number };

function stored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function storedModalSize(): DetailSize {
  try {
    const size = JSON.parse(stored(MODAL_SIZE_KEY) ?? "null");
    return { width: positive(size?.width, DEFAULT_MODAL_SIZE.width), height: positive(size?.height, DEFAULT_MODAL_SIZE.height) };
  } catch { return DEFAULT_MODAL_SIZE; }
}
function viewportSize(): DetailSize {
  return typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
}

export function detailLimits(mode: TicketDetailMode, viewport: DetailSize) {
  const gap = mode === "modal" ? Math.min(24, viewport.width * 0.025, viewport.height * 0.025) : 0;
  const maxWidth = Math.max(1, viewport.width - gap * 2);
  const maxHeight = Math.max(1, viewport.height - gap * 2);
  return { minWidth: Math.min(mode === "side" ? 360 : 480, maxWidth), maxWidth, minHeight: Math.min(320, maxHeight), maxHeight };
}

export function fitDetailSize(size: DetailSize, mode: TicketDetailMode, viewport: DetailSize): DetailSize {
  if (mode === "full") return viewport;
  const limits = detailLimits(mode, viewport);
  return {
    width: Math.round(Math.min(limits.maxWidth, Math.max(limits.minWidth, size.width))),
    height: mode === "side" ? viewport.height : Math.round(Math.min(limits.maxHeight, Math.max(limits.minHeight, size.height))),
  };
}

export function resizeDetailSize(start: DetailSize, mode: TicketDetailMode, edge: ResizeEdge, dx: number, dy: number, viewport: DetailSize): DetailSize {
  // A centered peek grows symmetrically; side peek stays attached to the right edge.
  const multiplier = mode === "modal" ? 2 : 1;
  const width = start.width + (edge === "left" ? -dx : edge === "right" || edge === "bottom-right" ? dx : 0) * multiplier;
  const height = start.height + (edge === "top" ? -dy : edge === "bottom" || edge === "bottom-right" ? dy : 0) * multiplier;
  return fitDetailSize({ width, height }, mode, viewport);
}

export function useTicketDetailPresentation(routeMode?: TicketDetailMode, onModeChange?: (mode: TicketDetailMode) => void) {
  const [mode, updateMode] = useState<TicketDetailMode>(() => {
    const value = stored(MODE_KEY);
    return routeMode ?? (value === "modal" || value === "full" ? value : "side");
  });
  const [sideWidth, setSideWidth] = useState(() => positive(Number(stored(WIDTH_KEY)), DEFAULT_SIDE_WIDTH));
  const [modalSize, setModalSize] = useState(storedModalSize);
  const [viewport, setViewport] = useState(viewportSize);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const previousPeek = useRef<TicketDetailMode>(mode === "full" ? "modal" : mode);
  const size = fitDetailSize(mode === "side" ? { width: sideWidth, height: viewport.height } : modalSize, mode, viewport);
  const limits = detailLimits(mode, viewport);
  const stopResize = useCallback(() => setGesture(null), []);
  const applyMode = useCallback((next: TicketDetailMode) => {
    setGesture(null);
    updateMode((current) => {
      if (current !== "full") previousPeek.current = current;
      return next;
    });
  }, []);
  const setMode = (next: TicketDetailMode) => {
    applyMode(next);
    onModeChange?.(next);
  };
  const restorePeek = () => setMode(previousPeek.current);
  const saveSize = useCallback((next: DetailSize) => {
    if (mode === "side") setSideWidth(next.width);
    if (mode === "modal") setModalSize(next);
  }, [mode]);
  const startResize = (edge: ResizeEdge, x: number, y: number, pointerId: number) => {
    if (mode !== "full") setGesture({ ...size, edge, x, y, pointerId });
  };
  const nudgeResize = (edge: ResizeEdge, dx: number, dy: number) => saveSize(resizeDetailSize(size, mode, edge, dx, dy, viewport));
  const resizeToLimit = (edge: ResizeEdge, bound: "min" | "max") => {
    const horizontal = edge === "left" || edge === "right" || edge === "bottom-right";
    const vertical = edge === "top" || edge === "bottom" || edge === "bottom-right";
    saveSize({
      width: horizontal ? limits[bound === "min" ? "minWidth" : "maxWidth"] : size.width,
      height: vertical ? limits[bound === "min" ? "minHeight" : "maxHeight"] : size.height,
    });
  };
  const resetSize = () => {
    stopResize();
    if (mode === "side") setSideWidth(DEFAULT_SIDE_WIDTH);
    if (mode === "modal") setModalSize(DEFAULT_MODAL_SIZE);
  };

  useEffect(() => {
    if (routeMode) applyMode(routeMode);
  }, [applyMode, routeMode]);
  useEffect(() => {
    const resize = () => { stopResize(); setViewport(viewportSize()); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [stopResize]);
  useEffect(() => {
    try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* Session-only preference. */ }
  }, [mode]);
  useEffect(() => {
    try { window.localStorage.setItem(WIDTH_KEY, String(sideWidth)); } catch { /* Session-only preference. */ }
  }, [sideWidth]);
  useEffect(() => {
    try { window.localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify(modalSize)); } catch { /* Session-only preference. */ }
  }, [modalSize]);
  useEffect(() => {
    if (!gesture) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = gesture.edge === "bottom-right" ? "nwse-resize" : gesture.edge === "left" || gesture.edge === "right" ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    const move = (event: PointerEvent) => {
      if (event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      saveSize(resizeDetailSize(gesture, mode, gesture.edge, event.clientX - gesture.x, event.clientY - gesture.y, viewport));
    };
    const stop = (event: PointerEvent) => { if (event.pointerId === gesture.pointerId) stopResize(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stopResize);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stopResize);
    };
  }, [gesture, mode, viewport, saveSize, stopResize]);

  return { mode, setMode, ...size, limits, isResizing: Boolean(gesture), startResize, nudgeResize, resizeToLimit, resetSize, stopResize, restorePeek };
}

export type TicketDetailPresentation = ReturnType<typeof useTicketDetailPresentation>;
