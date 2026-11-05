import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileCog, Loader2 } from "lucide-react";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { Button } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useTranslation } from "../i18n";
import { errorSummary } from "../i18n/errors";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserRepository, type BrowserMigration } from "./repository";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";
import { CodeDiff } from "../components/CodeDiff";

export function DocumentMaintenance({ file }: { file: MarkdownFileSummary }) {
  return <DocumentMaintenanceForFile key={`${file.workspaceId}:${file.id}`} file={file} />;
}

function DocumentMaintenanceForFile({ file }: { file: MarkdownFileSummary }) {
  const { t } = useTranslation(), queryClient = useQueryClient();
  const [open, setOpen] = useState(false), [plan, setPlan] = useState<BrowserMigration>();
  const [busy, setBusy] = useState<"preview" | "apply">(), [error, setError] = useState<Error>();
  const tourContainer = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("maintenance", { enabled: open && !busy, eligible: false, scope: `${file.id}:${plan?.preview.decision ?? "error"}`, container: tourContainer });
  const request = useRef(0), inFlight = useRef<typeof busy>(undefined);
  const previewAbort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => { request.current++; previewAbort.current?.abort(); }, []);
  usePwaDraft(open);
  const close = () => {
    if (inFlight.current === "apply") return;
    previewAbort.current?.abort(); previewAbort.current = undefined;
    request.current++; inFlight.current = undefined;
    setBusy(undefined); setOpen(false); setPlan(undefined); setError(undefined);
  };
  const preview = async () => {
    if (inFlight.current) return;
    const current = ++request.current;
    const controller = new AbortController(); previewAbort.current = controller;
    inFlight.current = "preview"; setBusy("preview"); setOpen(true); setPlan(undefined); setError(undefined);
    try {
      const next = await browserRepository.previewMigration(file.workspaceId, file.id, { assignId: true, cleanupLegacy: true, reconcileOwner: true, allowPlainMarkdown: file.type === "markdown" }, undefined, controller.signal);
      if (request.current === current) setPlan(next);
    } catch (cause) {
      if (request.current === current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request.current === current) { previewAbort.current = undefined; inFlight.current = undefined; setBusy(undefined); }
    }
  };
  const apply = async () => {
    if (inFlight.current || !plan || plan.preview.decision !== "ready" || error) return;
    const current = ++request.current;
    inFlight.current = "apply"; setBusy("apply"); setError(undefined);
    try {
      await browserRepository.applyMigration(plan);
      if (request.current === current) { setOpen(false); setPlan(undefined); }
      await queryClient.invalidateQueries();
    } catch (cause) {
      if (request.current === current) { setPlan(undefined); setError(cause instanceof Error ? cause : new Error(String(cause))); }
    } finally {
      if (request.current === current) { inFlight.current = undefined; setBusy(undefined); }
    }
  };
  return <>
    <Button data-tour="document-maintenance" size="sm" variant="outline" onClick={() => void preview()}><FileCog />{t("Document maintenance")}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent ref={tourContainer} className="grid-rows-[auto_minmax(0,1fr)_auto]" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy === "apply" || tour.active) event.preventDefault(); }}>
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle>{t("Document maintenance")}</DialogTitle><TourButton tour={tour} labelKey="Tour this dialog" /></div>
          <DialogDescription data-tour="maintenance-purpose">{t("Keep documents you continue to use aligned with the current document format. Review the changes, then apply them to save only this document. Maintenance is optional; existing documents remain readable.")}</DialogDescription>
          <p className="break-all text-xs text-muted-foreground">{file.relativePath}</p>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("Available changes include missing document IDs, folder-based Owner correction, and removal of obsolete guidance and templates.")}</p>
          {busy === "preview" ? <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("Preparing document preview…")}</p> : null}
          {plan ? <div className="grid gap-3 text-sm" aria-live="polite">
            <div className="grid gap-3" data-tour={plan.preview.retained.length || plan.preview.issues.length || plan.preview.decision === "noop" ? "maintenance-result" : undefined}>
            {plan.preview.decision === "noop" ? <p>{t("No document changes are needed.")}</p> : null}
            {plan.preview.retained.map((item, index) => <p key={index}>{t(item.code === "OWNER_PATH_UNRESOLVED" ? "Owner is kept because the document has no confirmed owner folder." : item.code === "LEGACY_REFERENCED_SECTION" ? "{{section}} will be kept to preserve an existing link." : item.code === "LEGACY_NOTES_PRESERVED" ? "Additional content in {{section}} will be kept." : "No recognized legacy content was found in {{section}}. This section will be kept.", { section: item.section })}</p>)}
            {plan.preview.issues.map((issue, index) => <div key={index} className="text-destructive"><p>{issue.path}</p><p>{t(migrationIssueMessage(issue.code))}</p><code className="text-xs">{issue.code}</code></div>)}
            </div>
            {plan.preview.changes.map((change) => <section data-tour="maintenance-diff" key={change.path} className="grid min-w-0 gap-2">
                <h3 className="break-all font-semibold">{change.path}</h3>
                <CodeDiff before={change.before} after={change.after} />
              </section>)}
            {plan.preview.rules.length > 0 ? <p className="text-xs text-muted-foreground">{t("Only links affected by this cleanup are checked within the connected project. Other documents are not changed.")}</p> : null}
          </div> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{errorSummary(error)}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy === "apply"} onClick={close}>{t("Cancel")}</Button>
          {error || plan?.preview.decision === "blocked" ? <Button variant="outline" disabled={Boolean(busy)} onClick={() => void preview()}>{t("Refresh preview")}</Button> : null}
          <Button data-tour="maintenance-apply" disabled={Boolean(busy) || plan?.preview.decision !== "ready" || Boolean(error)} onClick={() => void apply()}>{t("Apply reviewed changes")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function migrationIssueMessage(code: string) {
  if (["DELETED_OR_UNKNOWN_ANCHOR", "ANCHOR_UNCERTAIN"].includes(code)) return "A section link cannot be preserved. Keep the section or correct its references first.";
  if (["OUTSIDE_WRITE_SCOPE", "ABSOLUTE_REFERENCE_UNVERIFIED", "INCOMPLETE_REFERENCE_SCOPE"].includes(code)) return "This cleanup needs a wider reference check. Use the document CLI to inspect the affected files.";
  if (code === "TICKET_BODY_CHANGED") return "Ticket content will be preserved. Correct the section links before applying cleanup.";
  if (["UNSUPPORTED_FORMAT", "INVALID_FORMAT", "NEEDS_REPAIR"].includes(code)) return "This document format cannot be changed. Review the original Markdown with a supporting tool.";
  return "A document or reference could not be verified. Review the original Markdown before making changes.";
}
