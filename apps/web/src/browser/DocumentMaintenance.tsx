import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileCog } from "lucide-react";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useTranslation } from "../i18n";
import { errorSummary } from "../i18n/errors";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserRepository, type BrowserMigration } from "./repository";

export function changedLines(before: string, after: string) {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - end - 1] === b[b.length - end - 1]) end++;
  return { before: a.slice(Math.max(0, start - 2), Math.min(a.length, a.length - end + 2)).join("\n"), after: b.slice(Math.max(0, start - 2), Math.min(b.length, b.length - end + 2)).join("\n") };
}

export function DocumentMaintenance({ file }: { file: MarkdownFileSummary }) {
  const { t } = useTranslation(), queryClient = useQueryClient();
  const [open, setOpen] = useState(false), [assignId, setAssignId] = useState(false), [cleanupLegacy, setCleanupLegacy] = useState(false);
  const [plan, setPlan] = useState<BrowserMigration>(), [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error>();
  usePwaDraft(open && (assignId || cleanupLegacy || busy));
  const reset = () => { setPlan(undefined); setError(undefined); setScopeConfirmed(false); };
  const close = () => { if (busy) return; setOpen(false); setAssignId(false); setCleanupLegacy(false); reset(); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(undefined);
    try { await action(); } catch (error) { setError(error instanceof Error ? error : new Error(String(error))); }
    finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileCog />{t("Document maintenance")}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t("Document maintenance")}</DialogTitle>
          <DialogDescription>{t("Choose what to change, then review the preview before saving. Only this document will be written.")}</DialogDescription>
          <p className="break-all text-xs text-muted-foreground">{file.relativePath}</p>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-3 text-sm">
            <label className="flex items-start gap-2"><Checkbox checked={assignId} disabled={busy} onCheckedChange={(value) => { setAssignId(value === true); reset(); }} />{t("Assign a document ID if missing")}</label>
            <label className="flex items-start gap-2"><Checkbox checked={cleanupLegacy} disabled={busy} onCheckedChange={(value) => { setCleanupLegacy(value === true); reset(); }} />{t("Clean up the old Progress Board")}</label>
          </div>
          {plan ? <div className="grid gap-3 text-sm" aria-live="polite">
            {plan.preview.decision === "noop" ? <p>{t("No changes are needed for the selected options.")}</p> : null}
            {plan.preview.retained.map((item, index) => <p key={index}>{t(item.code === "LEGACY_NOTES_PRESERVED" ? "The heading and notes outside the table will be kept." : "No supported Progress Board table was found. This section will be kept.")}</p>)}
            {plan.preview.issues.map((issue, index) => <div key={index} className="text-destructive"><p>{issue.path}</p><p>{t(migrationIssueMessage(issue.code))}</p><code className="text-xs">{issue.code}</code></div>)}
            {plan.preview.changes.map((change) => {
              const diff = changedLines(change.before, change.after);
              return <section key={change.path} className="grid gap-2">
                <h3 className="break-all font-semibold">{change.path}</h3>
                <h4 className="text-xs font-medium text-muted-foreground">{t("Before")}</h4><pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 text-xs">{diff.before}</pre>
                <h4 className="text-xs font-medium text-muted-foreground">{t("After")}</h4><pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 text-xs">{diff.after}</pre>
              </section>;
            })}
            {plan.preview.rules.length > 0 && plan.preview.decision === "ready" ? <label className="flex items-start gap-2"><Checkbox checked={scopeConfirmed} disabled={busy} onCheckedChange={(value) => setScopeConfirmed(value === true)} />{t("I reviewed the reference scope: this project only, excluding hidden and dependency folders. Links from other projects or chats are not checked.")}</label> : null}
          </div> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{errorSummary(error)}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>{t("Cancel")}</Button>
          {!plan || plan.preview.decision === "blocked" || error ? <Button disabled={busy || !(assignId || cleanupLegacy)} onClick={() => void run(async () => { setScopeConfirmed(false); setPlan(await browserRepository.previewMigration(file.workspaceId, file.id, { assignId, cleanupLegacy, allowPlainMarkdown: file.type === "markdown" })); })}>{t("Preview changes")}</Button> : <Button disabled={busy || plan.preview.decision !== "ready" || (plan.preview.rules.length > 0 && !scopeConfirmed)} onClick={() => void run(async () => {
            await browserRepository.applyMigration(plan);
            setOpen(false); setAssignId(false); setCleanupLegacy(false); reset();
            await queryClient.invalidateQueries();
          })}>{t("Apply reviewed changes")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function migrationIssueMessage(code: string) {
  if (["DELETED_OR_UNKNOWN_ANCHOR", "ANCHOR_UNCERTAIN"].includes(code)) return "A section link cannot be preserved. Keep the section or correct its references first.";
  if (["OUTSIDE_WRITE_SCOPE", "ABSOLUTE_REFERENCE_UNVERIFIED", "INCOMPLETE_REFERENCE_SCOPE"].includes(code)) return "This cleanup needs a wider reference check. Use the document CLI, or select ID assignment only.";
  if (["UNSUPPORTED_FORMAT", "INVALID_FORMAT", "NEEDS_REPAIR"].includes(code)) return "This document format cannot be changed. Review the original Markdown with a supporting tool.";
  return "A document or reference could not be verified. Review the original Markdown before making changes.";
}
