import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Columns2, FolderClosed, LayoutGrid, List, PanelBottom, Pin, PinOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DEFAULT_PANEL, PANEL_STORAGE_KEY, dockLimits, fitFloating, floatingLimits, readPanelPreferences, type PanelSize, type PanelView } from "./documentPanelState";
import { DocumentStatusSearch, type DocumentStatusSearchProps } from "./DocumentStatusControls";
import "./document-panel.css";

type ResizeAxis = "width" | "height" | "both" | "dock";
export function DocumentPanelShell({ children, toolbar, navigation, ownerControl, currentDocument, search, contextKey, count, total }: {
  children: ReactNode;
  toolbar: (controls: ReactNode, close: () => void) => ReactNode;
  navigation: (view: PanelView, close: () => void) => ReactNode;
  ownerControl: ReactNode;
  currentDocument: ReactNode;
  search?: DocumentStatusSearchProps;
  contextKey: string;
  count: number; total: number;
}) {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState(readPanelPreferences);
  const open = preferences.expanded;
  const setOpen = useCallback((value: boolean | ((previous: boolean) => boolean)) => {
    setPreferences((previous) => ({ ...previous, expanded: typeof value === "function" ? value(previous.expanded) : value }));
  }, []);
  const [area, setArea] = useState<PanelSize>({ width: 1024, height: 700 });
  const [toolbarHeight, setToolbarHeight] = useState(128);
  const [dragging, setDragging] = useState<ResizeAxis | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLElement>(null);
  const previousContext = useRef(contextKey);
  const gesture = useRef<{ id: number; x: number; y: number; size: PanelSize; dock: number; target: HTMLElement } | null>(null);
  const id = useId();
  // A left dock needs room for both panes. The saved choice survives a narrow viewport.
  const placement = preferences.placement === "left" && area.width >= 640 ? "left" : "bottom";
  const floating = !preferences.pinned;
  const visible = open;
  const size = fitFloating(preferences.floating, area);
  const limits = floatingLimits(area);
  const dockRange = dockLimits(area, placement, toolbarHeight);
  const dockSize = Math.max(dockRange.min, Math.min(dockRange.max, placement === "left" ? preferences.leftWidth : preferences.bottomHeight));
  const bounds = useRef({ area, floating, placement, dockRange });
  bounds.current = { area, floating, placement, dockRange };

  useLayoutEffect(() => {
    const update = () => {
      if (body.current) { const rect = body.current.getBoundingClientRect(); setArea({ width: rect.width, height: rect.height }); }
      if (toolbarRef.current) setToolbarHeight(toolbarRef.current.getBoundingClientRect().height);
    };
    update();
    const observer = new ResizeObserver(update);
    if (body.current) observer.observe(body.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Keep session settings. */ } }, 150);
    return () => clearTimeout(timer);
  }, [preferences]);
  useEffect(() => {
    if (previousContext.current !== contextKey && !preferences.pinned) setOpen(false);
    previousContext.current = contextKey;
  }, [contextKey, preferences.pinned, setOpen]);
  const close = useMemo(() => () => {
    if (preferences.pinned) return;
    setOpen(false);
    if (panel.current?.contains(document.activeElement)) launcher.current?.focus();
  }, [preferences.pinned, setOpen]);
  const content = useMemo(() => navigation(preferences.view, close), [navigation, preferences.view, close]);
  useEffect(() => {
    if (!floating || !open) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || gesture.current || panel.current?.contains(target) || status.current?.contains(target) ||
        target.closest('[data-document-panel-overlay], [data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"], .driver-popover, .driver-overlay')) return;
      setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || document.querySelector('[data-document-panel-overlay][data-state="open"], [role="listbox"], [role="dialog"], .driver-popover')) return;
      event.preventDefault(); setOpen(false); launcher.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
  }, [floating, open]);
  const finish = () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.target.hasPointerCapture?.(active.id)) active.target.releasePointerCapture(active.id);
    setDragging(null);
  };
  useEffect(() => { finish(); }, [floating, placement, visible]);
  useEffect(() => {
    if (!dragging) return;
    const oldCursor = document.body.style.cursor, oldSelect = document.body.style.userSelect;
    document.body.style.cursor = dragging === "both" ? "nesw-resize" : dragging === "width" || (dragging === "dock" && placement === "left") ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    const cancel = () => finish();
    window.addEventListener("blur", cancel);
    return () => { document.body.style.cursor = oldCursor; document.body.style.userSelect = oldSelect; window.removeEventListener("blur", cancel); };
  }, [dragging, placement]);
  const changeSize = (axis: ResizeAxis, next: PanelSize, dock: number) => {
    const current = bounds.current;
    if (axis === "dock") {
      const value = Math.max(current.dockRange.min, Math.min(current.dockRange.max, dock));
      setPreferences((previous) => ({ ...previous, [current.placement === "left" ? "leftWidth" : "bottomHeight"]: value }));
    } else {
      const fitted = fitFloating(next, current.area);
      setPreferences((previous) => ({ ...previous, floating: {
        width: axis === "height" ? previous.floating.width : Math.max(368, Math.round(fitted.width)),
        height: axis === "width" ? previous.floating.height : Math.max(540, Math.round(fitted.height)),
      } }));
    }
  };
  const reset = (axis: ResizeAxis) => changeSize(axis, DEFAULT_PANEL.floating, placement === "left" ? DEFAULT_PANEL.leftWidth : DEFAULT_PANEL.bottomHeight);
  const startResize = (event: PointerEvent<HTMLElement>, axis: ResizeAxis) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, size, dock: dockSize, target: event.currentTarget };
    setDragging(axis);
  };
  const moveResize = (event: PointerEvent<HTMLElement>, axis: ResizeAxis) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    event.preventDefault();
    changeSize(axis, { width: start.size.width + event.clientX - start.x, height: start.size.height + start.y - event.clientY },
      start.dock + (placement === "left" ? event.clientX - start.x : start.y - event.clientY));
  };
  const keyboardResize = (event: KeyboardEvent<HTMLElement>, axis: ResizeAxis) => {
    const amount = event.shiftKey ? 40 : 10;
    const vertical = axis === "height" || (axis === "dock" && placement === "bottom");
    const horizontal = axis === "width" || (axis === "dock" && placement === "left");
    const deltaX = horizontal || axis === "both" ? event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0 : 0;
    const deltaY = vertical || axis === "both" ? event.key === "ArrowUp" ? amount : event.key === "ArrowDown" ? -amount : 0 : 0;
    if (event.key === "Enter") { event.preventDefault(); reset(axis); }
    else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); changeSize(axis, event.key === "Home" ? limits.min : limits.max, event.key === "Home" ? dockRange.min : dockRange.max);
    } else if (deltaX || deltaY) {
      event.preventDefault(); changeSize(axis, { width: size.width + deltaX, height: size.height + deltaY }, dockSize + (horizontal ? deltaX : deltaY));
    }
  };
  const handle = (axis: ResizeAxis, label: string) => <div key={axis} role={axis === "both" ? "button" : "separator"} tabIndex={0}
    aria-label={t(label)} title={t("Drag or use arrow keys to resize. Enter resets the size.")}
    aria-orientation={axis === "both" ? undefined : axis === "width" || (axis === "dock" && placement === "left") ? "vertical" : "horizontal"}
    aria-valuenow={axis === "both" ? undefined : Math.round(axis === "dock" ? dockSize : axis === "width" ? size.width : size.height)}
    aria-valuemin={axis === "both" ? undefined : Math.round(axis === "dock" ? dockRange.min : axis === "width" ? limits.min.width : limits.min.height)}
    aria-valuemax={axis === "both" ? undefined : Math.round(axis === "dock" ? dockRange.max : axis === "width" ? limits.max.width : limits.max.height)}
    className={`ak-document-resizer ak-document-resizer-${axis}`} data-dragging={dragging === axis || undefined}
    onPointerDown={(event) => startResize(event, axis)} onPointerMove={(event) => moveResize(event, axis)}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={(event) => keyboardResize(event, axis)} onDoubleClick={() => reset(axis)}>
    {axis === "both" ? <ArrowUpRight aria-hidden="true" /> : null}
  </div>;
  const controls = <div className="ak-document-panel-controls" data-tour="document-panel-layout">
    <Popover open={placementOpen} onOpenChange={setPlacementOpen}>
      <PopoverTrigger asChild><Button variant="ghost" size="iconSm" title={t("Panel position")} aria-label={t("Panel position")}>
        {preferences.placement === "left" ? <Columns2 aria-hidden="true" /> : <PanelBottom aria-hidden="true" />}
      </Button></PopoverTrigger>
      <PopoverContent data-document-panel-overlay="" align="end" className="w-48 p-2" aria-label={t("Panel position")}>
        {(["left", "bottom"] as const).map((position) => <Button key={position} variant={preferences.placement === position ? "secondary" : "ghost"} size="sm" className="w-full justify-start" aria-pressed={preferences.placement === position}
          onClick={() => { setPreferences((previous) => ({ ...previous, placement: position, pinned: true })); setPlacementOpen(false); }}>
          {position === "left" ? <Columns2 aria-hidden="true" /> : <PanelBottom aria-hidden="true" />}{t(position === "left" ? "Dock on the left" : "Dock at the bottom")}
        </Button>)}
      </PopoverContent>
    </Popover>
    <div className="ak-document-view-switch" role="group" aria-label={t("Document list view")}>
      {(["cards", "details"] as const).map((view) => <Button key={view} variant={preferences.view === view ? "secondary" : "ghost"} size="iconSm" aria-pressed={preferences.view === view}
        title={t(view === "cards" ? "Cards" : "Details")} aria-label={t(view === "cards" ? "Cards" : "Details")} onClick={() => setPreferences((previous) => ({ ...previous, view }))}>
        {view === "cards" ? <LayoutGrid aria-hidden="true" /> : <List aria-hidden="true" />}
      </Button>)}
    </div>
    <Button size="sm" variant={preferences.pinned ? "secondary" : "ghost"} className="ak-document-pin" aria-pressed={preferences.pinned}
      title={t(preferences.pinned ? "Unpin document panel" : "Pin document panel")} aria-label={t(preferences.pinned ? "Unpin document panel" : "Pin document panel")}
      onClick={() => { setOpen(true); setPreferences((previous) => ({ ...previous, pinned: !previous.pinned })); }}>
      {preferences.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}<span>{t(preferences.pinned ? "Unpin" : "Pin")}</span>
    </Button>
  </div>;

  return <div className="ak-document-workspace">
    <div ref={body} className="ak-document-workspace-body" data-panel-mode={floating ? "floating" : placement} data-panel-open={visible}
      style={{ "--ak-document-dock-size": `${dockSize}px`, "--ak-document-float-width": `${size.width}px`, "--ak-document-float-height": `${size.height}px` } as CSSProperties}>
      <aside ref={panel} id={id} hidden={!visible} aria-label={t("Workspace files")} className="ak-document-panel" data-view={preferences.view}>
        <div ref={toolbarRef} className="ak-document-panel-toolbar">{toolbar(controls, close)}</div>
        <div className="ak-document-panel-scroll ak-scroll-area">{content}</div>
        {floating ? [handle("height", "Resize document panel height"), handle("width", "Resize document panel width"), handle("both", "Resize document panel")] : handle("dock", "Resize document panel")}
      </aside>
      <div className="ak-document-workspace-content">{children}</div>
    </div>
    <footer ref={status} className="ak-document-statusbar" aria-label={t("Document navigation")}>
      <Button ref={launcher} data-tour="document-panel-toggle" variant={visible ? "secondary" : "ghost"} size="sm" aria-controls={id} aria-expanded={visible} aria-label={t("Documents")} title={t("Documents")}
        onClick={() => setOpen((previous) => !previous)}>
        <FolderClosed aria-hidden="true" /><span>{t("Documents")}</span><span className="ak-document-count">{count === total ? total : `${count}/${total}`}</span><ChevronDown className={visible ? "rotate-180" : ""} aria-hidden="true" />
      </Button>
      {ownerControl}
      {search ? <DocumentStatusSearch key={contextKey} {...search} onReveal={() => setOpen(true)} /> : null}
      <div className="ak-document-status-context">{currentDocument}</div>
    </footer>
  </div>;
}
