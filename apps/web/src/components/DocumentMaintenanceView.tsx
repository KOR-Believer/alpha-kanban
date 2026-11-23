import type { ComponentProps, ReactNode } from "react";
import type { MigrationPreview } from "@alpha-kanban/shared/documentMigration";
import { FileCog, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { CodeDiff } from "./CodeDiff";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { useTranslation } from "../i18n";

export function DocumentMaintenanceView({ open, path, preview, busy, error, contentRef, headerAction, lockDismiss, onPreview, onApply, close }: {
  open: boolean; path: string; preview?: MigrationPreview; busy?: "preview" | "apply"; error?: string;
  contentRef?: ComponentProps<typeof DialogContent>["ref"]; headerAction?: ReactNode; lockDismiss?: boolean;
  onPreview: () => void; onApply: () => void; close: () => void;
}) {
  const { t } = useTranslation();
  return <>
    <Button data-tour="document-maintenance" size="sm" variant="outline" onClick={() => onPreview()}><FileCog />{t("Document maintenance")}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent ref={contentRef} className="grid-rows-[auto_minmax(0,1fr)_auto]" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy === "apply" || lockDismiss) event.preventDefault(); }}>
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle>{t("Document maintenance")}</DialogTitle>{headerAction}</div>
          <DialogDescription data-tour="maintenance-purpose">{t("Keep documents you continue to use aligned with the current document format. Review the changes, then apply them to save only this document. Maintenance is optional; existing documents remain readable.")}</DialogDescription>
          <p className="break-all text-xs text-muted-foreground">{path}</p>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("Available changes include missing document IDs, folder-based Owner correction, and removal of obsolete guidance and templates.")}</p>
          {busy === "preview" ? <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("Preparing document preview…")}</p> : null}
          {preview ? <div className="grid gap-3 text-sm" aria-live="polite">
            <div className="grid gap-3" data-tour={preview.retained.length || preview.issues.length || preview.decision === "noop" ? "maintenance-result" : undefined}>
            {preview.decision === "noop" ? <p>{t("No document changes are needed.")}</p> : null}
            {preview.retained.map((item, index) => <p key={index}>{t(item.code === "OWNER_PATH_UNRESOLVED" ? "Owner is kept because the document has no confirmed owner folder." : item.code === "LEGACY_REFERENCED_SECTION" ? "{{section}} will be kept to preserve an existing link." : item.code === "LEGACY_NOTES_PRESERVED" ? "Additional content in {{section}} will be kept." : "No recognized legacy content was found in {{section}}. This section will be kept.", { section: item.section })}</p>)}
            {preview.issues.map((issue, index) => <div key={index} className="text-destructive"><p>{issue.path}</p><p>{t(migrationIssueMessage(issue.code))}</p><code className="text-xs">{issue.code}</code></div>)}
            </div>
            {preview.changes.map((change) => <section data-tour="maintenance-diff" key={change.path} className="grid min-w-0 gap-2">
                <h3 className="break-all font-semibold">{change.path}</h3>
                <CodeDiff before={change.before} after={change.after} />
              </section>)}
            {preview.rules.length > 0 ? <p className="text-xs text-muted-foreground">{t("Only links affected by this cleanup are checked within the connected project. Other documents are not changed.")}</p> : null}
          </div> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy === "apply"} onClick={close}>{t("Cancel")}</Button>
          {error || preview?.decision === "blocked" ? <Button variant="outline" disabled={Boolean(busy)} onClick={() => onPreview()}>{t("Refresh preview")}</Button> : null}
          <Button data-tour="maintenance-apply" disabled={Boolean(busy) || preview?.decision !== "ready" || Boolean(error)} onClick={() => onApply()}>{t("Apply reviewed changes")}</Button>
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
