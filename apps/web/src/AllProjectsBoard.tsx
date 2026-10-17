import { IS_BROWSER_LOCAL } from "./storageMode";
import { browserRepository } from "./browser/repository";
import { BrowserFilesMenu } from "./browser/BrowserConnections";
import { documentIdentity, documentRouteId } from "./appRoute";
import { useTranslation } from "@/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { buildAppRoute, type TicketDetailMode } from "./appRoute";
import {
  boardOrderSchema, filesResponseSchema,
  type MarkdownFileChangeEvent, type TicketDocumentResponse, type TicketInstructionKind,
  type TicketProgress, type TicketStatus,
} from "@alpha-kanban/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Folder, Loader2, RefreshCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BOARD_STATUSES, TicketDetailDrawer, appendTicketInstruction, fetchTicketDocument,
  fetchWorkspaces, formatClientError, normalizeClientError, patchTicket, priorityVariant, requestJson, StatusDot,
} from "./App";
import {
  BOARD_FILTERS_KEY, boardTickets, filterBoardTickets, loadBoard, readBoardFilters, reorderedKeys,
  type BoardData, type BoardDocument, type BoardTicket, type BoardLoadOptions, type BoardLoadProgress,
} from "./allProjectsData";
import { TicketMoveDialog, prepareTicketMove, type TicketMove } from "./components/tickets/TicketMoveDialog";
import type { TicketWriteGuard } from "./components/tickets/TicketStatusFields";
import { useTicketDetailPresentation } from "./components/tickets/useTicketDetailPresentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const allTicketsKey = ["all-tickets"] as const;
const boardOrderKey = ["board-order"] as const;
type DropTarget = { after: boolean; key: string };
type PendingMove = { move: TicketMove; document: BoardDocument; order?: string[] };
type Detail = { document: BoardDocument; ticketId: string };

const fetchAllTickets = (options: BoardLoadOptions) => loadBoard({
  workspaces: fetchWorkspaces,
  files: async (id) => IS_BROWSER_LOCAL ? { files: await browserRepository.ticketFiles(id) } : requestJson(`/api/workspaces/${id}/files`, filesResponseSchema),
  document: (workspaceId, fileId) => IS_BROWSER_LOCAL ? browserRepository.tickets(workspaceId, fileId, false) : fetchTicketDocument(workspaceId, fileId),
}, options);
const errorText = (error: unknown) => formatClientError(normalizeClientError(error));

export function AllProjectsBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [overStatus, setOverStatus] = useState<TicketStatus | null>(null);
  const [filters, setFilters] = useState(readBoardFilters);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [moveError, setMoveError] = useState<{ message: string; error: unknown; retryOrder?: string[] } | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [loadProgress, setLoadProgress] = useState<BoardLoadProgress>();
  const [manualRefresh, setManualRefresh] = useState(false);
  const writingRef = useRef(false);
  const presentation = useTicketDetailPresentation();
  const ticketsQuery = useQuery({
    queryFn: ({ signal }) => fetchAllTickets({ signal, onProgress: setLoadProgress }), queryKey: allTicketsKey,
    refetchInterval: draggingKey || isWriting ? false : 15_000,
  });
  const boardOrderQuery = useQuery({
    queryFn: () => IS_BROWSER_LOCAL ? browserRepository.boardOrder() : requestJson("/api/board-order", boardOrderSchema), queryKey: boardOrderKey,
  });
  const boardData = ticketsQuery.data ?? loadProgress?.data;
  const tickets = useMemo(() => {
    const rank = new Map(boardOrderQuery.data?.keys.map((key, index) => [key, index]));
    return boardTickets(boardData).sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
  }, [boardOrderQuery.data, boardData]);
  const groups = useMemo(() => {
    const counts = new Map<string, { count: number; label: string; root: string }>();
    for (const ticket of tickets) {
      counts.set(ticket.projectId, { count: (counts.get(ticket.projectId)?.count ?? 0) + 1, label: ticket.projectLabel, root: ticket.projectRoot });
    }
    return [...counts].sort(([, a], [, b]) => a.label.localeCompare(b.label) || a.root.localeCompare(b.root));
  }, [tickets]);
  const visible = filterBoardTickets(tickets, filters);
  const statuses = BOARD_STATUSES.filter((status) => !(filters.hideDone && status === "DONE"));
  const detailTicket = detail?.document.response.document.tickets.find((ticket) => ticket.id === detail.ticketId);
  const currentDetail = detail ? currentDocument(detail.document) : undefined;
  const currentMove = pendingMove ? currentDocument(pendingMove.document) : undefined;
  const detailChanged = detail && (!currentDetail || currentDetail.response.file.hash !== detail.document.response.file.hash ||
    currentDetail.response.file.mtimeMs !== detail.document.response.file.mtimeMs);
  const externalChange: MarkdownFileChangeEvent | undefined = detailChanged ? {
    eventType: currentDetail ? "changed" : "removed", workspaceId: detail.document.workspace.id,
    fileId: detail.document.response.file.id, relativePath: detail.document.response.file.relativePath,
    workspaceRelativePath: detail.document.response.file.workspaceRelativePath, absolutePath: detail.document.response.file.absolutePath,
    observedAt: new Date(ticketsQuery.dataUpdatedAt || Date.now()).toISOString(), file: currentDetail?.response.file,
  } : undefined;
  const canDrag = !ticketsQuery.isLoading && !isWriting && !pendingMove && !detail && Boolean(boardOrderQuery.data);

  useEffect(() => {
    try { window.localStorage.setItem(BOARD_FILTERS_KEY, JSON.stringify(filters)); } catch { /* Session-only filters. */ }
  }, [filters]);

  function currentDocument(document: BoardDocument) {
    return boardData?.documents.find((item) => documentIdentity(item.response.file) === documentIdentity(document.response.file) &&
      item.workspace.id === document.workspace.id);
  }
  function documentFor(ticket: BoardTicket) {
    return boardData?.documents.find((item) => documentIdentity(item.response.file) === documentIdentity(ticket.file) && item.workspace.id === ticket.workspaceId);
  }
  function replaceDocument(document: BoardDocument, response: TicketDocumentResponse) {
    const next = { ...document, response };
    queryClient.setQueryData(["ticket-document", document.workspace.id, response.file.id], response);
    void queryClient.invalidateQueries({ queryKey: ["document-sets", document.workspace.id] });
    queryClient.setQueryData<BoardData>(allTicketsKey, (data) => {
      data ??= boardData;
      if (!data) return { documents: [next], issues: [] };
      const remaining = data.documents.filter((item) => documentIdentity(item.response.file) !== documentIdentity(response.file));
      return { ...data, documents: [...remaining, next] };
    });
    setDetail((value) => value && documentIdentity(value.document.response.file) === documentIdentity(response.file) ? { ...value, document: next } : value);
    return next;
  }
  async function reloadDetail() {
    if (!detail) return;
    const { workspace, response } = detail.document;
    replaceDocument(detail.document, await fetchTicketDocument(workspace.id, response.file.id));
  }
  async function withWrite(action: () => Promise<void>) {
    if (writingRef.current) throw new Error("Another save is in progress.");
    writingRef.current = true;
    setIsWriting(true);
    try {
      await queryClient.cancelQueries({ queryKey: allTicketsKey });
      await queryClient.cancelQueries({ queryKey: boardOrderKey });
      await action();
    } finally {
      writingRef.current = false;
      setIsWriting(false);
    }
  }
  async function persistOrder(keys: string[]) {
    const previous = queryClient.getQueryData<{ keys: string[] }>(boardOrderKey) ?? { keys: [] };
    queryClient.setQueryData(boardOrderKey, { keys });
    try {
      const saved = IS_BROWSER_LOCAL ? await browserRepository.saveBoardOrder({ keys }, previous) : await requestJson("/api/board-order", boardOrderSchema, { body: JSON.stringify({ keys }), method: "PUT" });
      queryClient.setQueryData(boardOrderKey, saved);
    } catch (error) {
      queryClient.setQueryData(boardOrderKey, previous);
      void queryClient.invalidateQueries({ queryKey: boardOrderKey });
      throw error;
    }
  }
  async function saveOrder(keys: string[]) {
    setMoveError(null);
    try { await withWrite(() => persistOrder(keys)); }
    catch (error) { setMoveError({ message: "Could not save card order: {{error}}", error, retryOrder: keys }); }
  }
  async function saveStatus(document: BoardDocument, ticketId: string, status: TicketStatus, progress: TicketProgress, reason: string, guard?: TicketWriteGuard, order?: string[]) {
    setMoveError(null);
    await withWrite(async () => {
      const response = await patchTicket(document.workspace.id, document.response.file.id, ticketId, {
        expectedHash: document.response.file.hash, expectedMtimeMs: document.response.file.mtimeMs,
        ...guard, status, progress, reason,
      });
      replaceDocument(document, response);
      if (order) {
        try { await persistOrder(order); }
        catch (error) { setMoveError({ message: "Status and reason were saved, but card order was not: {{error}}", error, retryOrder: order }); }
      }
    });
  }
  async function appendInstruction(ticketId: string, kind: TicketInstructionKind, text: string) {
    if (!detail) return;
    const document = detail.document;
    await withWrite(async () => {
      const response = await appendTicketInstruction(document.workspace.id, document.response.file.id, ticketId, {
        kind, text, expectedHash: document.response.file.hash, expectedMtimeMs: document.response.file.mtimeMs,
      });
      replaceDocument(document, response);
    });
  }
  async function refreshBoard() {
    setManualRefresh(true);
    if (IS_BROWSER_LOCAL) browserRepository.invalidateListings();
    try { await Promise.all([ticketsQuery.refetch(), boardOrderQuery.refetch()]); }
    finally { setManualRefresh(false); }
  }
  function endDrag() { setDraggingKey(null); setOverStatus(null); setDropTarget(null); }
  function handleDrop(key: string, status: TicketStatus, target: DropTarget | null) {
    if (!canDrag || key !== draggingKey) return;
    const ticket = tickets.find((item) => item.key === key);
    if (!ticket) return;
    const order = target && target.key !== key ? reorderedKeys(tickets, key, target.key, target.after, boardOrderQuery.data?.keys ?? []) : undefined;
    if (ticket.status === status) { if (order) void saveOrder(order); return; }
    const document = documentFor(ticket);
    const move = document && prepareTicketMove(document.response, ticket.id, status);
    if (document && move) setPendingMove({ document, move, order });
  }

  return (
    <div className="grid h-dvh min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-[var(--ak-canvas-soft)] text-foreground">
      <header className="ak-all-board-toolbar">
        <Button onClick={() => navigate({ to: "/" })} size="sm" variant="ghost"><ArrowLeft aria-hidden="true" />{t("Workspaces")}</Button>
        <h1 className="ak-title text-sm">{t("All tickets")}</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{t("{{count}} tickets", { count: visible.length })}</span>
          <LanguageSelector />
          {IS_BROWSER_LOCAL ? <BrowserFilesMenu /> : null}
          {isWriting ? <Loader2 aria-label={t("Saving")} className="size-4 animate-spin" /> : null}
          {ticketsQuery.isFetching ? <span role="status" className="text-xs tabular-nums text-muted-foreground">
            {ticketsQuery.isLoading && loadProgress
              ? t("Reading projects {{completed}} / {{total}}", { completed: loadProgress.completedProjects, total: loadProgress.totalProjects })
              : t(manualRefresh ? "Refreshing tickets" : "Checking for changes")}
          </span> : null}
          <Button aria-label={t("Refresh")} title={t("Refresh")} disabled={ticketsQuery.isFetching || isWriting} onClick={() => void refreshBoard()} size="iconSm" variant="ghost">
            <RefreshCcw aria-hidden="true" className={cn(ticketsQuery.isFetching && (ticketsQuery.isLoading || manualRefresh) && "animate-spin")} />
          </Button>
        </div>
      </header>
      <div className="ak-all-board-toolbar min-w-0">
        <div className="ak-scroll-area flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="group" aria-label={t("Project filters")}>
          <Button aria-pressed={!filters.projectIds.length} onClick={() => setFilters({ ...filters, projectIds: [] })} size="xs" variant={!filters.projectIds.length ? "secondary" : "ghost"}>{t("All projects")}</Button>
          {groups.map(([id, group]) => (
            <Button key={id} title={group.root} aria-pressed={filters.projectIds.includes(id)}
              onClick={() => setFilters({ ...filters, projectIds: filters.projectIds.includes(id) ? filters.projectIds.filter((value) => value !== id) : [...filters.projectIds, id] })}
              size="xs" variant={filters.projectIds.includes(id) ? "secondary" : "ghost"}>
              <Folder aria-hidden="true" />
              {groups.filter(([, item]) => item.label === group.label).length > 1 ? group.root : group.label}
              <span className="tabular-nums text-muted-foreground">{group.count}</span>
            </Button>
          ))}
        </div>
        <div className="relative w-52 shrink-0">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("Search tickets")} className="pl-9" placeholder={t("Search tickets")} value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={filters.hideDone} onCheckedChange={(checked) => setFilters({ ...filters, hideDone: checked === true })} />{t("Hide DONE")}
        </label>
      </div>
      <div aria-live="polite">
        {moveError || boardOrderQuery.error || ticketsQuery.error ? (
          <div className="ak-all-board-notice text-destructive" role="alert">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{moveError ? t(moveError.message, { error: errorText(moveError.error) }) : errorText(boardOrderQuery.error ?? ticketsQuery.error)}</span>
            {moveError?.retryOrder ? <Button size="sm" variant="outline" disabled={isWriting} onClick={() => void saveOrder(moveError.retryOrder!)}>{t("Retry card order only")}</Button> : null}
            {moveError ? <Button aria-label={t("Dismiss error")} onClick={() => setMoveError(null)} size="iconSm" variant="ghost"><X aria-hidden="true" /></Button> : null}
          </div>
        ) : null}
        {boardData?.issues.length ? (
          <details className="ak-all-board-notice block text-sm text-muted-foreground">
            <summary className="cursor-pointer">{t("{{count}} documents or projects could not be read. Other tickets are still shown.", { count: boardData.issues.length })}</summary>
            <ul className="ak-scroll-area max-h-28 overflow-auto">{boardData.issues.map((issue) => <li className="break-all" key={issue}>{issue}</li>)}</ul>
          </details>
        ) : null}
      </div>
      <main className="ak-all-board-columns ak-scroll-area">
        {ticketsQuery.isLoading && !boardData?.documents.length ? <div className="grid h-full place-items-center"><Loader2 aria-label={t("Loading tickets")} className="size-6 animate-spin" /></div> : (
          <div className="ak-kanban-grid grid gap-3" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(240px, 1fr))` }}>
            {statuses.map((status) => {
              const columnTickets = visible.filter((ticket) => ticket.status === status);
              return (
            <section key={status} aria-label={t("{{status}} tickets", { status: t(status) })}
                  className={cn("ak-kanban-column ak-panel-muted", overStatus === status && "ring-2 ring-ring")}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStatus(null); }}
                  onDragOver={(event) => {
                    if (!draggingKey || !canDrag) return;
                    event.preventDefault(); setOverStatus(status);
                    if (!(event.target as HTMLElement).closest("[data-ticket-key]")) setDropTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(event.dataTransfer.getData("text/ticket-key"), status, dropTarget);
                    endDrag();
                  }}>
                  <header className="ak-kanban-header flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2"><StatusDot status={status} /><h2 className="ak-muted-label truncate">{t(status)}</h2></div>
                    <Badge variant="muted">{columnTickets.length}</Badge>
                  </header>
                  <div className="ak-all-board-cards">
                      {!columnTickets.length ? <p className="py-8 text-center text-xs text-muted-foreground">{t("Empty")}</p> : null}
                      {columnTickets.map((ticket, index) => (
                        <BoardCard key={ticket.key} ticket={ticket} disabled={!canDrag} detailMode={presentation.mode}
                          dropPosition={draggingKey !== ticket.key && dropTarget?.key === ticket.key ? (dropTarget.after ? "after" : "before") : null}
                          onDragEnd={endDrag} onDragStart={() => setDraggingKey(ticket.key)} onDragOverCard={(after) => setDropTarget({ after, key: ticket.key })}
                          onOpen={() => { const document = documentFor(ticket); if (document) setDetail({ document, ticketId: ticket.id }); }}
                          canMoveUp={index > 0} canMoveDown={index < columnTickets.length - 1}
                          onReorder={(delta) => {
                            const target = columnTickets[index + delta];
                            if (!target) return;
                            const keys = reorderedKeys(tickets, ticket.key, target.key, delta > 0, boardOrderQuery.data?.keys ?? []);
                            if (keys) void saveOrder(keys);
                          }} />
                      ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
      {detail && detailTicket ? (
        <TicketDetailDrawer key={`${documentIdentity(detail.document.response.file)}#${detail.ticketId}`}
          availableTickets={detail.document.response.document.tickets} ticket={detailTicket}
          documentHash={detail.document.response.file.hash} documentMtimeMs={detail.document.response.file.mtimeMs}
          workspaceId={detail.document.workspace.id} fileId={detail.document.response.file.id}
          presentation={presentation}
          onOpenInWorkspace={() => { void navigate({ href: buildAppRoute({
            workspaceId: detail.document.workspace.id, filePath: documentRouteId(detail.document.response.file),
            ticketId: detail.ticketId, detailMode: presentation.mode,
          }) }); }}
          onClose={() => setDetail(null)} onReload={reloadDetail} onExternalFileReload={reloadDetail} externalFileChange={externalChange}
          onPatchTicket={(id, status, progress, reason) => saveStatus(detail.document, id, status, progress, reason)}
          onAppendInstruction={appendInstruction} />
      ) : null}
      {pendingMove ? (
        <TicketMoveDialog key={`${documentIdentity(pendingMove.document.response.file)}#${pendingMove.move.ticket.id}`}
          move={pendingMove.move} currentHash={currentMove?.response.file.hash ?? ""} currentMtimeMs={currentMove?.response.file.mtimeMs ?? 0}
          onClose={() => setPendingMove(null)}
          onSave={(id, status, progress, reason, guard) => saveStatus(pendingMove.document, id, status, progress, reason, guard, pendingMove.order)} />
      ) : null}
    </div>
  );
}

function BoardCard({ ticket, disabled, detailMode, dropPosition, onDragStart, onDragEnd, onDragOverCard, onOpen, onReorder, canMoveUp, canMoveDown }: {
  ticket: BoardTicket; disabled: boolean; detailMode: TicketDetailMode; dropPosition: "after" | "before" | null;
  onDragStart: () => void; onDragEnd: () => void; onDragOverCard: (after: boolean) => void;
  onOpen: () => void; onReorder: (delta: number) => void; canMoveUp: boolean; canMoveDown: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projectHref = buildAppRoute({
    workspaceId: ticket.workspaceId, filePath: documentRouteId(ticket.file), ticketId: ticket.id, detailMode,
  });
  return (
    <article className="ak-card group relative p-3" data-ticket-key={ticket.key} draggable={!disabled}
      onDragStart={(event) => { event.dataTransfer.setData("text/ticket-key", ticket.key); event.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd} onDragOver={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOverCard(event.clientY > rect.top + rect.height / 2);
      }}>
      {dropPosition ? <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-1 h-0.5 bg-primary", dropPosition === "before" ? "-top-1" : "-bottom-1")} /> : null}
      <div className="flex items-start justify-between gap-2">
        <a href={projectHref} draggable={false} className="ak-focus-ring group/project inline-flex min-w-0 rounded-full"
          aria-label={t("Go to {{project}} project", { project: ticket.projectLabel })}
          title={t("Go to {{project}} project", { project: ticket.projectRoot })}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void navigate({ href: projectHref });
          }}>
          <Badge variant="outline" className="min-w-0 max-w-full gap-1.5 group-hover/project:bg-muted group-focus-visible/project:bg-muted">
            <Folder aria-hidden="true" className="size-3 shrink-0" /><span className="truncate group-hover/project:underline">{ticket.projectLabel}</span>
          </Badge>
        </a>
        {ticket.priority ? <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge> : null}
      </div>
      <a href={projectHref} draggable={false} className="ak-focus-ring mt-2 block rounded-sm"
        onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpen(); } }}>
        <span className="text-xs text-muted-foreground">{ticket.id}</span>
        <h3 className="mt-1 line-clamp-3 break-words text-sm font-medium leading-5">{ticket.title}</h3>
      </a>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${ticket.progress}%` }} /></div>
        <span className="text-xs tabular-nums text-muted-foreground">{ticket.progress}%</span>
        <div className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <Button title={t("Move up")} aria-label={t("Move {{id}} up", { id: ticket.id })} size="iconSm" variant="ghost" disabled={disabled || !canMoveUp} onClick={() => onReorder(-1)}><ArrowUp aria-hidden="true" /></Button>
          <Button title={t("Move down")} aria-label={t("Move {{id}} down", { id: ticket.id })} size="iconSm" variant="ghost" disabled={disabled || !canMoveDown} onClick={() => onReorder(1)}><ArrowDown aria-hidden="true" /></Button>
        </div>
      </div>
      {ticket.missingFields.length ? <Badge className="mt-2" variant="warning">{ticket.missingFields.length} {t("missing fields")}</Badge> : null}
    </article>
  );
}
