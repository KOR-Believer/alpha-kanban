import { useTranslation } from "@/i18n";
import { useId } from "react";
import {
  TICKET_PROGRESS_BY_STATUS,
  ticketChangeDefaultReason,
  ticketProgressForStatus,
  type TicketProgress,
  type TicketStatus,
} from "@alpha-kanban/shared";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type TicketStatusDraft = { status: TicketStatus; progress: TicketProgress; reason: string };
export type TicketWriteGuard = { expectedHash: string; expectedMtimeMs: number };
export type SaveTicketStatus = (
  ticketId: string,
  status: TicketStatus,
  progress: TicketProgress,
  reason: string,
  guard?: TicketWriteGuard,
) => Promise<void>;

export function TicketStatusFields({
  currentStatus,
  currentProgress,
  draft,
  disabled,
  onChange,
}: {
  currentStatus: TicketStatus;
  currentProgress: TicketProgress;
  draft: TicketStatusDraft;
  disabled?: boolean;
  onChange: (draft: TicketStatusDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const changed = draft.status !== currentStatus || draft.progress !== currentProgress;
  const allowed = TICKET_PROGRESS_BY_STATUS[draft.status];
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
        <div className="grid gap-1 text-xs font-medium text-muted-foreground">
          <label htmlFor={`${id}-status`}>{t("Status")}</label>
          <Select
            disabled={disabled}
            value={draft.status}
            onValueChange={(value) => {
              const status = value as TicketStatus;
              onChange({ ...draft, status, progress: ticketProgressForStatus(status, draft.progress) });
            }}
          >
            <SelectTrigger id={`${id}-status`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["TODO", "READY", "IN_PROGRESS", "BLOCKED", "DONE", "DEFERRED"] as const).map((status) => (
                <SelectItem key={status} value={status}>{t(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1 text-xs font-medium text-muted-foreground">
          <label htmlFor={`${id}-progress`}>{t("Progress")}</label>
          <Select
            disabled={disabled}
            value={String(draft.progress)}
            onValueChange={(value) => onChange({ ...draft, progress: Number(value) as TicketProgress })}
          >
            <SelectTrigger id={`${id}-progress`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {!allowed.includes(draft.progress) ? (
                <SelectItem disabled value={String(draft.progress)}>{t("{{progress}}% (current)", { progress: draft.progress })}</SelectItem>
              ) : null}
              {allowed.map((progress) => (
                <SelectItem key={progress} value={String(progress)}>{progress}%</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {changed ? (
        <div className="grid gap-2 text-xs text-muted-foreground">
          <label htmlFor={`${id}-reason`} className="font-medium">{t("변경 사유")}</label>
          <Textarea
            id={`${id}-reason`}
            disabled={disabled}
            maxLength={4_000}
            onChange={(event) => onChange({ ...draft, reason: event.target.value })}
            placeholder={ticketChangeDefaultReason(currentStatus, draft.status)}
            aria-describedby={`${id}-hint`}
            rows={3}
            value={draft.reason}
          />
          <p id={`${id}-hint`}>{t("미입력 시 위 문구로 기록됩니다.")}</p>
        </div>
      ) : null}
    </div>
  );
}
