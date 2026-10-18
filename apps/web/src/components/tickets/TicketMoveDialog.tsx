import { useTranslation } from "@/i18n";
import { errorSummary, errorDetails } from "@/i18n/errors";
import { useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  TICKET_PROGRESS_BY_STATUS,
  ticketProgressForStatus,
  type TicketDocumentResponse,
  type TicketItem,
  type TicketStatus,
} from "@alpha-kanban/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TicketStatusFields, type SaveTicketStatus, type TicketStatusDraft, type TicketWriteGuard } from "./TicketStatusFields";

export type TicketMove = { ticket: TicketItem; targetStatus: TicketStatus; guard: TicketWriteGuard };

export function prepareTicketMove(document: TicketDocumentResponse, ticketId: string, targetStatus: TicketStatus): TicketMove | undefined {
  const ticket = document.document.tickets.find((item) => item.id === ticketId);
  if (!ticket || ticket.status === targetStatus) return undefined;
  return {
    ticket,
    targetStatus,
    guard: { expectedHash: document.file.hash, expectedMtimeMs: document.file.mtimeMs },
  };
}

export function TicketMoveDialog({ move, currentHash, currentMtimeMs, onSave, onClose }: {
  move: TicketMove;
  currentHash: string;
  currentMtimeMs: number;
  onSave: SaveTicketStatus;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TicketStatusDraft>({
    status: move.targetStatus,
    progress: ticketProgressForStatus(move.targetStatus, move.ticket.progress),
    reason: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<Error>();
  const stale = currentHash !== move.guard.expectedHash || currentMtimeMs !== move.guard.expectedMtimeMs;
  const changed = draft.status !== move.ticket.status || draft.progress !== move.ticket.progress;
  const canSave = changed && !stale && TICKET_PROGRESS_BY_STATUS[draft.status].includes(draft.progress);
  const unchecked = [...move.ticket.completionCriteriaItems, ...move.ticket.validationItems].filter((item) => item.checked === false);

  async function save() {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(undefined);
    try {
      await onSave(move.ticket.id, draft.status, draft.progress, draft.reason, move.guard);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !savingRef.current) onClose(); }}>
      <DialogContent className="flex w-[min(560px,calc(100vw-2rem))] flex-col gap-0">
        <form className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <DialogHeader className="pr-12">
            <DialogTitle>{t("티켓 상태 변경")}</DialogTitle>
            <DialogDescription className="break-words">{move.ticket.id} · {move.ticket.title}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <p className="text-sm font-medium">{t(move.ticket.status)} <span aria-hidden="true">→</span> {t(draft.status)}</p>
            {stale ? <p className="text-sm text-destructive" role="alert">{t("문서가 변경되었습니다. 취소 후 최신 티켓에서 다시 시도해 주세요.")}</p> : null}
            {error ? <div className="break-words text-sm text-destructive" role="alert">
              <p>{errorSummary(error)}</p>
              <details className="text-xs"><summary>{t("Technical details")}</summary>{errorDetails(error)}</details>
            </div> : null}
            {draft.status === "DONE" && unchecked.length > 0 ? (
              <p className="text-sm text-muted-foreground">{t("{{count}} completion or validation items are unchecked. Changing status will not change these checkboxes.", { count: unchecked.length })}</p>
            ) : null}
            <TicketStatusFields
              currentStatus={move.ticket.status}
              currentProgress={move.ticket.progress}
              draft={draft}
              disabled={isSaving}
              onChange={setDraft}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>{t("취소")}</Button>
            <Button type="submit" disabled={!canSave || isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
              {t("저장하고 이동")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
