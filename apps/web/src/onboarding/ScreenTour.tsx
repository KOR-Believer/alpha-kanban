import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { driver } from "driver.js";
import { Link } from "@tanstack/react-router";
import { BookOpen, CircleHelp, Info, Route } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button, buttonVariants } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ProjectGuide } from "../components/ProjectGuide";
import { claimTourOffer, readTourResult, saveTourResult, subscribeToTours } from "./tourState";
import { availableTourSteps, type TourKind } from "./tourSteps";
export { tourSteps, type TourKind } from "./tourSteps";

const otherDialog = (allowed?: HTMLElement | null) => Array.from(document.querySelectorAll('[role="dialog"]:not(.ak-screen-tour), [role="alertdialog"], [role="listbox"]'))
  .some((element) => element !== allowed);

export function useScreenTour(kind: TourKind, { enabled, eligible = enabled, scope = kind, container }: {
  enabled: boolean;
  eligible?: boolean;
  scope?: string;
  container?: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const id = kind;
  const result = useSyncExternalStore(subscribeToTours, () => readTourResult(id), () => null);
  const [invitation, setInvitation] = useState<{ id: TourKind; scope: string } | null>(null);
  const [run, setRun] = useState<{ scope: string } | null>(null);
  const index = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const start = useCallback(() => {
    if (!enabled || otherDialog(container?.current)) return;
    index.current = 0;
    returnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setInvitation(null);
    setRun({ scope });
  }, [enabled, scope, container]);

  useEffect(() => {
    const firstVisit = enabled && eligible && claimTourOffer(id);
    setInvitation((current) => firstVisit ? { id, scope } : current?.id === id && current.scope === scope ? current : null);
  }, [enabled, eligible, id, scope]);

  useEffect(() => {
    if (!run) return;
    const host = container?.current;
    if (!enabled || run.scope !== scope || otherDialog(host)) { setRun(null); return; }
    const steps = availableTourSteps(kind, t, host ?? document);
    const elements = steps.map((step) => step.element as HTMLElement);
    if (!steps.length) { setRun(null); return; }
    let disposing = false;
    const tour = driver({
      steps, animate: false, smoothScroll: false, disableActiveInteraction: true,
      stagePadding: 4, stageRadius: 8, overlayOpacity: 0.35,
      popoverClass: "ak-screen-tour", showProgress: true,
      nextBtnText: t("Next"), prevBtnText: t("Previous"), doneBtnText: t("Finish tour"),
      closeBtnLabel: t("Skip tour"), progressText: t("{{current}} of {{total}}", { current: "{{current}}", total: "{{total}}" }),
      onHighlighted() {
        // Driver creates its first overlay after rendering the popover.
        const overlay = document.querySelector(".driver-overlay");
        if (host && overlay && overlay.parentElement !== host) host.prepend(overlay);
      },
      onPopoverRender(popover, options) {
        // Keep the tour inside the existing Radix focus and pointer boundary.
        if (host) {
          const overlay = document.querySelector(".driver-overlay");
          if (overlay) host.append(overlay);
          host.append(popover.wrapper);
        }
        index.current = options.index ?? 0;
        popover.wrapper.setAttribute("role", "dialog");
        popover.wrapper.setAttribute("aria-modal", "true");
        popover.wrapper.setAttribute("aria-labelledby", popover.title.id);
        popover.wrapper.setAttribute("aria-describedby", popover.description.id);
        // Driver owns these DOM controls; share the same variants as our React Button.
        popover.previousButton.className = `driver-popover-prev-btn ${buttonVariants({ size: "sm", variant: "outline" })}`;
        popover.nextButton.className = `driver-popover-next-btn ${buttonVariants({ size: "sm" })}`;
        popover.closeButton.className = `driver-popover-close-btn ${buttonVariants({ size: "sm", variant: "ghost" })}`;
        popover.closeButton.textContent = t("Skip tour");
        popover.footer.insertBefore(popover.closeButton, popover.footerButtons);
      },
      onDestroyed(_element, _step, options) {
        if (disposing) return;
        const userEnded = ["done", "close", "escape", "overlay"].includes(options.reason ?? "");
        if (userEnded) saveTourResult(id, options.reason === "done" ? "completed" : "dismissed");
        setRun(null);
        if (userEnded) {
          const previous = returnFocus.current;
          const fallback = document.querySelector<HTMLElement>("[data-tour-help], [data-tour-replay]");
          const destination = previous?.isConnected && !previous.closest("[data-tour-offer]") ? previous : fallback;
          requestAnimationFrame(() => {
            if (destination?.isConnected && !otherDialog(host)) destination.focus({ preventScroll: true });
          });
        }
      },
    });
    tour.drive(Math.min(index.current, steps.length - 1));
    // Polling can remove a card, and a route/dialog can replace the current surface.
    const observer = new MutationObserver(() => {
      if (otherDialog(host) || elements.some((element) => !element.isConnected)) tour.destroy();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposing = true;
      observer.disconnect();
      tour.destroy();
    };
  }, [enabled, id, kind, run, scope, container, t, i18n.language]);

  return {
    start, enabled, active: Boolean(run), offered: enabled && eligible && !result && !run && invitation?.id === id && invitation.scope === scope,
    skip: () => saveTourResult(id, "dismissed"),
  };
}

export function TourButton({ tour, labelKey = "Take a quick tour" }: { tour: ReturnType<typeof useScreenTour>; labelKey?: string }) {
  const { t } = useTranslation();
  return <div className="ak-tour-invitation" data-tour-offer={tour.offered ? "" : undefined} role="group" aria-label={t("Screen tour")}>
    <Button data-tour-replay="" size="sm" variant={tour.offered ? "outline" : "ghost"} disabled={!tour.enabled} onClick={tour.start}><Route aria-hidden="true" />{t(labelKey)}</Button>
    {tour.offered ? <Button size="sm" variant="ghost" onClick={tour.skip}>{t("Skip tour")}</Button> : null}
  </div>;
}

export function TourHelp({ tour }: { tour: ReturnType<typeof useScreenTour> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useRef<(() => void) | null>(null);
  return <>
    {tour.offered ? <TourButton tour={tour} /> : null}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button ref={trigger} data-tour-help="" size="sm" variant="ghost"><CircleHelp aria-hidden="true" />{t("Help")}</Button></PopoverTrigger>
      <PopoverContent align="end" className="grid min-w-52 gap-1" onCloseAutoFocus={(event) => {
        if (action.current) { event.preventDefault(); const next = action.current; action.current = null; requestAnimationFrame(next); }
      }}>
        <Button data-tour-replay="" size="sm" variant="ghost" className="justify-start" disabled={!tour.enabled} onClick={() => { action.current = tour.start; setOpen(false); }}><Route aria-hidden="true" />{t("Take a quick tour")}</Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => { action.current = () => setGuideOpen(true); setOpen(false); }}><BookOpen aria-hidden="true" />{t("Create plans and tickets with AI")}</Button>
        <Link to="/intro" className={`${buttonVariants({ size: "sm", variant: "ghost" })} justify-start`} onClick={() => setOpen(false)}><Info aria-hidden="true" />{t("About Alpha Kanban")}</Link>
      </PopoverContent>
    </Popover>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="ak-usage-guide-dialog" aria-describedby={undefined} onCloseAutoFocus={(event) => {
        event.preventDefault(); trigger.current?.focus({ preventScroll: true });
      }}>
        <DialogHeader><DialogTitle>{t("Create plans and tickets with AI")}</DialogTitle></DialogHeader>
        <DialogBody><ProjectGuide /></DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setGuideOpen(false)}>{t("Close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
