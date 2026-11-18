import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { DOCK_DRAG_THRESHOLD_PX, panelDockTarget } from "./documentPanelDocking";
import type { PanelPlacement, PanelSize } from "./documentPanelState";

type Gesture = { id: number; x: number; y: number; active: boolean; handle: HTMLElement };
export function usePanelDockDrag({ enabled, contextKey, area, workspace, onDock, onGrab, onChoosePosition }: {
  enabled: boolean; contextKey: string; area: PanelSize; workspace: RefObject<HTMLDivElement | null>;
  onDock: (position: PanelPlacement) => void; onGrab: () => void; onChoosePosition: () => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ target: PanelPlacement | null } | null>(null);
  const release = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.handle.hasPointerCapture?.(current.id)) current.handle.releasePointerCapture(current.id);
  }, []);
  const cancel = useCallback(() => {
    if (gesture.current) suppressClick.current = true;
    release(); setPreview(null);
  }, [release]);
  useEffect(() => { cancel(); }, [enabled, contextKey, area.width, area.height, cancel]);
  useEffect(() => release, [release]);
  useEffect(() => {
    if (!enabled) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || !gesture.current) return;
      event.preventDefault(); event.stopPropagation();
      const handle = gesture.current.handle;
      cancel(); handle.focus({ preventScroll: true });
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("blur", cancel); document.removeEventListener("keydown", escape, true); };
  }, [enabled, cancel]);
  const active = preview !== null;
  useEffect(() => {
    if (!active) return;
    const oldCursor = document.body.style.cursor, oldSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing"; document.body.style.userSelect = "none";
    return () => { document.body.style.cursor = oldCursor; document.body.style.userSelect = oldSelect; };
  }, [active]);

  const targetAt = (event: PointerEvent<HTMLElement>) => {
    const rect = workspace.current?.getBoundingClientRect();
    return rect ? panelDockTarget(event.clientX - rect.left, event.clientY - rect.top, rect) : null;
  };
  return {
    preview,
    hasGesture: () => gesture.current !== null,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (!enabled || gesture.current || event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault(); event.stopPropagation();
        suppressClick.current = false; onGrab(); event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false, handle: event.currentTarget };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        event.preventDefault();
        if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DOCK_DRAG_THRESHOLD_PX) return;
        current.active = true;
        const target = targetAt(event);
        setPreview((previous) => previous?.target === target ? previous : { target });
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const target = current.active ? targetAt(event) : null;
        suppressClick.current = current.active;
        release(); setPreview(null);
        if (target) onDock(target);
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) { if (gesture.current?.id === event.pointerId) cancel(); },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) { if (gesture.current?.id === event.pointerId) cancel(); },
      onClick(event: MouseEvent<HTMLElement>) {
        if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
        else onChoosePosition();
        suppressClick.current = false;
      },
    },
  };
}
