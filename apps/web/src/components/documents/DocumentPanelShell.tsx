import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, FolderClosed, GripVertical, LayoutGrid, List, PanelBottom, PanelLeft, PanelRight, PanelTop, Pin, PinOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DEFAULT_PANEL, MIN_SIDE_DOCK_WIDTH, PANEL_STORAGE_KEY, dockLimits, fitFloating, floatingLimits, isSideDock, readPanelPreferences, visibleDockPlacement, type PanelPlacement, type PanelSize, type PanelView } from "./documentPanelState";
import { neutralDockBounds } from "./documentPanelDocking";
import { usePanelDockDrag } from "./usePanelDockDrag";
import { DocumentStatusSearch, type DocumentStatusSearchProps } from "./DocumentStatusControls";
import { RevealProjectFolder } from "./explorerState";
import "./document-panel.css";

type ResizeAxis = "width" | "height" | "both" | "dock";
const dockOptions = [
  { position: "top", label: "Dock at the top", Icon: PanelTop },
  { position: "right", label: "Dock on the right", Icon: PanelRight },
  { position: "bottom", label: "Dock at the bottom", Icon: PanelBottom },
  { position: "left", label: "Dock on the left", Icon: PanelLeft },
] as const;
export function DocumentPanelShell({ children, toolbar, navigation, ownerControl, currentDocument, search, contextKey, count, total, workView = true, onRevealFolder }: {
  children: ReactNode;
  toolbar: (controls: ReactNode, close: () => void, moveHandle: ReactNode) => ReactNode;
  navigation: (view: PanelView, close: () => void) => ReactNode;
  ownerControl: ReactNode;
  currentDocument: ReactNode;
  search?: DocumentStatusSearchProps;
  contextKey: string;
  count: number; total: number;
  workView?: boolean;
  onRevealFolder?: (path: string) => void;
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
  // Side docks need room for both panes. The saved choice survives a narrow viewport.
  const placement = visibleDockPlacement(preferences.placement, area);
  const floating = !preferences.pinned;
  const visible = open;
  const size = fitFloating(preferences.floating, area);
  const limits = floatingLimits(area);
  const dockRange = dockLimits(area, placement, toolbarHeight);
  const dockSize = Math.max(dockRange.min, Math.min(dockRange.max, isSideDock(placement) ? preferences.leftWidth : preferences.bottomHeight));
  const bounds = useRef({ area, floating, placement, dockRange });
  bounds.current = { area, floating, placement, dockRange };
  const dock = useCallback((position: PanelPlacement) => {
    setPreferences((previous) => ({ ...previous, placement: position }));
  }, []);
  const dockDrag = usePanelDockDrag({ enabled: !floating && visible && !dragging, contextKey, area, workspace: body,
    onDock: dock, onGrab: () => setPlacementOpen(false), onChoosePosition: () => setPlacementOpen(true) });
  const neutral = neutralDockBounds(area);
  const previewTarget = dockDrag.preview?.target;
  const previewRange = previewTarget ? dockLimits(area, previewTarget, toolbarHeight) : null;
  const previewSize = previewTarget && previewRange ? Math.max(previewRange.min, Math.min(previewRange.max,
    isSideDock(previewTarget) ? preferences.leftWidth : preferences.bottomHeight)) : 0;
  const PositionIcon = dockOptions.find((option) => option.position === preferences.placement)!.Icon;

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
    document.body.style.cursor = dragging === "both" ? "nesw-resize" : dragging === "width" || (dragging === "dock" && isSideDock(placement)) ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    const cancel = () => finish();
    window.addEventListener("blur", cancel);
    return () => { document.body.style.cursor = oldCursor; document.body.style.userSelect = oldSelect; window.removeEventListener("blur", cancel); };
  }, [dragging, placement]);
  const changeSize = (axis: ResizeAxis, next: PanelSize, dock: number) => {
    const current = bounds.current;
    if (axis === "dock") {
      const value = Math.max(current.dockRange.min, Math.min(current.dockRange.max, dock));
      setPreferences((previous) => ({ ...previous, [isSideDock(current.placement) ? "leftWidth" : "bottomHeight"]: value }));
    } else {
      const fitted = fitFloating(next, current.area);
      setPreferences((previous) => ({ ...previous, floating: {
        width: axis === "height" ? previous.floating.width : Math.max(368, Math.round(fitted.width)),
        height: axis === "width" ? previous.floating.height : Math.max(540, Math.round(fitted.height)),
      } }));
    }
  };
  const reset = (axis: ResizeAxis) => changeSize(axis, DEFAULT_PANEL.floating, isSideDock(placement) ? DEFAULT_PANEL.leftWidth : DEFAULT_PANEL.bottomHeight);
  const startResize = (event: PointerEvent<HTMLElement>, axis: ResizeAxis) => {
    if (event.button !== 0 || dockDrag.hasGesture()) return;
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
      start.dock + (isSideDock(placement) ? (event.clientX - start.x) * (placement === "left" ? 1 : -1) :
        (event.clientY - start.y) * (placement === "top" ? 1 : -1)));
  };
  const keyboardResize = (event: KeyboardEvent<HTMLElement>, axis: ResizeAxis) => {
    const amount = event.shiftKey ? 40 : 10;
    const vertical = axis === "height" || (axis === "dock" && !isSideDock(placement));
    const horizontal = axis === "width" || (axis === "dock" && isSideDock(placement));
    const deltaX = horizontal || axis === "both" ? event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0 : 0;
    const deltaY = vertical || axis === "both" ? event.key === "ArrowUp" ? amount : event.key === "ArrowDown" ? -amount : 0 : 0;
    if (event.key === "Enter") { event.preventDefault(); reset(axis); }
    else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); changeSize(axis, event.key === "Home" ? limits.min : limits.max, event.key === "Home" ? dockRange.min : dockRange.max);
    } else if (deltaX || deltaY) {
      const dockDelta = horizontal ? deltaX * (placement === "right" ? -1 : 1) : deltaY * (placement === "top" ? -1 : 1);
      event.preventDefault(); changeSize(axis, { width: size.width + deltaX, height: size.height + deltaY }, dockSize + dockDelta);
    }
  };
  const handle = (axis: ResizeAxis, label: string) => <div key={axis} role={axis === "both" ? "button" : "separator"} tabIndex={0}
    aria-label={t(label)} title={t("Drag or use arrow keys to resize. Enter resets the size.")}
    aria-orientation={axis === "both" ? undefined : axis === "width" || (axis === "dock" && isSideDock(placement)) ? "vertical" : "horizontal"}
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
        <PositionIcon aria-hidden="true" />
      </Button></PopoverTrigger>
      <PopoverContent data-document-panel-overlay="" align="end" className="w-48 p-2" aria-label={t("Panel position")}>
        {dockOptions.map(({ position, label, Icon }) => <Button key={position} variant={preferences.placement === position ? "secondary" : "ghost"} size="sm" className="w-full justify-start" aria-pressed={preferences.placement === position}
          disabled={isSideDock(position) && area.width < MIN_SIDE_DOCK_WIDTH}
          onClick={() => { setPreferences((previous) => ({ ...previous, placement: position, pinned: true })); setPlacementOpen(false); }}>
          <Icon aria-hidden="true" />{t(label)}
        </Button>)}
        {area.width < MIN_SIDE_DOCK_WIDTH ? <p className="ak-document-dock-limit">{t("On a narrow screen, dock at the top or bottom.")}</p> : null}
      </PopoverContent>
    </Popover>
    <div className="ak-document-view-switch" role="group" aria-label={t("Document list view")} hidden={!workView}>
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
  const moveHandle = !floating ? <Button variant="ghost" size="iconSm" className="ak-document-move-handle" data-tour="document-panel-move" data-dragging={!!dockDrag.preview || undefined}
    aria-label={t("Move document panel")} title={t("Drag to move the panel. Click to choose its position.")} {...dockDrag.handleProps}>
    <GripVertical aria-hidden="true" />
  </Button> : null;

  return <RevealProjectFolder.Provider value={(projectId, path) => {
    if (projectId === contextKey && onRevealFolder) { onRevealFolder(path); setOpen(true); }
  }}><div className="ak-document-workspace">
    <div ref={body} className="ak-document-workspace-body" data-panel-mode={floating ? "floating" : placement} data-panel-open={visible}
      style={{ "--ak-document-dock-size": `${dockSize}px`, "--ak-document-float-width": `${size.width}px`, "--ak-document-float-height": `${size.height}px` } as CSSProperties}>
      <aside ref={panel} id={id} hidden={!visible} aria-label={t("Workspace files")} className="ak-document-panel" data-view={preferences.view}>
        <div ref={toolbarRef} className="ak-document-panel-toolbar">
          {toolbar(controls, close, moveHandle)}
        </div>
        <div className="ak-document-panel-scroll ak-scroll-area">{content}</div>
        {floating ? [handle("height", "Resize document panel height"), handle("width", "Resize document panel width"), handle("both", "Resize document panel")] : handle("dock", "Resize document panel")}
      </aside>
      <div className="ak-document-workspace-content">{children}</div>
      {dockDrag.preview ? <div className="ak-document-dock-overlay" data-dock-preview={previewTarget ?? "neutral"}>
        {previewTarget ? <div className="ak-document-dock-preview" data-position={previewTarget} style={{ "--ak-document-preview-size": `${previewSize}px` } as CSSProperties} aria-hidden="true" /> : null}
        {dockOptions.filter(({ position }) => !isSideDock(position) || area.width >= MIN_SIDE_DOCK_WIDTH).map(({ position, label, Icon }) =>
          <div key={position} className="ak-document-dock-label" data-position={position} data-active={previewTarget === position} aria-hidden="true"><Icon />{t(label)}</div>)}
        <div className="ak-document-dock-neutral" style={{ left: neutral.x, top: neutral.y, width: neutral.width, height: neutral.height }}>
          <div role="status" aria-live="polite">{previewTarget ? t(dockOptions.find(({ position }) => position === previewTarget)!.label) : t("Release to cancel")}</div>
          <span>{t("Center or Esc to cancel")}</span>
        </div>
      </div> : null}
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
  </div></RevealProjectFolder.Provider>;
}
