import type { DragEvent, ReactNode } from "react";
import type { MarkdownFileSummary, TicketItem, TicketStatus } from "@alpha-kanban/shared";
import { useTranslation } from "../../i18n";
import { DocumentOwnerBadge } from "../DocumentOwner";
import { NavigationLink } from "../NavigationLink";
import { Badge } from "../ui/badge";
import { SearchHighlight, TicketSearchExcerpt } from "./TicketSearch";
import { VirtualTicketList } from "./VirtualTicketList";
import { TicketProgressBar } from "./TicketProgressBar";

export const BOARD_STATUSES: TicketStatus[] = [
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
];

export function groupBoardTickets(tickets: TicketItem[]) {
  const grouped = new Map<TicketStatus, TicketItem[]>(
    BOARD_STATUSES.map((status) => [status, []]),
  );

  for (const ticket of tickets) {
    grouped.get(ticket.status)?.push(ticket);
  }

  const doneTickets = grouped.get("DONE") ?? [];
  if (doneTickets.length > 1 && doneTickets.every((ticket) => isValidTimestamp(ticket.completedAt))) {
    doneTickets.sort(
      (left, right) =>
        Date.parse(right.completedAt ?? "") - Date.parse(left.completedAt ?? ""),
    );
  }

  return grouped;
}

function isValidTimestamp(value: string | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

export function TicketBoardGrid({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <div className="ak-project-board ak-kanban-grid grid min-w-[900px] grid-cols-6 gap-3" aria-label={t("Ticket kanban board")}>{children}</div>;
}

export function KanbanColumn({
  file,
  ticketHref,
  searchQuery = "",
  draggedKey,
  onTicketSelect,
  status,
  tickets,
  dragDisabled = true,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  file: Pick<MarkdownFileSummary, "relativePath" | "documentRoot">;
  ticketHref: (ticketId: string) => string;
  searchQuery?: string;
  draggedKey?: string;
  onTicketSelect: (ticketId: string) => void;
  status: TicketStatus;
  tickets: TicketItem[];
  dragDisabled?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, ticketId: string) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={`ak-kanban-column ak-panel-muted ${isDragOver ? "ring-2 ring-inset ring-primary" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={t("{{status}} tickets", { status: t(status) })}
    >
      <header data-tour="board-status" className="ak-kanban-header flex items-center justify-between gap-2 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <h3 className="ak-muted-label truncate">{t(status)}</h3>
        </div>
        <Badge variant="muted">{tickets.length}</Badge>
      </header>
      <div className="grid gap-2 p-2">
        {tickets.length === 0 ? (
          <div className="rounded-[var(--ak-radius-md)] border border-dashed border-[var(--ak-hairline)] px-3 py-8 text-center text-xs text-[var(--ak-ink-muted)]">
            {t("Empty")}
          </div>
        ) : null}
        <VirtualTicketList items={tickets} itemKey={(ticket) => ticket.id} pinnedKey={draggedKey}>{(ticket) => (
          <TicketCard
            key={ticket.id}
            file={file}
            href={ticketHref(ticket.id)}
            onSelect={() => onTicketSelect(ticket.id)}
            ticket={ticket}
            searchQuery={searchQuery}
            draggable={!dragDisabled}
            onDragStart={onDragStart && (event => onDragStart(event, ticket.id))}
            onDragEnd={onDragEnd}
          />
        )}</VirtualTicketList>
      </div>
    </section>
  );
}

function TicketCard({
  searchQuery = "",
  file,
  href,
  onSelect,
  ticket,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  file: Pick<MarkdownFileSummary, "relativePath" | "documentRoot">;
  href: string;
  onSelect: () => void;
  searchQuery?: string;
  ticket: TicketItem;
  draggable: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      data-ticket-key={ticket.id}
      data-tour="board-card"
      className="ak-card transition-colors hover:border-border hover:bg-muted"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <NavigationLink href={href}
        data-ticket-open
        aria-label={t("Open {{id}}", { id: ticket.id })}
        draggable={draggable ? undefined : false}
        className={`block w-full p-3 text-left ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
        onNavigate={onSelect}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <Badge variant="outline">{ticket.id}</Badge>
            <DocumentOwnerBadge file={file} />
          </div>
          <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
        </div>
        <h4 className="mt-2 line-clamp-3 break-words text-sm font-medium leading-5 text-[var(--ak-ink)]">
          <SearchHighlight text={ticket.title} query={searchQuery} />
        </h4>
        <TicketSearchExcerpt ticket={ticket} query={searchQuery} />
        <div className="ak-body-muted mt-3 grid gap-1.5 text-xs">
          <TicketProgressBar progress={ticket.progress} />
          <PropertyRow
            label={t("Repo")}
            value={ticket.repository.length > 0 ? ticket.repository.join(", ") : "-"}
          />
          <PropertyRow
            label={t("Depends")}
            value={ticket.dependsOn.length > 0 ? ticket.dependsOn.join(", ") : "-"}
          />
        </div>
      </NavigationLink>
    </article>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[62px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--ak-ink-faint)]">{label}</span>
      <span className="truncate text-[var(--ak-ink-muted)]" title={value}>
        {value}
      </span>
    </div>
  );
}

export function StatusDot({ status }: { status: TicketStatus }) {
  const className = {
    BLOCKED: "bg-red-500",
    DEFERRED: "bg-neutral-400",
    DONE: "bg-emerald-500",
    IN_PROGRESS: "bg-blue-500",
    READY: "bg-amber-500",
    TODO: "bg-neutral-400",
  }[status];

  return <span className={`size-2 rounded-full ${className}`} aria-hidden="true" />;
}

export function priorityVariant(priority: string) {
  if (priority === "P0") {
    return "warning";
  }
  if (priority === "P1") {
    return "default";
  }
  return "muted";
}
