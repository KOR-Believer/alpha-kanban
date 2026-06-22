import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  APP_NAME,
  apiErrorResponseSchema,
  cancelCodexRunResponseSchema,
  codexPromptPreviewResponseSchema,
  codexRunEventSchema,
  codexRunResponseSchema,
  createCodexRunResponseSchema,
  filesResponseSchema,
  healthResponseSchema,
  ticketDocumentResponseSchema,
  type ApiErrorResponse,
  type CodexPromptPreviewResponse,
  type CodexRunEvent,
  type CodexRunSnapshot,
  type MarkdownFileSummary,
  type TicketDocumentResponse,
  type TicketItem,
  type TicketProgress,
  type TicketStatus,
} from "@alpha-kanban/shared";
import {
  AlertCircle,
  Bot,
  CircleDot,
  FileText,
  FolderKanban,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Search,
  Square,
  Terminal,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BOARD_STATUSES: TicketStatus[] = [
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
];
const PROGRESS_VALUES: TicketProgress[] = [0, 25, 50, 75, 100];

type ParseableSchema<T> = {
  parse: (value: unknown) => T;
};

class ClientApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, payload: ApiErrorResponse) {
    super(payload.error.message);
    this.name = "ClientApiError";
    this.code = payload.error.code;
    this.status = status;
  }
}

const ticketDocumentKey = (fileId?: string) => ["ticket-document", fileId] as const;

async function requestJson<T>(
  url: string,
  schema: ParseableSchema<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(json);
    throw new ClientApiError(
      response.status,
      parsed.success
        ? parsed.data
        : { error: { code: "HTTP_ERROR", message: `Request failed with ${response.status}` } },
    );
  }

  return schema.parse(json);
}

async function fetchHealth() {
  return requestJson("/api/health", healthResponseSchema);
}

async function fetchFiles() {
  return requestJson("/api/files", filesResponseSchema);
}

async function fetchTicketDocument(fileId: string) {
  return requestJson(`/api/files/${fileId}/tickets`, ticketDocumentResponseSchema);
}

async function patchTicket(
  fileId: string,
  ticketId: string,
  body: {
    expectedHash?: string;
    expectedMtimeMs?: number;
    progress?: TicketProgress;
    status?: TicketStatus;
  },
) {
  return requestJson(`/api/files/${fileId}/tickets/${ticketId}`, ticketDocumentResponseSchema, {
    body: JSON.stringify(body),
    method: "PATCH",
  });
}

async function previewCodexPrompt(body: {
  fileId: string;
  instructionDraft?: string;
  ticketId: string;
}) {
  return requestJson("/api/codex/prompt-preview", codexPromptPreviewResponseSchema, {
    body: JSON.stringify(body),
    method: "POST",
  });
}

async function startCodexRun(body: {
  expectedHash?: string;
  expectedMtimeMs?: number;
  fileId: string;
  instructionDraft?: string;
  ticketId: string;
}) {
  return requestJson("/api/codex/runs", createCodexRunResponseSchema, {
    body: JSON.stringify(body),
    method: "POST",
  });
}

async function fetchCodexRun(runId: string) {
  return requestJson(`/api/codex/runs/${runId}`, codexRunResponseSchema);
}

async function cancelCodexRun(runId: string) {
  return requestJson(`/api/codex/runs/${runId}/cancel`, cancelCodexRunResponseSchema, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function App() {
  const queryClient = useQueryClient();
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: fetchFiles,
  });
  const ticketFiles = useMemo(
    () => filesQuery.data?.files.filter((file) => file.type === "tickets") ?? [],
    [filesQuery.data?.files],
  );
  const selectedFile = ticketFiles.find((file) => file.id === selectedFileId);
  const ticketQuery = useQuery({
    enabled: Boolean(selectedFileId),
    queryFn: () => fetchTicketDocument(selectedFileId ?? ""),
    queryKey: ticketDocumentKey(selectedFileId),
  });
  const ticketsByStatus = useMemo(() => {
    const grouped = new Map<TicketStatus, TicketItem[]>(
      BOARD_STATUSES.map((status) => [status, []]),
    );

    for (const ticket of ticketQuery.data?.document.tickets ?? []) {
      grouped.get(ticket.status)?.push(ticket);
    }

    return grouped;
  }, [ticketQuery.data?.document.tickets]);
  const selectedTicket = ticketQuery.data?.document.tickets.find(
    (ticket) => ticket.id === selectedTicketId,
  );

  useEffect(() => {
    if (!selectedFileId && ticketFiles[0]) {
      setSelectedFileId(ticketFiles[0].id);
    }
  }, [selectedFileId, ticketFiles]);

  useEffect(() => {
    setSelectedTicketId(undefined);
  }, [selectedFileId]);

  async function replaceDocument(data: TicketDocumentResponse): Promise<void> {
    queryClient.setQueryData(ticketDocumentKey(selectedFileId), data);
    await queryClient.invalidateQueries({ queryKey: ["files"] });
  }

  async function handlePatchTicket(
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
  ): Promise<void> {
    if (!selectedFileId || !ticketQuery.data) {
      return;
    }

    await replaceDocument(
      await patchTicket(selectedFileId, ticketId, {
        status,
        progress,
        expectedHash: ticketQuery.data.file.hash,
        expectedMtimeMs: ticketQuery.data.file.mtimeMs,
      }),
    );
  }

  return (
    <>
      <main className="grid min-h-screen grid-cols-[300px_minmax(0,1fr)] bg-neutral-50 text-neutral-950 max-[860px]:grid-cols-1">
        <aside
          className="flex min-h-0 flex-col border-r border-neutral-200 bg-white max-[860px]:border-b max-[860px]:border-r-0"
          aria-label="Workspace files"
        >
          <div className="border-b border-neutral-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="size-5 text-neutral-700" aria-hidden="true" />
              <h1 className="text-base font-semibold tracking-normal">{APP_NAME}</h1>
            </div>
            <p className="mt-1 text-xs text-neutral-500">Local plan-ticketing workspace</p>
          </div>

          <div className="border-b border-neutral-200 p-3">
            <div className="flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
              <Search className="size-4" aria-hidden="true" />
              <span>Ticket documents</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filesQuery.isLoading ? <SidebarState label="Loading files" /> : null}
            {filesQuery.isError ? (
              <SidebarState label="Could not load files" tone="error" />
            ) : null}
            {filesQuery.isSuccess && ticketFiles.length === 0 ? (
              <SidebarState label="No ticket documents" />
            ) : null}
            <nav className="grid gap-1" aria-label="Ticket documents">
              {ticketFiles.map((file) => (
                <FileButton
                  file={file}
                  isSelected={file.id === selectedFileId}
                  key={file.id}
                  onSelect={() => setSelectedFileId(file.id)}
                />
              ))}
            </nav>
          </div>

          <div className="border-t border-neutral-200 p-3">
            <HealthPill status={healthQuery.status} />
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden" aria-labelledby="workspace-title">
          <header className="flex min-h-20 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4 max-[720px]:flex-col max-[720px]:items-start">
            <div>
              <p className="text-xs font-medium uppercase tracking-normal text-neutral-500">
                {selectedFile?.relativePath ?? "Select a ticket document"}
              </p>
              <h2 id="workspace-title" className="mt-1 text-xl font-semibold tracking-normal">
                {ticketQuery.data?.document.title ?? "Ticket board"}
              </h2>
            </div>
            <BoardSummary
              file={ticketQuery.data?.file}
              isLoading={ticketQuery.isLoading}
              ticketCount={ticketQuery.data?.document.tickets.length ?? 0}
            />
          </header>

          <div className="h-[calc(100vh-5rem)] overflow-auto p-5 max-[860px]:h-[calc(100vh-12rem)]">
            <BoardContent
              error={ticketQuery.error}
              isError={ticketQuery.isError}
              isLoading={ticketQuery.isLoading || filesQuery.isLoading}
              onTicketSelect={setSelectedTicketId}
              selectedFileId={selectedFileId}
              ticketsByStatus={ticketsByStatus}
            />
          </div>
        </section>
      </main>

      {selectedTicket && selectedFileId && ticketQuery.data ? (
        <TicketDetailDrawer
          documentHash={ticketQuery.data.file.hash}
          documentMtimeMs={ticketQuery.data.file.mtimeMs}
          fileId={selectedFileId}
          onClose={() => setSelectedTicketId(undefined)}
          onPatchTicket={handlePatchTicket}
          onReload={() => ticketQuery.refetch()}
          onRunDocumentChange={async () => {
            await ticketQuery.refetch();
            await queryClient.invalidateQueries({ queryKey: ["files"] });
          }}
          ticket={selectedTicket}
        />
      ) : null}
    </>
  );
}

function FileButton({
  file,
  isSelected,
  onSelect,
}: {
  file: MarkdownFileSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={[
        "group grid min-h-14 min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-md px-3 py-2 text-left transition-colors",
        isSelected ? "bg-neutral-100 text-neutral-950" : "text-neutral-600 hover:bg-neutral-50",
      ].join(" ")}
      onClick={onSelect}
      type="button"
    >
      <FileText className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{file.filename}</span>
        <span className="block truncate text-xs text-neutral-500">{file.relativePath}</span>
      </span>
    </button>
  );
}

function SidebarState({ label, tone = "muted" }: { label: string; tone?: "error" | "muted" }) {
  return (
    <div
      className={[
        "m-2 rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-neutral-200 bg-neutral-50 text-neutral-500",
      ].join(" ")}
    >
      {label}
    </div>
  );
}

function HealthPill({ status }: { status: "error" | "pending" | "success" }) {
  const label =
    status === "success" ? "API online" : status === "error" ? "API unavailable" : "Checking API";

  return (
    <div className="inline-flex w-full items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
      <span
        className={[
          "size-2 rounded-full",
          status === "success"
            ? "bg-emerald-500"
            : status === "error"
              ? "bg-red-500"
              : "bg-neutral-400",
        ].join(" ")}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

function BoardSummary({
  file,
  isLoading,
  ticketCount,
}: {
  file?: MarkdownFileSummary;
  isLoading: boolean;
  ticketCount: number;
}) {
  if (isLoading) {
    return (
      <Badge variant="muted">
        <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
        Loading
      </Badge>
    );
  }

  if (!file) {
    return <Badge variant="muted">No document</Badge>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2 max-[720px]:justify-start">
      <Badge variant="outline">{ticketCount} tickets</Badge>
      <Badge variant="muted">{new Date(file.mtimeMs).toLocaleDateString()}</Badge>
    </div>
  );
}

function BoardContent({
  error,
  isError,
  isLoading,
  onTicketSelect,
  selectedFileId,
  ticketsByStatus,
}: {
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
  onTicketSelect: (ticketId: string) => void;
  selectedFileId?: string;
  ticketsByStatus: Map<TicketStatus, TicketItem[]>;
}) {
  if (!selectedFileId) {
    return <BoardState title="No ticket document selected" />;
  }

  if (isLoading) {
    return <BoardState isLoading title="Loading ticket board" />;
  }

  if (isError) {
    return (
      <BoardState
        icon="error"
        title="Could not load ticket board"
        description={error?.message ?? "Unknown API error"}
      />
    );
  }

  return (
    <div className="grid min-w-[900px] grid-cols-6 gap-3" aria-label="Ticket kanban board">
      {BOARD_STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          onTicketSelect={onTicketSelect}
          status={status}
          tickets={ticketsByStatus.get(status) ?? []}
        />
      ))}
    </div>
  );
}

function BoardState({
  description,
  icon = "empty",
  isLoading = false,
  title,
}: {
  description?: string;
  icon?: "empty" | "error";
  isLoading?: boolean;
  title: string;
}) {
  const Icon = icon === "error" ? AlertCircle : CircleDot;

  return (
    <div className="grid min-h-96 place-items-center rounded-lg border border-dashed border-neutral-300 bg-white">
      <div className="grid max-w-md justify-items-center gap-3 px-6 text-center">
        {isLoading ? (
          <Loader2 className="size-6 animate-spin text-neutral-500" aria-hidden="true" />
        ) : (
          <Icon className="size-6 text-neutral-500" aria-hidden="true" />
        )}
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-sm text-neutral-500">{description}</p> : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  onTicketSelect,
  status,
  tickets,
}: {
  onTicketSelect: (ticketId: string) => void;
  status: TicketStatus;
  tickets: TicketItem[];
}) {
  return (
    <section className="min-h-[calc(100vh-8rem)] rounded-lg border border-neutral-200 bg-neutral-100/70">
      <header className="flex items-center justify-between gap-2 rounded-t-lg border-b border-neutral-200 bg-neutral-100/95 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <h3 className="truncate text-xs font-semibold uppercase tracking-normal text-neutral-600">
            {status}
          </h3>
        </div>
        <Badge variant="muted">{tickets.length}</Badge>
      </header>
      <div className="grid gap-2 p-2">
        {tickets.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-8 text-center text-xs text-neutral-500">
            Empty
          </div>
        ) : null}
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} onSelect={() => onTicketSelect(ticket.id)} ticket={ticket} />
        ))}
      </div>
    </section>
  );
}

function TicketCard({ onSelect, ticket }: { onSelect: () => void; ticket: TicketItem }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-colors hover:border-neutral-300">
      <button
        aria-label={`Open ${ticket.id}`}
        className="block w-full p-3 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline">{ticket.id}</Badge>
          <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
        </div>
        <h4 className="mt-2 line-clamp-3 break-words text-sm font-medium leading-5 text-neutral-950">
          {ticket.title}
        </h4>
        <div className="mt-3 grid gap-1.5 text-xs text-neutral-500">
          <PropertyRow label="Progress" value={`${ticket.progress}%`} />
          <PropertyRow
            label="Repo"
            value={ticket.repository.length > 0 ? ticket.repository.join(", ") : "-"}
          />
          <PropertyRow
            label="Depends"
            value={ticket.dependsOn.length > 0 ? ticket.dependsOn.join(", ") : "-"}
          />
        </div>
      </button>
    </article>
  );
}

function TicketDetailDrawer({
  documentHash,
  documentMtimeMs,
  fileId,
  onClose,
  onPatchTicket,
  onReload,
  onRunDocumentChange,
  ticket,
}: {
  documentHash: string;
  documentMtimeMs: number;
  fileId: string;
  onClose: () => void;
  onPatchTicket: (
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
  ) => Promise<void>;
  onReload: () => Promise<unknown>;
  onRunDocumentChange: () => Promise<unknown>;
  ticket: TicketItem;
}) {
  const [statusDraft, setStatusDraft] = useState<TicketStatus>(ticket.status);
  const [progressDraft, setProgressDraft] = useState<TicketProgress>(ticket.progress);
  const [runDraft, setRunDraft] = useState("");
  const [preview, setPreview] = useState<CodexPromptPreviewResponse | null>(null);
  const [run, setRun] = useState<CodexRunSnapshot | null>(null);
  const [runEvents, setRunEvents] = useState<CodexRunEvent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);

  useEffect(() => {
    setStatusDraft(ticket.status);
    setProgressDraft(ticket.progress);
    setRunDraft("");
    setPreview(null);
    setRun(null);
    setRunEvents([]);
    setError(null);
  }, [ticket.id, ticket.progress, ticket.status]);

  useEffect(() => {
    if (!run?.id || run.status !== "running") {
      return;
    }

    const source = new EventSource(`/api/codex/runs/${run.id}/events`);
    source.addEventListener("codex", (message) => {
      const parsed = codexRunEventSchema.safeParse(JSON.parse(message.data as string));
      if (!parsed.success) {
        return;
      }
      setRunEvents((current) => upsertEvent(current, parsed.data));
      if (parsed.data.type === "exit" || parsed.data.type === "error") {
        void fetchCodexRun(run.id).then((response) => {
          setRun(response.run);
          setRunEvents(response.run.events);
        });
      }
    });
    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [run?.id, run?.status]);

  async function saveStatus(): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      await onPatchTicket(ticket.id, statusDraft, progressDraft);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  async function loadPreview(): Promise<void> {
    setIsPreviewing(true);
    setError(null);
    try {
      setPreview(
        await previewCodexPrompt({
          fileId,
          ticketId: ticket.id,
          instructionDraft: runDraft.trim() || undefined,
        }),
      );
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function runCodex(): Promise<void> {
    setIsStartingRun(true);
    setError(null);
    try {
      const response = await startCodexRun({
        expectedHash: documentHash,
        expectedMtimeMs: documentMtimeMs,
        fileId,
        ticketId: ticket.id,
        instructionDraft: runDraft.trim() || undefined,
      });
      setRun(response.run);
      setRunEvents(response.run.events);
      setPreview({
        fileId: response.run.fileId,
        ticketId: response.run.ticketId,
        prompt: response.run.prompt,
        command: response.run.command,
        args: response.run.args,
        resumeSessionId: response.run.resumeSessionId,
        statePath: "",
      });
      await onRunDocumentChange();
      setRunDraft("");
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsStartingRun(false);
    }
  }

  async function cancelRun(): Promise<void> {
    if (!run) {
      return;
    }
    setIsCancelling(true);
    setError(null);
    try {
      const response = await cancelCodexRun(run.id);
      setRun(response.run);
      setRunEvents(response.run.events);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsCancelling(false);
    }
  }

  const canSaveStatus = statusDraft !== ticket.status || progressDraft !== ticket.progress;
  const latestErrorCode = error instanceof ClientApiError ? error.code : undefined;

  return (
    <div
      aria-labelledby="ticket-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-neutral-950/20"
      role="dialog"
    >
      <div className="absolute inset-y-0 right-0 flex w-[min(720px,100vw)] flex-col border-l border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{ticket.id}</Badge>
              <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
              <Badge variant="muted">lines {ticket.range.startLine}-{ticket.range.endLine}</Badge>
            </div>
            <h2
              className="mt-3 break-words text-2xl font-semibold tracking-normal text-neutral-950"
              id="ticket-detail-title"
            >
              {ticket.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">{ticket.type}</p>
          </div>
          <Button aria-label="Close ticket detail" onClick={onClose} size="icon" variant="ghost">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <ErrorBanner
              error={error}
              isStale={latestErrorCode === "STALE_FILE"}
              onReload={onReload}
            />
          ) : null}

          <section className="grid gap-3 border-b border-neutral-200 pb-5">
            <h3 className="text-sm font-semibold text-neutral-900">Properties</h3>
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <label className="grid gap-1 text-xs font-medium text-neutral-500">
                Status
                <select
                  className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-medium text-neutral-900"
                  onChange={(event) => setStatusDraft(event.target.value as TicketStatus)}
                  value={statusDraft}
                >
                  {BOARD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-neutral-500">
                Progress
                <select
                  className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-medium text-neutral-900"
                  onChange={(event) =>
                    setProgressDraft(Number(event.target.value) as TicketProgress)
                  }
                  value={progressDraft}
                >
                  {PROGRESS_VALUES.map((progress) => (
                    <option key={progress} value={progress}>
                      {progress}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canSaveStatus || isSaving} onClick={saveStatus} size="sm">
                {isSaving ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-3" aria-hidden="true" />
                )}
                Save status
              </Button>
              <Badge variant="muted">Hash {documentHash.slice(0, 10)}</Badge>
            </div>
          </section>

          <div className="grid gap-6 py-5">
            <CanonicalSection title="Repository" items={ticket.repository} />
            <CanonicalSection title="Depends on" items={ticket.dependsOn} />
            <CanonicalSection title="목표" items={ticket.goal} />
            <CanonicalSection title="현재 문제" items={ticket.currentProblem} />
            <CanonicalSection title="구현 범위" items={ticket.implementationScope} />
            <CanonicalSection title="제외 범위" items={ticket.outOfScope} />
            <CanonicalSection title="완료 기준" items={ticket.completionCriteria} />
            <CanonicalSection title="검증" items={ticket.validation} />

            <section className="grid gap-3 border-t border-neutral-200 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-900">사용자 지시</h3>
                <Badge variant="muted">{ticket.userInstructions.length}</Badge>
              </div>
              <LogTimeline emptyLabel="No user instructions" entries={ticket.userInstructions} />
            </section>

            <section className="grid gap-3 border-t border-neutral-200 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-900">진행 메모</h3>
                <Badge variant="muted">{ticket.progressNotes.length}</Badge>
              </div>
              <LogTimeline emptyLabel="No progress notes" entries={ticket.progressNotes} />
            </section>

            <section className="grid gap-3 border-t border-neutral-200 pt-5">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-neutral-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-neutral-900">Run with Codex</h3>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <label className="grid gap-2 text-xs font-medium text-neutral-500">
                  Execution draft
                  <textarea
                    className="min-h-28 resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-normal leading-6 text-neutral-900 outline-none focus:border-neutral-400"
                    onChange={(event) => {
                      setRunDraft(event.target.value);
                      setPreview(null);
                    }}
                    placeholder="이번 Codex 실행에서 처리할 지시를 입력"
                    value={runDraft}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPreviewing} onClick={loadPreview} size="sm" variant="outline">
                  {isPreviewing ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Terminal className="size-3" aria-hidden="true" />
                  )}
                  Preview prompt
                </Button>
                <Button disabled={isStartingRun} onClick={runCodex} size="sm">
                  {isStartingRun ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="size-3" aria-hidden="true" />
                  )}
                  Run with Codex
                </Button>
                {run?.status === "running" ? (
                  <Button disabled={isCancelling} onClick={cancelRun} size="sm" variant="outline">
                    {isCancelling ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Square className="size-3" aria-hidden="true" />
                    )}
                    Cancel
                  </Button>
                ) : null}
              </div>
              {preview ? <PromptPreview preview={preview} /> : null}
              {run ? <RunLog events={runEvents} run={run} /> : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({
  error,
  isStale,
  onReload,
}: {
  error: Error;
  isStale: boolean;
  onReload: () => Promise<unknown>;
}) {
  const [isReloading, setIsReloading] = useState(false);

  async function reload(): Promise<void> {
    setIsReloading(true);
    try {
      await onReload();
    } finally {
      setIsReloading(false);
    }
  }

  return (
    <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{isStale ? "Markdown changed on disk" : "Request failed"}</p>
          <p className="mt-1 text-red-700">{error.message}</p>
        </div>
        {isStale ? (
          <Button disabled={isReloading} onClick={reload} size="sm" variant="outline">
            {isReloading ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="size-3" aria-hidden="true" />
            )}
            Reload
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CanonicalSection({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {items.length > 0 ? (
        <ul className="grid gap-1 text-sm leading-6 text-neutral-700">
          {items.map((item, index) => (
            <li className="break-words" key={`${title}-${index}`}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">-</p>
      )}
    </section>
  );
}

function LogTimeline({
  emptyLabel,
  entries,
}: {
  emptyLabel: string;
  entries: TicketItem["progressNotes"];
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry) => (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm" key={entry.index}>
          <span className="text-xs font-medium text-neutral-400">{entry.date}</span>
          <p className="break-words leading-6 text-neutral-700">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

function PromptPreview({ preview }: { preview: CodexPromptPreviewResponse }) {
  return (
    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{preview.command}</Badge>
        <Badge variant="muted">
          {preview.resumeSessionId ? "resume session" : "new session"}
        </Badge>
      </div>
      <p className="truncate text-xs text-neutral-500" title={preview.args.join(" ")}>
        {preview.args.slice(0, -1).join(" ")}
      </p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-neutral-700">
        {preview.prompt}
      </pre>
    </div>
  );
}

function RunLog({ events, run }: { events: CodexRunEvent[]; run: CodexRunSnapshot }) {
  return (
    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-950 p-3 text-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-neutral-400" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-normal text-neutral-400">
            {run.status}
          </span>
        </div>
        <Badge variant="muted">{events.length} events</Badge>
      </div>
      <div className="max-h-72 overflow-auto rounded-md bg-black/30 p-2 font-mono text-xs leading-5">
        {events.length === 0 ? (
          <p className="text-neutral-500">Waiting for events</p>
        ) : (
          events.map((event) => (
            <p className="whitespace-pre-wrap break-words" key={event.id}>
              <span className="text-neutral-500">[{event.type}]</span> {event.message}
            </p>
          ))
        )}
      </div>
      <p className="truncate text-xs text-neutral-500" title={run.logPath}>
        {run.logPath}
      </p>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[62px_minmax(0,1fr)] gap-2">
      <span className="text-neutral-400">{label}</span>
      <span className="truncate text-neutral-600" title={value}>
        {value}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: TicketStatus }) {
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

function priorityVariant(priority: string) {
  if (priority === "P0") {
    return "warning";
  }
  if (priority === "P1") {
    return "default";
  }
  return "muted";
}

function normalizeClientError(error: unknown): ClientApiError | Error {
  return error instanceof ClientApiError
    ? error
    : error instanceof Error
      ? error
      : new Error(String(error));
}

function upsertEvent(events: CodexRunEvent[], event: CodexRunEvent): CodexRunEvent[] {
  if (events.some((item) => item.id === event.id)) {
    return events.map((item) => (item.id === event.id ? event : item));
  }
  return [...events, event].sort((a, b) => a.id - b.id);
}
