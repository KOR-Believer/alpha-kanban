import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { Plus } from "lucide-react";
import { browserRepository, type SmokeRunPlan } from "../../browser/repository";
import { usePwaDraft } from "../../pwa/usePwaDraft";
import { useTranslation } from "../../i18n";
import { errorSummary } from "../../i18n/errors";
import { TourButton, useScreenTour } from "../../onboarding/ScreenTour";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

export function NewSmokeRun({ workspaceId, sourceFileId, onCreated, disabled = false }: { workspaceId: string; sourceFileId?: string; onCreated: (file: MarkdownFileSummary) => void; disabled?: boolean }) {
  const { t } = useTranslation(), router = useRouter(), client = useQueryClient();
  const [open, setOpen] = useState(false), [plan, setPlan] = useState<SmokeRunPlan>();
  const [title, setTitle] = useState(""), [target, setTarget] = useState(""), [environment, setEnvironment] = useState("");
  const [caseIds, setCaseIds] = useState<string[]>([]), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"prepare" | "save">(), [failed, setFailed] = useState(false), [error, setError] = useState<Error>();
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const tourContainer = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("smoke-create", { enabled: open && Boolean(plan) && !busy && !confirmExit, eligible: false, scope: `${workspaceId}:${sourceFileId}`, container: tourContainer });
  const inFlight = useRef(false), request = useRef(0), exit = useRef<((blocked: boolean) => void) | null>(null);
  const guard = useRef({ open, dirty, busy, allow: false });
  guard.current = { ...guard.current, open, dirty, busy };
  usePwaDraft(open);
  useEffect(() => {
    const unblock = router.history.block({ enableBeforeUnload: false, blockerFn: () => {
      if (!guard.current.open || guard.current.allow) return false;
      if (inFlight.current || exit.current) return true;
      if (!guard.current.dirty) return false;
      setConfirmExit(true);
      return new Promise<boolean>(resolve => { exit.current = resolve; });
    } });
    return () => { request.current++; unblock(); exit.current?.(true); };
  }, [router]);
  const close = () => { request.current++; setOpen(false); setPlan(undefined); setError(undefined); setDirty(false); };
  const requestClose = () => {
    if (inFlight.current) return;
    if (dirty) setConfirmExit(true); else close();
  };
  const finishExit = (blocked: boolean) => {
    if (!blocked) close();
    exit.current?.(blocked); exit.current = null; setConfirmExit(false);
  };
  const prepare = async (fresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const attempt = ++request.current;
    guard.current.allow = false;
    setOpen(true); setBusy("prepare"); setError(undefined); setPlan(undefined); setFailed(false); setNeedsRecovery(false);
    if (fresh) { setTitle(""); setTarget(""); setEnvironment(""); setDirty(false); setCaseIds([]); }
    try {
      if (!sourceFileId) throw new Error("Open a uniquely linked smoke definition before creating a run.");
      const next = await browserRepository.prepareSmokeRun(workspaceId, sourceFileId);
      if (attempt !== request.current) return;
      const active = parseSmokeDocument(next.source.markdown, "smoke").cases.filter(item => item.lifecycle === "ACTIVE").map(item => item.id!);
      setPlan(next); setCaseIds(current => fresh ? active : current.filter(id => active.includes(id)));
    } catch (cause) { if (attempt === request.current) setError(cause instanceof Error ? cause : new Error(String(cause))); }
    finally { if (attempt === request.current) { inFlight.current = false; setBusy(undefined); } }
  };
  const create = async () => {
    if (inFlight.current || !plan || failed) return;
    inFlight.current = true; setBusy("save"); setError(undefined);
    try {
      const result = await browserRepository.createSmokeRun(plan, { title, target, environment, caseIds });
      guard.current.allow = true; close();
      onCreated(result.file);
      void client.invalidateQueries();
    } catch (cause) {
      setFailed(true); setError(cause instanceof Error ? cause : new Error(String(cause)));
      const records = await browserRepository.recoveries().catch(() => undefined);
      setNeedsRecovery(!records || records.some(record => record.workspaceId === workspaceId && record.sourceFileId === sourceFileId));
    }
    finally { inFlight.current = false; setBusy(undefined); }
  };
  const definition = useMemo(() => plan ? parseSmokeDocument(plan.source.markdown, "smoke") : undefined, [plan]);
  const cases = useMemo(() => definition?.cases.filter(item => item.lifecycle === "ACTIVE") ?? [], [definition]);
  return <>
    <Button data-tour="smoke-create" className="shrink-0 self-center" size="sm" variant="ghost" disabled={disabled} onClick={() => void prepare(true)}><Plus />{t("New run")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) requestClose(); }}>
      <DialogContent ref={tourContainer} className="grid-rows-[auto_minmax(0,1fr)_auto]" showCloseButton={false} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy || confirmExit || tour.active) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t("New smoke run")}</DialogTitle><DialogDescription>{t("Choose the current test cases to keep in this run. All results start as Not run.")}</DialogDescription><TourButton tour={tour} labelKey="Tour this dialog" /></DialogHeader>
        <DialogBody className="grid gap-4">
          {busy === "prepare" ? <p role="status">{t("Preparing run…")}</p> : null}
          {plan ? <>
            <p className="text-sm">{t("Run {{number}}", { number: plan.number })} · {definition?.title}</p>
            <fieldset disabled={Boolean(busy)} className="grid gap-3">
              <div data-tour="smoke-create-fields" className="grid gap-3">
              <label className="grid gap-1 text-sm">{t("Run name")}<Input value={title} maxLength={200} onChange={event => { setTitle(event.target.value); setDirty(true); }} /></label>
              <label className="grid gap-1 text-sm">{t("Test target")}<Input value={target} maxLength={2048} onChange={event => { setTarget(event.target.value); setDirty(true); }} /></label>
              <label className="grid gap-1 text-sm">{t("Test environment")}<Input value={environment} maxLength={2048} onChange={event => { setEnvironment(event.target.value); setDirty(true); }} /></label>
              </div>
              <div data-tour="smoke-create-cases" className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("Active test cases")}</h3><Button size="xs" variant="ghost" onClick={() => { setCaseIds(cases.map(item => item.id!)); setDirty(true); }}>{t("Select all")}</Button></div>
              {!cases.length ? <p className="text-sm">{t("No active test cases. Update the smoke definition first.")}</p> : cases.map(item => <label key={item.id} className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={caseIds.includes(item.id!)} onCheckedChange={checked => { setCaseIds(current => checked ? [...current, item.id!] : current.filter(id => id !== item.id)); setDirty(true); }} /><span>{item.id} · {item.title} <span className="text-muted-foreground">{t("Revision {{revision}}", { revision: item.revision! })}</span></span></label>)}
            </fieldset>
            <div data-tour="smoke-create-file" className="grid gap-1 text-xs text-muted-foreground"><strong>{t("New file")}</strong><span className="break-all">{plan.path}</span>{plan.owner ? <span>{plan.owner}</span> : null}<p>{t("The common notes and selected criteria are kept as they are now, even if the definition changes later.")}</p></div>
          </> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{errorSummary(error)}</p> : null}
          {needsRecovery ? <p className="text-sm">{t("Before trying again, check Recovery records in Local folders. A run may already have been saved.")}</p> : null}
        </DialogBody>
        <DialogFooter><Button variant="outline" disabled={Boolean(busy)} onClick={requestClose}>{t("Cancel")}</Button>
          {error ? <Button variant="outline" disabled={Boolean(busy)} onClick={() => void prepare(false)}>{t("Reload run setup")}</Button> : null}
          <Button data-tour="smoke-create-save" disabled={Boolean(busy) || !plan || failed || !title.trim() || !target.trim() || !environment.trim() || !caseIds.length} onClick={() => void create()}>{t(busy === "save" ? "Creating run…" : "Create run")}</Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={confirmExit} onOpenChange={value => { if (!value) finishExit(true); }}>
        <DialogContent className="w-[min(440px,calc(100vw-2rem))]"><DialogHeader><DialogTitle>{t("Discard this run setup?")}</DialogTitle><DialogDescription>{t("The run name, target, environment and case selection have not been saved.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => finishExit(true)}>{t("Keep editing")}</Button><Button variant="destructive" onClick={() => finishExit(false)}>{t("Discard and continue")}</Button></DialogFooter></DialogContent>
      </Dialog>
    </Dialog>
  </>;
}
