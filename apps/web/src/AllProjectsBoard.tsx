import {
  boardOrderSchema,
  filesResponseSchema,
  type MarkdownFileSummary,
  type TicketChecklistItem,
  type TicketItem,
  type TicketLogEntry,
  type TicketProgress,
  type TicketStatus,
} from "@alpha-kanban/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  GitBranch,
  Link2,
  Loader2,
  RefreshCcw,
  Square,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  BOARD_STATUSES,
  fetchTicketDocument,
  fetchWorkspaces,
  formatClientError,
  normalizeClientError,
  patchTicket,
  priorityVariant,
  requestJson,
  StatusDot,
} from "./App";
import { buildAppRoute } from "./appRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Every *_tickets.md across all workspaces, merged into one board.
type BoardTicket = TicketItem & {
  file: MarkdownFileSummary;
  group: string;
  groupHue: number;
  href: string;
  key: string;
  project: string;
  workspaceId: string;
};

type PendingDone = { open: TicketChecklistItem[]; order?: string[]; ticket: BoardTicket };
type DropTarget = { after: boolean; key: string };

const allTicketsKey = ["all-tickets"] as const;
const boardOrderKey = ["board-order"] as const;
const REFRESH_INTERVAL_MS = 15_000; // file-change SSE is per workspace, so the merged view polls

async function fetchAllTickets(): Promise<BoardTicket[]> {
  const { workspaces } = await fetchWorkspaces();
  const available = workspaces.filter((workspace) => workspace.isAvailable);
  const base = commonParent(available.map((workspace) => workspace.root));
  const listed = await Promise.all(
    available.map(async (workspace) => ({
      files: (
        await requestJson(`/api/workspaces/${workspace.id}/files`, filesResponseSchema)
      ).files.filter((file) => file.type === "tickets"),
      workspace,
    })),
  );

  // Nested workspaces (repo and repo/docs) list the same file twice; keep the first.
  const seen = new Set<string>();
  const jobs = listed.flatMap(({ files, workspace }) =>
    files
      .filter((file) => !seen.has(file.absolutePath) && seen.add(file.absolutePath))
      .map((file) => ({ file, workspace })),
  );
  const documents = await Promise.all(
    jobs.map(async ({ file, workspace }) => ({
      response: await fetchTicketDocument(workspace.id, file.id),
      workspace,
    })),
  );

  const tickets = documents.flatMap(({ response, workspace }) => {
    const project = workspace.root.slice(base.length).replace(/^[\\/]+/, "") || workspace.label;
    return response.document.tickets.map((ticket) => ({
      ...ticket,
      file: response.file,
      group: project.split(/[\\/]/)[0] ?? project,
      groupHue: 0,
      href: buildAppRoute({
        filePath: response.file.relativePath,
        ticketId: ticket.id,
        workspaceId: workspace.id,
      }),
      key: `${response.file.absolutePath}#${ticket.id}`, // stable across restarts; saved in board order
      project,
      workspaceId: workspace.id,
    }));
  });
  // Golden-angle hues over the sorted project list keep neighbouring projects visually distinct.
  const groups = [...new Set(tickets.map((ticket) => ticket.group))].sort();
  return tickets.map((ticket) => ({
    ...ticket,
    groupHue: (groups.indexOf(ticket.group) * 137.5 + 25) % 360,
  }));
}

// Shared parent directory of all roots, so labels read "inmeat/inmeat-web" instead of absolute paths.
function commonParent(roots: string[]): string {
  if (roots.length === 0) {
    return "";
  }
  const split = roots.map((root) => root.split(/[\\/]/));
  const first = split[0] ?? [];
  let length = Math.min(...split.map((parts) => parts.length));
  while (length > 0 && split.some((parts) => parts[length - 1] !== first[length - 1])) {
    length -= 1;
  }
  if (split.some((parts) => parts.length === length)) {
    length -= 1; // a root equal to the prefix would get an empty label
  }
  return first.slice(0, Math.max(length, 0)).join("/");
}

// Ledger rule: each status allows specific progress values; keep the current one when allowed.
function progressFor(status: TicketStatus, current: TicketProgress): TicketProgress {
  if (status === "TODO") return 0;
  if (status === "READY") return 25;
  if (status === "DONE") return 100;
  if (status === "IN_PROGRESS") return current === 75 ? 75 : 50;
  return current === 100 ? 75 : current; // BLOCKED / DEFERRED keep the last progress
}

// Field lines without "Repository:"-style label lines, backticks, or bold markers.
function fieldLines(items: (string | TicketChecklistItem | TicketLogEntry)[]) {
  return items
    .map((item) =>
      typeof item === "string"
        ? { text: item }
        : "date" in item
          ? { date: item.date, text: item.text }
          : { checked: item.checked, text: item.text },
    )
    .map((line) => ({ ...line, text: line.text.replace(/`|\*\*/g, "").trim() }))
    .filter((line) => line.text && !/^[^\s]+( on)?:$/.test(line.text));
}

export function AllProjectsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const ticketsQuery = useQuery({
    queryFn: fetchAllTickets,
    queryKey: allTicketsKey,
    refetchInterval: draggingKey ? false : REFRESH_INTERVAL_MS,
  });
  const boardOrderQuery = useQuery({
    queryFn: () => requestJson("/api/board-order", boardOrderSchema),
    queryKey: boardOrderKey,
  });
  // Saved order first; tickets not in it yet keep their file order after the saved ones.
  const tickets = useMemo(() => {
    const rank = new Map(boardOrderQuery.data?.keys.map((key, index) => [key, index]));
    return [...(ticketsQuery.data ?? [])].sort(
      (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity),
    );
  }, [boardOrderQuery.data, ticketsQuery.data]);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TicketStatus | null>(null);
  const [pendingDone, setPendingDone] = useState<PendingDone | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveQueue = useRef(Promise.resolve());

  const groups = useMemo(() => {
    const counts = new Map<string, { count: number; hue: number }>();
    for (const ticket of tickets) {
      const current = counts.get(ticket.group);
      counts.set(ticket.group, { count: (current?.count ?? 0) + 1, hue: ticket.groupHue });
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [tickets]);
  const visible = tickets.filter(
    (ticket) => pickedGroups.size === 0 || pickedGroups.has(ticket.group),
  );
  const statuses = BOARD_STATUSES.filter((status) => !(hideDone && status === "DONE"));
  const openTicket = tickets.find((ticket) => ticket.key === openKey);

  function toggleGroup(group: string) {
    setPickedGroups((current) => {
      const next = new Set(current);
      if (!next.delete(group)) {
        next.add(group);
      }
      return next;
    });
  }

  function handleDrop(key: string, status: TicketStatus, target: DropTarget | null) {
    const order =
      target && target.key !== key
        ? (() => {
            const keys = tickets.map((item) => item.key).filter((item) => item !== key);
            keys.splice(keys.indexOf(target.key) + (target.after ? 1 : 0), 0, key);
            return keys;
          })()
        : undefined;
    requestMove(key, status, order);
  }

  function requestMove(key: string, status: TicketStatus, order?: string[]) {
    const ticket = tickets.find((item) => item.key === key);
    if (!ticket) {
      return;
    }
    if (ticket.status === status) {
      if (order) {
        saveOrder(order);
      }
      return;
    }
    if (status === "DONE") {
      const open = [...ticket.completionCriteriaItems, ...ticket.validationItems].filter(
        (item) => item.checked === false,
      );
      if (open.length > 0) {
        setPendingDone({ open, order, ticket });
        return;
      }
    }
    if (order) {
      saveOrder(order);
    }
    enqueueMove(key, status);
  }

  function saveOrder(keys: string[]) {
    queryClient.setQueryData(boardOrderKey, { keys });
    requestJson("/api/board-order", boardOrderSchema, {
      body: JSON.stringify({ keys }),
      method: "PUT",
    }).catch((error: unknown) => {
      setMoveError(`Saving card order failed: ${formatClientError(normalizeClientError(error))}`);
      void queryClient.invalidateQueries({ queryKey: boardOrderKey });
    });
  }

  function endDrag() {
    setDraggingKey(null);
    setOverStatus(null);
    setDropTarget(null);
  }

  // One move at a time: each PATCH needs the file hash produced by the previous save (else STALE_FILE).
  function enqueueMove(key: string, status: TicketStatus) {
    queryClient.setQueryData<BoardTicket[]>(allTicketsKey, (current) =>
      current?.map((item) => (item.key === key ? { ...item, status } : item)),
    );
    moveQueue.current = moveQueue.current.then(async () => {
      const ticket = queryClient
        .getQueryData<BoardTicket[]>(allTicketsKey)
        ?.find((item) => item.key === key);
      if (ticket) {
        try {
          await patchTicket(ticket.workspaceId, ticket.file.id, ticket.id, {
            expectedHash: ticket.file.hash,
            expectedMtimeMs: ticket.file.mtimeMs,
            progress: progressFor(status, ticket.progress),
            status,
          });
        } catch (error) {
          setMoveError(
            `${ticket.project} ${ticket.id}: ${formatClientError(normalizeClientError(error))}`,
          );
        }
      }
      await queryClient.refetchQueries({ queryKey: allTicketsKey });
    });
  }

  return (
    <div className="grid h-dvh min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-secondary)]">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-4 py-2">
        <Button onClick={() => navigate({ to: "/" })} size="sm" variant="ghost">
          <ArrowLeft aria-hidden="true" />
          Workspaces
        </Button>
        <h1 className="ak-title text-sm">All tickets</h1>
        <div className="ml-auto flex items-center gap-2">
          {ticketsQuery.data ? (
            <span className="ak-body-muted text-xs tabular-nums">
              {visible.length} tickets · Updated{" "}
              {new Date(ticketsQuery.dataUpdatedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <Button
            aria-label="Refresh"
            disabled={ticketsQuery.isFetching}
            onClick={() => void ticketsQuery.refetch()}
            size="iconSm"
            variant="ghost"
          >
            <RefreshCcw
              aria-hidden="true"
              className={cn(ticketsQuery.isFetching && "animate-spin")}
            />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-4 py-2">
        <Button
          aria-pressed={pickedGroups.size === 0}
          onClick={() => setPickedGroups(new Set())}
          size="xs"
          variant={pickedGroups.size === 0 ? "secondary" : "ghost"}
        >
          All projects
        </Button>
        {groups.map(([group, { count, hue }]) => (
          <Button
            aria-pressed={pickedGroups.has(group)}
            key={group}
            onClick={() => toggleGroup(group)}
            size="xs"
            variant={pickedGroups.has(group) ? "secondary" : "ghost"}
          >
            <ProjectDot hue={hue} />
            {group}
            <span className="tabular-nums text-[var(--ak-ink-faint)]">{count}</span>
          </Button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-[var(--ak-ink-muted)]">
          <Checkbox
            checked={hideDone}
            onCheckedChange={(checked) => setHideDone(checked === true)}
          />
          Hide DONE
        </label>
      </div>

      <main className="ak-scroll-area min-h-0 overflow-auto p-4">
        {moveError ? (
          <div className="mb-3 flex items-start gap-2 rounded-[var(--ak-radius-md)] border border-destructive/30 bg-[var(--ak-danger-soft)] px-3 py-2 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{moveError}</span>
            <Button
              aria-label="Dismiss"
              className="-my-1"
              onClick={() => setMoveError(null)}
              size="iconSm"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {ticketsQuery.isLoading ? (
          <div className="grid h-full place-items-center">
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-[var(--ak-ink-muted)]" />
          </div>
        ) : ticketsQuery.error ? (
          <div className="grid h-full place-items-center text-sm text-destructive">
            {formatClientError(normalizeClientError(ticketsQuery.error))}
          </div>
        ) : (
          <div
            className="grid items-start gap-3"
            style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(240px, 1fr))` }}
          >
            {statuses.map((status) => {
              const columnTickets = visible.filter((ticket) => ticket.status === status);
              return (
                <section
                  className={cn(
                    "ak-panel-muted min-h-[calc(100dvh-10rem)] overflow-hidden transition-shadow",
                    overStatus === status && "ring-2 ring-[var(--ak-primary-ring)]",
                  )}
                  key={status}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setOverStatus(null);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverStatus(status);
                    if (!(event.target as HTMLElement).closest("[data-ticket-key]")) {
                      setDropTarget(null); // empty column area: status change only
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    endDrag();
                    handleDrop(event.dataTransfer.getData("text/ticket-key"), status, dropTarget);
                  }}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot status={status} />
                      <h2 className="ak-muted-label truncate">{status}</h2>
                    </div>
                    <Badge variant="muted">{columnTickets.length}</Badge>
                  </header>
                  <div className="grid gap-2 p-2">
                    {columnTickets.length === 0 ? (
                      <div className="rounded-[var(--ak-radius-md)] border border-dashed border-[var(--ak-hairline)] px-3 py-8 text-center text-xs text-[var(--ak-ink-muted)]">
                        Empty
                      </div>
                    ) : null}
                    {columnTickets.map((ticket) => (
                      <BoardCard
                        dropPosition={
                          dropTarget?.key === ticket.key && draggingKey !== ticket.key
                            ? dropTarget.after
                              ? "after"
                              : "before"
                            : null
                        }
                        key={ticket.key}
                        onDragEnd={endDrag}
                        onDragOverCard={(after) => setDropTarget({ after, key: ticket.key })}
                        onDragStart={() => setDraggingKey(ticket.key)}
                        onOpen={() => setOpenKey(ticket.key)}
                        ticket={ticket}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <TicketDetailDialog
        onClose={() => setOpenKey(null)}
        onOpenInWorkspace={(href) => navigate({ href })}
        ticket={openTicket}
      />

      <Dialog open={pendingDone !== null} onOpenChange={(open) => !open && setPendingDone(null)}>
        <DialogContent className="w-[min(480px,calc(100vw-2rem))]">
          <DialogHeader className="pr-12">
            <DialogTitle>Move to DONE?</DialogTitle>
            <DialogDescription>
              {pendingDone?.ticket.id} still has {pendingDone?.open.length} unchecked completion or
              validation items.
            </DialogDescription>
          </DialogHeader>
          <ul className="ak-scroll-area grid max-h-60 gap-1.5 overflow-y-auto px-5 text-sm">
            {pendingDone?.open.map((item) => (
              <li className="flex gap-2" key={`${item.lineStart}`}>
                <Square aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--ak-ink-faint)]" />
                <span className="break-words">{item.text}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setPendingDone(null)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingDone) {
                  if (pendingDone.order) {
                    saveOrder(pendingDone.order);
                  }
                  enqueueMove(pendingDone.ticket.key, "DONE");
                }
                setPendingDone(null);
              }}
            >
              Move to DONE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectDot({ hue }: { hue: number }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ background: `oklch(0.66 0.15 ${hue})` }}
    />
  );
}

function ProjectBadge({ ticket }: { ticket: BoardTicket }) {
  return (
    <Badge className="min-w-0 max-w-full gap-1.5" title={ticket.project} variant="outline">
      <ProjectDot hue={ticket.groupHue} />
      <span className="truncate">{ticket.project}</span>
    </Badge>
  );
}

function BoardCard({
  dropPosition,
  onDragEnd,
  onDragOverCard,
  onDragStart,
  onOpen,
  ticket,
}: {
  dropPosition: "after" | "before" | null;
  onDragEnd: () => void;
  onDragOverCard: (after: boolean) => void;
  onDragStart: () => void;
  onOpen: () => void;
  ticket: BoardTicket;
}) {
  return (
    <a
      className="ak-card ak-focus-ring relative block cursor-grab select-none p-3 text-left transition-colors hover:bg-[var(--ak-surface-hover)] active:cursor-grabbing"
      data-ticket-key={ticket.key}
      draggable
      href={ticket.href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          return; // keep "open in new tab" pointing at the workspace view
        }
        event.preventDefault();
        onOpen();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onDragOverCard(event.clientY > box.top + box.height / 2);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/ticket-key", ticket.key);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
    >
      {dropPosition ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary",
            dropPosition === "before" ? "-top-[5px]" : "-bottom-[5px]",
          )}
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProjectBadge ticket={ticket} />
          <span className="shrink-0 text-[11px] text-[var(--ak-ink-faint)]">{ticket.id}</span>
        </div>
        {ticket.priority ? (
          <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
        ) : null}
      </div>
      <h3 className="mt-2 line-clamp-3 break-words text-sm font-medium leading-5 text-[var(--ak-ink)]">
        {ticket.title}
      </h3>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--ak-ink-muted)]">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${ticket.progress}%` }} />
        </div>
        <span className="tabular-nums">{ticket.progress}%</span>
        {ticket.type ? <span className="truncate">{ticket.type}</span> : null}
      </div>
      {ticket.missingFields.length > 0 ? (
        <Badge className="mt-2 gap-1" variant="warning">
          <AlertCircle aria-hidden="true" className="size-3" />
          {ticket.missingFields.length} missing fields
        </Badge>
      ) : null}
    </a>
  );
}

function TicketDetailDialog({
  onClose,
  onOpenInWorkspace,
  ticket,
}: {
  onClose: () => void;
  onOpenInWorkspace: (href: string) => void;
  ticket?: BoardTicket;
}) {
  const sections: [string, ReturnType<typeof fieldLines>][] = ticket
    ? [
        ["Goal", fieldLines(ticket.goal)],
        ["Current problem", fieldLines(ticket.currentProblem)],
        ["Implementation scope", fieldLines(ticket.implementationScope)],
        ["Out of scope", fieldLines(ticket.outOfScope)],
        [
          "Completion criteria",
          fieldLines(
            ticket.completionCriteriaItems.length > 0
              ? ticket.completionCriteriaItems
              : ticket.completionCriteria,
          ),
        ],
        [
          "Validation",
          fieldLines(ticket.validationItems.length > 0 ? ticket.validationItems : ticket.validation),
        ],
        ["User instructions", fieldLines(ticket.userInstructions)],
        ["Progress notes", fieldLines(ticket.progressNotes)],
      ]
    : [];
  const repositories = ticket ? fieldLines(ticket.repository) : [];
  const dependencies = ticket ? fieldLines(ticket.dependsOn) : [];

  return (
    <Dialog open={ticket !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] gap-0">
        {ticket ? (
          <>
            <DialogHeader className="border-b border-border pb-4 pr-14">
              <div className="flex flex-wrap items-center gap-1.5">
                <ProjectBadge ticket={ticket} />
                <Badge variant="outline">{ticket.id}</Badge>
                <Badge className="gap-1.5" variant="muted">
                  <StatusDot status={ticket.status} />
                  {ticket.status}
                </Badge>
                {ticket.priority ? (
                  <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
                ) : null}
                {ticket.type ? <Badge variant="muted">{ticket.type}</Badge> : null}
              </div>
              <DialogTitle className="text-lg leading-7">{ticket.title}</DialogTitle>
              <DialogDescription className="break-all text-xs">
                {ticket.progress}% · {ticket.file.workspaceRelativePath}
                {ticket.completedAt ? ` · Completed ${ticket.completedAt}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="ak-scroll-area grid min-h-0 content-start gap-5 overflow-y-auto px-5 py-4">
              {repositories.length > 0 || dependencies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {repositories.map((line) => (
                    <Badge className="gap-1" key={`repo-${line.text}`} variant="muted">
                      <GitBranch aria-hidden="true" className="size-3" />
                      {line.text}
                    </Badge>
                  ))}
                  {dependencies.map((line) => (
                    <Badge className="gap-1" key={`dep-${line.text}`} variant="outline">
                      <Link2 aria-hidden="true" className="size-3" />
                      {line.text}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {ticket.missingFields.length > 0 ? (
                <div className="flex items-start gap-2 rounded-[var(--ak-radius-md)] bg-[var(--ak-warning-soft)] px-3 py-2 text-sm text-[var(--ak-warning)]">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Missing fields: {ticket.missingFields.join(", ")}
                </div>
              ) : null}

              {sections
                .filter(([, lines]) => lines.length > 0)
                .map(([name, lines]) => (
                  <section className="grid gap-2" key={name}>
                    <h4 className="ak-muted-label">{name}</h4>
                    <ul className="grid gap-1.5 text-sm leading-6 text-[var(--ak-ink-secondary)]">
                      {lines.map((line, index) => (
                        <li className="flex gap-2" key={index}>
                          {"checked" in line && line.checked !== null ? (
                            line.checked ? (
                              <Check aria-label="Done" className="mt-1 size-4 shrink-0 text-[var(--ak-success)]" />
                            ) : (
                              <Square aria-label="Open" className="mt-1 size-4 shrink-0 text-[var(--ak-ink-faint)]" />
                            )
                          ) : (
                            <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-[var(--ak-ink-faint)]" />
                          )}
                          <span className="min-w-0 whitespace-pre-wrap break-words">
                            {"date" in line ? (
                              <span className="mr-2 tabular-nums text-[var(--ak-ink-faint)]">{line.date}</span>
                            ) : null}
                            {line.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>

            <DialogFooter>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
              <Button onClick={() => onOpenInWorkspace(ticket.href)}>
                <ExternalLink aria-hidden="true" />
                Open in workspace
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
