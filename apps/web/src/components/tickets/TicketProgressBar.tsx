import type { TicketProgress } from "@alpha-kanban/shared";
import { useTranslation } from "@/i18n";

export function TicketProgressBar({ progress }: { progress: TicketProgress }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        role="progressbar"
        aria-label={t("Progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress}%</span>
    </div>
  );
}
