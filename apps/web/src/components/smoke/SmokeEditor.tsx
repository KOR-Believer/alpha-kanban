import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MarkdownDocumentResponse, MarkdownFileSummary } from "@alpha-kanban/shared";
import { parseSmokeDocument, SMOKE_RESULTS, type SmokeResult } from "@alpha-kanban/shared/smokeMarkdown";
import type { SmokeChange } from "@alpha-kanban/shared/smokeRun";
import { browserRepository } from "../../browser/repository";
import { usePwaDraft } from "../../pwa/usePwaDraft";
import { useTranslation } from "../../i18n";
import { errorSummary } from "../../i18n/errors";
import { TourButton, useScreenTour } from "../../onboarding/ScreenTour";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { resultLabel } from "./smokeSheets";

type Draft = { source: MarkdownDocumentResponse; change: SmokeChange; initial: string; previous?: SmokeResult };
type Actions = { editMemo: () => void; editCase: (id: string) => void; closeRun: () => void };
const body = (value: string) => value.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");

export function SmokeEditor({ file, document, children }: { file: MarkdownFileSummary; document: MarkdownDocumentResponse; children: (actions: Actions) => ReactNode }) {
  const { t } = useTranslation(), router = useRouter(), client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(), [busy, setBusy] = useState(false), [error, setError] = useState<Error>();
  const [confirmExit, setConfirmExit] = useState(false), [failed, setFailed] = useState(false), [recovery, setRecovery] = useState(false);
  const tourContainer = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("smoke-edit", { enabled: Boolean(draft) && !busy && !confirmExit, eligible: false, scope: `${file.id}:${draft?.change.kind}`, container: tourContainer });
  const inFlight = useRef(false), exit = useRef<((blocked: boolean) => void) | null>(null);
  const dirty = Boolean(draft && draft.initial !== JSON.stringify(draft.change));
  const guard = useRef({ dirty, draft, failed }); guard.current = { dirty, draft, failed };
  usePwaDraft(Boolean(draft));
  useEffect(() => {
    const unblock = router.history.block({ enableBeforeUnload: false, blockerFn: () => {
      if (inFlight.current || exit.current) return true;
      if (!guard.current.draft || (!guard.current.dirty && !guard.current.failed)) return false;
      setConfirmExit(true);
      return new Promise<boolean>(resolve => { exit.current = resolve; });
    } });
    return () => { unblock(); exit.current?.(true); };
  }, [router]);
  const finishExit = (blocked: boolean) => {
    if (!blocked) { setDraft(undefined); setError(undefined); }
    exit.current?.(blocked); exit.current = null; setConfirmExit(false);
  };
  const requestClose = () => {
    if (inFlight.current) return;
    if (dirty || failed) setConfirmExit(true); else setDraft(undefined);
  };
  const open = (kind: SmokeChange["kind"], id?: string) => {
    const model = parseSmokeDocument(document.markdown, file.type === "smoke" ? "smoke" : "smoke-run");
    const item = model.cases.find(item => item.id === id), last = item?.logs.at(-1);
    const change: SmokeChange = kind === "memo" ? { kind, memo: body(model.memo?.content ?? "") }
      : kind === "close" ? { kind, reason: "" }
      : { kind, caseId: id!, result: item!.result!, memo: body(last?.memo?.content ?? ""), evidence: body(last?.evidence?.content ?? ""), reason: "", actor: "" };
    setDraft({ source: document, change, previous: item?.result ?? undefined, initial: JSON.stringify(change) });
    setError(undefined); setFailed(false); setRecovery(false);
  };
  const update = (values: Partial<SmokeChange> | { actor: string }) => setDraft(current => current ? { ...current, change: { ...current.change, ...values } as SmokeChange } : current);
  const save = async () => {
    if (!draft || inFlight.current || failed) return;
    inFlight.current = true; setBusy(true); setError(undefined);
    try {
      const saved = await browserRepository.editSmoke(file.workspaceId, file.id,
        { expectedHash: draft.source.file.hash, expectedMtimeMs: draft.source.file.mtimeMs }, draft.change);
      client.setQueryData(["markdown-document", file.workspaceId, file.id], saved);
      setDraft(undefined); void client.invalidateQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause))); setFailed(true);
      const records = await browserRepository.recoveries().catch(() => undefined);
      setRecovery(!records || records.some(record => record.fileId === file.id));
    } finally { inFlight.current = false; setBusy(false); }
  };
  const change = draft?.change;
  const source = useMemo(() => draft ? parseSmokeDocument(draft.source.markdown, file.type === "smoke" ? "smoke" : "smoke-run") : undefined, [draft?.source, file.type]);
  const remaining = source?.cases.filter(item => item.result === "NOT_RUN").map(item => item.id) ?? [];
  const valid = change?.kind === "close" ? Boolean(change.reason.trim()) : change?.kind === "case" ? dirty && (change.result === draft?.previous || Boolean(change.reason?.trim())) : dirty;
  return <>
    {children({ editMemo: () => open("memo"), editCase: id => open("case", id), closeRun: () => open("close") })}
    <Dialog open={Boolean(draft)} onOpenChange={value => { if (!value) requestClose(); }}>
      <DialogContent ref={tourContainer} showCloseButton={false} className="grid-rows-[auto_minmax(0,1fr)_auto]" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy || confirmExit || tour.active) event.preventDefault(); }}>
        <DialogHeader><div data-tour="smoke-edit-purpose"><DialogTitle>{t(change?.kind === "close" ? "Close run" : change?.kind === "case" ? "Edit result and notes" : "Edit sheet notes")}</DialogTitle>
          <DialogDescription>{t(change?.kind === "close" ? "Closing a run leaves every test result unchanged." : change?.kind === "case" ? "Record your observation and a reason when changing the result. Earlier records stay in the history." : "Write notes in Markdown. Test results and saved criteria are not changed.")}</DialogDescription></div><TourButton tour={tour} labelKey="Tour this dialog" /></DialogHeader>
        <DialogBody className="grid gap-4">
          {change?.kind === "case" ? <p className="text-sm font-semibold">{change.caseId} · {source?.cases.find(item => item.id === change.caseId)?.title}</p> : null}
          <fieldset data-tour="smoke-edit-fields" disabled={busy} className="grid gap-4">
            {change?.kind === "case" ? <>
              <label className="grid gap-1 text-sm">{t("Result")}<Select value={change.result} disabled={busy} onValueChange={result => update({ result: result as SmokeResult })}><SelectTrigger size="field" aria-label={t("Result")}><SelectValue /></SelectTrigger><SelectContent>{SMOKE_RESULTS.map(result => <SelectItem key={result} value={result}>{t(resultLabel[result])}</SelectItem>)}</SelectContent></Select></label>
              <label className="grid gap-1 text-sm">{t("Observation and notes")}<Textarea rows={4} value={change.memo} onChange={event => update({ memo: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">{t("Evidence")}<Textarea rows={3} value={change.evidence} onChange={event => update({ evidence: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">{t(change.result !== draft?.previous ? "Correction reason" : "Correction reason (optional)")}<Textarea rows={2} value={change.reason} onChange={event => update({ reason: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">{t("Recorded author (optional)")}<Input value={change.actor} maxLength={200} onChange={event => update({ actor: event.target.value })} /><span className="text-xs text-muted-foreground">{t("Enter your name or @ID to identify this edit. Leaving it empty records a user edit without an author.")}</span></label>
            </> : change?.kind === "memo" ? <label className="grid gap-1 text-sm">{t("Sheet notes")}<Textarea rows={12} value={change.memo} onChange={event => update({ memo: event.target.value })} /></label>
              : change?.kind === "close" ? <>
                {remaining.length ? <p className="text-sm">{t("Not run: {{ids}}", { ids: remaining.join(", ") })}</p> : null}
                <label className="grid gap-1 text-sm">{t("Closure note")}<Input maxLength={2048} value={change.reason} onChange={event => update({ reason: event.target.value })} /></label>
              </> : null}
          </fieldset>
          {error ? <p role="alert" className="text-sm text-destructive">{errorSummary(error)}</p> : null}
          {failed ? <p className="text-sm">{t(recovery ? "Your input is kept here. Check Recovery records in Local folders before editing again." : "Your input is kept here. Copy any text you need, then reopen the latest document before editing again.")}</p> : null}
        </DialogBody>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={requestClose}>{t("Cancel")}</Button><Button data-tour="smoke-edit-save" disabled={busy || failed || !valid} onClick={() => void save()}>{t(busy ? "Saving…" : change?.kind === "close" ? "Close run" : "Save")}</Button></DialogFooter>
      </DialogContent>
      <Dialog open={confirmExit} onOpenChange={value => { if (!value) finishExit(true); }}><DialogContent className="w-[min(440px,calc(100vw-2rem))]"><DialogHeader><DialogTitle>{t("Discard these smoke edits?")}</DialogTitle><DialogDescription>{t("The result and notes in this form have not been saved.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => finishExit(true)}>{t("Keep editing")}</Button><Button variant="destructive" onClick={() => finishExit(false)}>{t("Discard and continue")}</Button></DialogFooter></DialogContent></Dialog>
    </Dialog>
  </>;
}
