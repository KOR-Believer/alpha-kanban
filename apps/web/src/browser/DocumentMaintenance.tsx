import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { isDocumentAssetPath } from "@alpha-kanban/shared/documents";
import { DocumentMaintenanceView } from "../components/DocumentMaintenanceView";
import { errorSummary } from "../i18n/errors";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserRepository, type BrowserMigration } from "./repository";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";

export function DocumentMaintenance({ file }: { file: MarkdownFileSummary }) {
  if (isDocumentAssetPath(file.workspaceRelativePath, file.documentRoot)) return null;
  return <DocumentMaintenanceForFile key={`${file.workspaceId}:${file.id}`} file={file} />;
}

function DocumentMaintenanceForFile({ file }: { file: MarkdownFileSummary }) {
  const queryClient = useQueryClient();
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
  return <DocumentMaintenanceView open={open} path={file.relativePath} preview={plan?.preview}
    contentRef={tourContainer} headerAction={<TourButton tour={tour} labelKey="Tour this dialog" />} lockDismiss={tour.active}
    busy={busy} error={error && errorSummary(error)} onPreview={preview} onApply={apply} close={close} />;
}
export { migrationIssueMessage } from "../components/DocumentMaintenanceView";
