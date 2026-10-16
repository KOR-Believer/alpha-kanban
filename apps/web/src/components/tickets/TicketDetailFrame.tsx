import { useTranslation } from "@/i18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, FileText, Maximize2, Minimize2, MoveDiagonal2, PanelRight, RectangleHorizontal, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TicketDetailMode } from "../../appRoute";
import type { ResizeEdge, TicketDetailPresentation } from "./useTicketDetailPresentation";

const views = [
  { mode: "side", label: "Side peek", icon: PanelRight },
  { mode: "modal", label: "Center peek", icon: RectangleHorizontal },
  { mode: "full", label: "Full view", icon: Maximize2 },
] as const;

export function TicketDetailFrame({ ticketId, presentation, onClose, hasDraft, isBusy, children }: {
  ticketId: string;
  presentation: TicketDetailPresentation;
  onClose: () => void;
  hasDraft: boolean;
  isBusy: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const returnFocus = useRef(typeof document !== "undefined" ? document.activeElement as HTMLElement | null : null);
  const currentView = views.find((view) => view.mode === presentation.mode)!;
  const ViewIcon = currentView.icon;
  const style = {
    "--ticket-detail-width": `${presentation.width}px`,
    "--ticket-detail-height": `${presentation.height}px`,
  } as CSSProperties;

  useEffect(() => presentation.stopResize, [presentation.stopResize]);
  function requestClose() {
    if (isBusy) return;
    setViewMenuOpen(false);
    if (hasDraft) setConfirmClose(true);
    else { presentation.stopResize(); onClose(); }
  }
  function changeView(mode: TicketDetailMode) {
    presentation.setMode(mode);
    setViewMenuOpen(false);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent layout="custom" showCloseButton={false} aria-describedby={undefined}
        className="ak-ticket-detail-shell" data-mode={presentation.mode} data-resizing={presentation.isResizing || undefined} style={style}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus({ preventScroll: true }); }
        }}
        onPointerDownOutside={(event) => { if (presentation.isResizing || hasDraft || isBusy) event.preventDefault(); }}
        onEscapeKeyDown={(event) => {
          if (presentation.isResizing) { event.preventDefault(); presentation.stopResize(); }
          else if (isBusy) event.preventDefault();
        }}>
        <div className="ak-ticket-detail-frame">
          <div className="ak-ticket-detail-toolbar">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{ticketId}</span>
            </span>
            <div className="ak-drawer-actions">
              <Popover open={viewMenuOpen} onOpenChange={setViewMenuOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={t("Ticket view")} title={t(currentView.label)}>
                    <ViewIcon className="size-4" aria-hidden="true" /><ChevronDown className="size-3" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48">
                  <div className="grid gap-1" role="group" aria-label={t("Ticket view options")}>
                    {views.map(({ mode, label, icon: Icon }) => (
                      <Button key={mode} variant="ghost" size="sm" className="w-full justify-start" aria-pressed={presentation.mode === mode} onClick={() => changeView(mode)}>
                        <Icon className="size-4" aria-hidden="true" />{t(label)}
                        {presentation.mode === mode ? <Check className="ml-auto size-4" aria-hidden="true" /> : null}
                      </Button>
                    ))}
                    <div className="my-1 border-t border-border" />
                    <Button variant="ghost" size="sm" disabled={presentation.mode === "full"} className="w-full justify-start"
                      onClick={() => { presentation.resetSize(); setViewMenuOpen(false); }}>
                      <RotateCcw className="size-4" aria-hidden="true" />{t("Reset size")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="iconSm" variant="ghost" aria-label={presentation.mode === "full" ? t("Restore ticket peek") : t("Expand ticket detail")}
                title={presentation.mode === "full" ? t("Restore peek") : t("Full view")}
                onClick={() => presentation.mode === "full" ? presentation.restorePeek() : presentation.setMode("full")}>
                {presentation.mode === "full" ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </Button>
              <Button size="iconSm" variant="ghost" disabled={isBusy} aria-label={t("Close ticket detail")} title={t("Close")} onClick={requestClose}><X aria-hidden="true" /></Button>
            </div>
          </div>
          <div className="ak-scroll-area ak-ticket-detail-scroll">
            <div className="ak-ticket-detail-document">{children}</div>
          </div>
        </div>
        {presentation.mode !== "full" ? (
          (presentation.mode === "side" ? ["left"] as const : ["left", "right", "top", "bottom", "bottom-right"] as const).map((edge) => (
            <ResizeHandle key={edge} edge={edge} presentation={presentation} />
          ))
        ) : null}
        <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
          <DialogContent className="w-[min(440px,calc(100vw-2rem))]">
            <DialogHeader className="pr-12">
              <DialogTitle>{t("작성 중인 내용을 버릴까요?")}</DialogTitle>
              <DialogDescription>{t("아직 저장하지 않은 상태 변경 사유와 수동 지시가 사라집니다.")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmClose(false)}>{t("계속 작성")}</Button>
              <Button variant="destructive" onClick={() => { setConfirmClose(false); presentation.stopResize(); onClose(); }}>{t("버리고 닫기")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function ResizeHandle({ edge, presentation }: { edge: ResizeEdge; presentation: TicketDetailPresentation }) {
  const { t } = useTranslation();
  const vertical = edge === "top" || edge === "bottom";
  const corner = edge === "bottom-right";
  return (
    <button type="button" className="ak-focus-ring ak-ticket-resize-handle" data-edge={edge}
      role={corner ? undefined : "separator"} aria-label={t("Resize ticket {{edge}}", { edge: t(edge) })}
      aria-orientation={corner ? undefined : vertical ? "horizontal" : "vertical"}
      aria-valuemin={corner ? undefined : vertical ? presentation.limits.minHeight : presentation.limits.minWidth}
      aria-valuemax={corner ? undefined : vertical ? presentation.limits.maxHeight : presentation.limits.maxWidth}
      aria-valuenow={corner ? undefined : vertical ? presentation.height : presentation.width}
      title={t("Drag to resize. Double-click to reset.")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        presentation.startResize(edge, event.clientX, event.clientY, event.pointerId);
      }}
      onDoubleClick={presentation.resetSize}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === "Home" || event.key === "End") presentation.resizeToLimit(edge, event.key === "Home" ? "min" : "max");
        else if (event.key === "Enter" || event.key === " ") presentation.resetSize();
        else presentation.nudgeResize(edge, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      }}>
      {corner ? <MoveDiagonal2 className="size-3" aria-hidden="true" /> : <span aria-hidden="true" />}
    </button>
  );
}
