import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Node as TiptapNode, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  APP_NAME,
  apiErrorResponseSchema,
  cancelCodexRunResponseSchema,
  codexDocumentRunSummaryResponseSchema,
  codexPromptPreviewResponseSchema,
  codexRunEventSchema,
  codexRunResponseSchema,
  codexTicketChatResponseSchema,
  codexChatScopeRunWarnings,
  findCodexChatScopeMentionRanges,
  markCodexRunReadResponseSchema,
  createCodexRunResponseSchema,
  documentSetsResponseSchema,
  healthResponseSchema,
  isCodexChatScopeRunAllowed,
  markdownDocumentResponseSchema,
  resolveCodexChatScope,
  ticketDocumentResponseSchema,
  selectWorkspaceResponseSchema,
  workspaceDirectoriesResponseSchema,
  workspacesResponseSchema,
  type ApiErrorResponse,
  type CodexDocumentRunSummaryResponse,
  type CodexPromptPreviewResponse,
  type CodexRunEvent,
  type CodexRunMode,
  type CodexRunSignalStatus,
  type CodexRunSnapshot,
  type CodexRunSummary,
  type CodexChatScopeMentionKind,
  type CodexChatScopeResolution,
  type CodexChatMessage,
  type CodexTicketChatResponse,
  type DocumentSetSummary,
  type MarkdownDocumentResponse,
  type MarkdownFileSummary,
  type MarkdownFileType,
  type TicketChecklistItem,
  type TicketDocumentResponse,
  type TicketItem,
  type TicketProgress,
  type TicketStatus,
  type WorkspaceDirectoryEntry,
  type WorkspaceDirectoryRoot,
  type WorkspaceDirectoriesResponse,
  type WorkspaceSummary,
} from "@alpha-kanban/shared";
import {
  AlertCircle,
  Archive,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  Check,
  CircleDot,
  FileText,
  Folder,
  FolderKanban,
  ListChecks,
  Loader2,
  Maximize2,
  PanelRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const BOARD_STATUSES: TicketStatus[] = [
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
];
const PROGRESS_VALUES: TicketProgress[] = [0, 25, 50, 75, 100];
const MARKDOWN_HEADING_HIGHLIGHT_CLASS = "ak-markdown-heading-highlight";
const SIDEBAR_WIDTH_STORAGE_KEY = "alpha-kanban.sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;
const TICKET_DETAIL_MODE_STORAGE_KEY = "alpha-kanban.ticketDetailMode";
const TICKET_DETAIL_WIDTH_STORAGE_KEY = "alpha-kanban.ticketDetailWidth";
const DEFAULT_TICKET_DETAIL_WIDTH = 720;
const MIN_TICKET_DETAIL_WIDTH = 520;
const MAX_TICKET_DETAIL_WIDTH = 1040;
const WORKSPACE_ROUTE_PREFIX = "/w/";
const SCOPE_MENTION_NODE_TYPE = "scopeMention";

type TicketDetailMode = "side" | "modal";

type AppRouteState = {
  detailMode?: TicketDetailMode;
  filePath?: string;
  ticketId?: string;
  workspaceId?: string;
};

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

type ScopeMentionAttributes = {
  kind: CodexChatScopeMentionKind;
  label: string;
  targetTicketId?: string;
  token: string;
};

type ScopeSuggestion = ScopeMentionAttributes & {
  description: string;
  id: string;
};

type ActiveMentionQuery = {
  from: number;
  query: string;
  to: number;
};

const ScopeMentionNode = TiptapNode.create({
  addAttributes() {
    return {
      kind: {
        default: "document",
        parseHTML: (element) => element.getAttribute("data-kind"),
        renderHTML: (attributes) => ({ "data-kind": attributes.kind }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => ({ "data-label": attributes.label }),
      },
      targetTicketId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ticket-id"),
        renderHTML: (attributes) =>
          attributes.targetTicketId ? { "data-ticket-id": attributes.targetTicketId } : {},
      },
      token: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-token"),
        renderHTML: (attributes) => ({ "data-token": attributes.token }),
      },
    };
  },
  atom: true,
  group: "inline",
  inline: true,
  name: SCOPE_MENTION_NODE_TYPE,
  parseHTML() {
    return [{ tag: "span[data-scope-mention]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-scope-mention": "true",
        class: "ak-scope-mention",
        contenteditable: "false",
      }),
      node.attrs.label || node.attrs.token,
    ];
  },
  renderText({ node }) {
    return node.attrs.token;
  },
  selectable: true,
});

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function clampTicketDetailWidth(width: number): number {
  return Math.min(
    MAX_TICKET_DETAIL_WIDTH,
    Math.max(MIN_TICKET_DETAIL_WIDTH, Math.round(width)),
  );
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  try {
    const parsed = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function readStoredTicketDetailMode(): TicketDetailMode {
  if (typeof window === "undefined") {
    return "side";
  }

  try {
    const stored = window.localStorage.getItem(TICKET_DETAIL_MODE_STORAGE_KEY);
    return stored === "modal" || stored === "side" ? stored : "side";
  } catch {
    return "side";
  }
}

function readStoredTicketDetailWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_TICKET_DETAIL_WIDTH;
  }

  try {
    const parsed = Number(window.localStorage.getItem(TICKET_DETAIL_WIDTH_STORAGE_KEY));
    return Number.isFinite(parsed)
      ? clampTicketDetailWidth(parsed)
      : DEFAULT_TICKET_DETAIL_WIDTH;
  } catch {
    return DEFAULT_TICKET_DETAIL_WIDTH;
  }
}

function readAppRouteState(): AppRouteState {
  if (typeof window === "undefined") {
    return {};
  }

  const route: AppRouteState = {};
  const pathname = window.location.pathname;
  if (pathname.startsWith(WORKSPACE_ROUTE_PREFIX)) {
    const encodedWorkspaceId = pathname.slice(WORKSPACE_ROUTE_PREFIX.length).split("/")[0];
    if (encodedWorkspaceId) {
      route.workspaceId = decodeURIComponent(encodedWorkspaceId);
    }
  }

  const searchParams = new URLSearchParams(window.location.search);
  const filePath = searchParams.get("file");
  if (filePath) {
    route.filePath = filePath;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const ticketId = hashParams.get("ticket");
  if (ticketId) {
    route.ticketId = ticketId;
  }

  const detailMode = hashParams.get("detail");
  if (detailMode === "modal" || detailMode === "side") {
    route.detailMode = detailMode;
  }

  return route;
}

function buildAppRoute(state: AppRouteState): string {
  const pathname = state.workspaceId
    ? `${WORKSPACE_ROUTE_PREFIX}${encodeURIComponent(state.workspaceId)}`
    : "/";
  const searchParams = new URLSearchParams();
  if (state.filePath) {
    searchParams.set("file", state.filePath);
  }

  const hashParams = new URLSearchParams();
  if (state.ticketId) {
    hashParams.set("ticket", state.ticketId);
    hashParams.set("detail", state.detailMode ?? "side");
  }

  const search = searchParams.toString();
  const hash = hashParams.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

function replaceAppRoute(state: AppRouteState): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = buildAppRoute(state);
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextPath !== currentPath) {
    window.history.replaceState(null, "", nextPath);
  }
}

const documentSetsKey = (workspaceId?: string) => ["document-sets", workspaceId] as const;
const markdownDocumentKey = (workspaceId?: string, fileId?: string) =>
  ["markdown-document", workspaceId, fileId] as const;
const ticketDocumentKey = (workspaceId?: string, fileId?: string) =>
  ["ticket-document", workspaceId, fileId] as const;
const codexRunSummaryKey = (workspaceId?: string, fileId?: string) =>
  ["codex-run-summary", workspaceId, fileId] as const;
const ticketChatKey = (workspaceId?: string, fileId?: string, ticketId?: string) =>
  ["ticket-chat", workspaceId, fileId, ticketId] as const;
const workspaceDirectoriesKey = (root?: string) => ["workspace-directories", root] as const;

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

async function fetchWorkspaces() {
  return requestJson("/api/workspaces", workspacesResponseSchema);
}

async function fetchWorkspaceDirectories(root?: string) {
  const params = new URLSearchParams();
  if (root) {
    params.set("root", root);
  }
  const query = params.toString();
  return requestJson(
    `/api/workspace-directories${query ? `?${query}` : ""}`,
    workspaceDirectoriesResponseSchema,
  );
}

async function selectWorkspaceById(workspaceId: string) {
  return requestJson("/api/workspaces/select", selectWorkspaceResponseSchema, {
    body: JSON.stringify({ workspaceId }),
    method: "POST",
  });
}

async function selectWorkspaceByRoot(root: string) {
  return requestJson("/api/workspaces/select", selectWorkspaceResponseSchema, {
    body: JSON.stringify({ root }),
    method: "POST",
  });
}

async function fetchDocumentSets(workspaceId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/document-sets`,
    documentSetsResponseSchema,
  );
}

async function fetchMarkdownDocument(workspaceId: string, fileId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/markdown`,
    markdownDocumentResponseSchema,
  );
}

async function fetchTicketDocument(workspaceId: string, fileId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets`,
    ticketDocumentResponseSchema,
  );
}

async function fetchCodexRunSummary(workspaceId: string, fileId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/codex-run-summary`,
    codexDocumentRunSummaryResponseSchema,
  );
}

async function fetchTicketChat(workspaceId: string, fileId: string, ticketId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets/${ticketId}/chat`,
    codexTicketChatResponseSchema,
  );
}

async function patchTicket(
  workspaceId: string,
  fileId: string,
  ticketId: string,
  body: {
    expectedHash?: string;
    expectedMtimeMs?: number;
    progress?: TicketProgress;
    status?: TicketStatus;
  },
) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets/${ticketId}`,
    ticketDocumentResponseSchema,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

async function previewCodexPrompt(workspaceId: string, body: {
  fileId: string;
  instructionDraft?: string;
  mode?: CodexRunMode;
  ticketId: string;
}) {
  return requestJson(
    `/api/workspaces/${workspaceId}/codex/prompt-preview`,
    codexPromptPreviewResponseSchema,
    {
      body: JSON.stringify(body),
      method: "POST",
    },
  );
}

async function startCodexRun(workspaceId: string, body: {
  expectedHash?: string;
  expectedMtimeMs?: number;
  fileId: string;
  instructionDraft?: string;
  mode?: CodexRunMode;
  ticketId: string;
}) {
  return requestJson(
    `/api/workspaces/${workspaceId}/codex/runs`,
    createCodexRunResponseSchema,
    {
      body: JSON.stringify(body),
      method: "POST",
    },
  );
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

async function markCodexRunRead(runId: string) {
  return requestJson(`/api/codex/runs/${runId}/read`, markCodexRunReadResponseSchema, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function App() {
  const queryClient = useQueryClient();
  const appShellRef = useRef<HTMLElement>(null);
  const initialRouteRef = useRef<AppRouteState>(readAppRouteState());
  const previousFileSelectionRef = useRef<{ id?: string; path?: string }>({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(
    initialRouteRef.current.workspaceId,
  );
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [preferredFilePath, setPreferredFilePath] = useState<string | undefined>(
    initialRouteRef.current.filePath,
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>(
    initialRouteRef.current.ticketId,
  );
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [ticketDetailMode, setTicketDetailMode] = useState<TicketDetailMode>(
    () => initialRouteRef.current.detailMode ?? readStoredTicketDetailMode(),
  );
  const [ticketDetailWidth, setTicketDetailWidth] = useState(readStoredTicketDetailWidth);
  const [isTicketDetailResizing, setIsTicketDetailResizing] = useState(false);
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });
  const selectedWorkspace = workspacesQuery.data?.workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const canLoadWorkspace = Boolean(selectedWorkspaceId && selectedWorkspace?.isAvailable);
  const documentSetsQuery = useQuery({
    enabled: canLoadWorkspace,
    queryKey: documentSetsKey(selectedWorkspaceId),
    queryFn: () => fetchDocumentSets(selectedWorkspaceId ?? ""),
  });
  const documentSets = documentSetsQuery.data?.sets ?? [];
  const allFiles = useMemo(
    () => documentSets.flatMap((documentSet) => documentSet.documents),
    [documentSets],
  );
  const selectedFileById = allFiles.find((file) => file.id === selectedFileId);
  const preferredFile = preferredFilePath
    ? allFiles.find(
        (file) =>
          file.workspaceRelativePath === preferredFilePath ||
          file.relativePath === preferredFilePath,
      )
    : undefined;
  const selectedFile = selectedFileById ?? preferredFile;
  const resolvedSelectedFileId = selectedFile?.id ?? selectedFileId;
  const selectedDocumentSet = documentSets.find((documentSet) =>
    documentSet.documents.some((file) => file.id === resolvedSelectedFileId),
  );
  const isTicketsDocument = selectedFile?.type === "tickets";
  const ticketQuery = useQuery({
    enabled: Boolean(canLoadWorkspace && resolvedSelectedFileId && isTicketsDocument),
    queryFn: () => fetchTicketDocument(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
    queryKey: ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
  });
  const markdownQuery = useQuery({
    enabled: Boolean(canLoadWorkspace && resolvedSelectedFileId && selectedFile && !isTicketsDocument),
    queryFn: () => fetchMarkdownDocument(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
    queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
  });
  const codexRunSummaryQuery = useQuery({
    enabled: Boolean(canLoadWorkspace && resolvedSelectedFileId && isTicketsDocument),
    queryFn: () => fetchCodexRunSummary(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
    queryKey: codexRunSummaryKey(selectedWorkspaceId, resolvedSelectedFileId),
    refetchInterval: 5_000,
  });
  const ticketsByStatus = useMemo(() => {
    const grouped = new Map<TicketStatus, TicketItem[]>(
      BOARD_STATUSES.map((status) => [status, []]),
    );

    for (const ticket of ticketQuery.data?.document.tickets ?? []) {
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
  }, [ticketQuery.data?.document.tickets]);
  const runSummaryByTicket = useMemo(() => {
    const summaries = new Map<string, CodexRunSummary>();

    for (const runSummary of codexRunSummaryQuery.data?.runs ?? []) {
      if (shouldShowRunOnTicketCard(runSummary)) {
        summaries.set(runSummary.ticketId, runSummary);
      }
    }

    return summaries;
  }, [codexRunSummaryQuery.data?.runs]);
  const selectedTicket = ticketQuery.data?.document.tickets.find(
    (ticket) => ticket.id === selectedTicketId,
  );
  const selectedTicketRunSummary = selectedTicketId
    ? runSummaryByTicket.get(selectedTicketId)
    : undefined;
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;
  const resizeSidebarFromClientX = useCallback((clientX: number) => {
    const shellLeft = appShellRef.current?.getBoundingClientRect().left ?? 0;
    setSidebarWidth(clampSidebarWidth(clientX - shellLeft));
  }, []);
  const resizeTicketDetailFromClientX = useCallback((clientX: number) => {
    setTicketDetailWidth(clampTicketDetailWidth(window.innerWidth - clientX));
  }, []);

  useEffect(() => {
    if (selectedWorkspaceId || !workspacesQuery.data) {
      return;
    }

    const lastWorkspace = workspacesQuery.data.workspaces.find(
      (workspace) =>
        workspace.id === workspacesQuery.data.lastWorkspaceId && workspace.isAvailable,
    );
    if (lastWorkspace) {
      setSelectedWorkspaceId(lastWorkspace.id);
    }
  }, [selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    if (!selectedWorkspaceId || documentSets.length === 0) {
      return;
    }

    const selectedFileExists = Boolean(selectedFileId && selectedFileById);
    if (selectedFileExists) {
      return;
    }

    const nextFile = preferredFile ?? documentSets[0]?.primaryFile;
    if (nextFile?.id && nextFile.id !== selectedFileId) {
      setSelectedFileId(nextFile.id);
    }
  }, [documentSets, preferredFile, selectedFileById, selectedFileId, selectedWorkspaceId]);

  useEffect(() => {
    const previousSelection = previousFileSelectionRef.current;
    const currentFilePath = selectedFile?.workspaceRelativePath ?? preferredFilePath;
    if (
      previousSelection.id &&
      previousSelection.id !== selectedFileId &&
      previousSelection.path &&
      previousSelection.path !== currentFilePath
    ) {
      setSelectedTicketId(undefined);
    }
    previousFileSelectionRef.current = {
      id: selectedFileId,
      path: currentFilePath,
    };
  }, [preferredFilePath, selectedFile?.workspaceRelativePath, selectedFileId]);

  useEffect(() => {
    if (selectedTicketId && ticketQuery.isSuccess && !selectedTicket) {
      setSelectedTicketId(undefined);
    }
  }, [selectedTicket, selectedTicketId, ticketQuery.isSuccess]);

  useEffect(() => {
    if (selectedFile && selectedFile.type !== "tickets" && selectedTicketId) {
      setSelectedTicketId(undefined);
    }
  }, [selectedFile, selectedTicketId]);

  useEffect(() => {
    const filePath = selectedFile?.workspaceRelativePath ?? preferredFilePath;
    replaceAppRoute({
      workspaceId: selectedWorkspaceId,
      filePath,
      ticketId: selectedTicketId,
      detailMode: selectedTicketId ? ticketDetailMode : undefined,
    });
  }, [
    preferredFilePath,
    selectedFile?.workspaceRelativePath,
    selectedTicketId,
    selectedWorkspaceId,
    ticketDetailMode,
  ]);

  useEffect(() => {
    function syncRouteFromLocation(): void {
      const route = readAppRouteState();
      setSelectedWorkspaceId(route.workspaceId);
      setPreferredFilePath(route.filePath);
      setSelectedFileId(undefined);
      setSelectedTicketId(route.ticketId);
      if (route.detailMode) {
        setTicketDetailMode(route.detailMode);
      }
    }

    window.addEventListener("hashchange", syncRouteFromLocation);
    window.addEventListener("popstate", syncRouteFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncRouteFromLocation);
      window.removeEventListener("popstate", syncRouteFromLocation);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // Ignore storage failures; the resize affordance still works for this session.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TICKET_DETAIL_MODE_STORAGE_KEY, ticketDetailMode);
    } catch {
      // Ignore storage failures; the detail presentation still works for this session.
    }
  }, [ticketDetailMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TICKET_DETAIL_WIDTH_STORAGE_KEY, String(ticketDetailWidth));
    } catch {
      // Ignore storage failures; the resize affordance still works for this session.
    }
  }, [ticketDetailWidth]);

  useEffect(() => {
    if (!isSidebarResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent): void {
      event.preventDefault();
      resizeSidebarFromClientX(event.clientX);
    }

    function finishResize(): void {
      setIsSidebarResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [isSidebarResizing, resizeSidebarFromClientX]);

  useEffect(() => {
    if (!isTicketDetailResizing || ticketDetailMode !== "side") {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent): void {
      event.preventDefault();
      resizeTicketDetailFromClientX(event.clientX);
    }

    function finishResize(): void {
      setIsTicketDetailResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [isTicketDetailResizing, resizeTicketDetailFromClientX, ticketDetailMode]);

  async function replaceDocument(data: TicketDocumentResponse): Promise<void> {
    queryClient.setQueryData(ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId), data);
    await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
  }

  async function refetchRunSummary(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: codexRunSummaryKey(selectedWorkspaceId, resolvedSelectedFileId),
    });
  }

  async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
    const response = await selectWorkspaceById(workspaceId);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(response.workspace.id);
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  async function handleWorkspaceOpenPath(root: string): Promise<void> {
    const response = await selectWorkspaceByRoot(root);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(response.workspace.id);
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  async function handlePatchTicket(
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
  ): Promise<void> {
    if (!selectedWorkspaceId || !resolvedSelectedFileId || !ticketQuery.data) {
      return;
    }

    await replaceDocument(
      await patchTicket(selectedWorkspaceId, resolvedSelectedFileId, ticketId, {
        status,
        progress,
        expectedHash: ticketQuery.data.file.hash,
        expectedMtimeMs: ticketQuery.data.file.mtimeMs,
      }),
    );
  }

  return (
    <>
      <main
        className="grid h-dvh min-h-0 grid-cols-[var(--sidebar-width)_8px_minmax(0,1fr)] overflow-hidden bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-secondary)] max-[860px]:h-auto max-[860px]:min-h-dvh max-[860px]:grid-cols-1 max-[860px]:overflow-visible"
        ref={appShellRef}
        style={shellStyle}
      >
        <aside
          className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--ak-hairline)] bg-[var(--ak-surface)] max-[860px]:max-h-[70dvh] max-[860px]:border-b max-[860px]:border-r-0"
          aria-label="Workspace files"
        >
          <div className="border-b border-[var(--ak-hairline)] px-5 py-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="size-5 text-[var(--ak-ink-muted)]" aria-hidden="true" />
              <h1 className="ak-title text-base">{APP_NAME}</h1>
            </div>
            <p className="ak-body-muted mt-1 text-xs">Plan-ticketing workspace</p>
          </div>

          <ProjectSwitcher
            isLoading={workspacesQuery.isLoading}
            onOpenPath={handleWorkspaceOpenPath}
            onSelect={handleWorkspaceSelect}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            workspaces={workspacesQuery.data?.workspaces ?? []}
          />

          <div className="border-b border-[var(--ak-hairline)] p-3">
            <div className="ak-control flex h-9 items-center gap-2 px-3 text-sm text-[var(--ak-ink-muted)]">
              <Search className="size-4" aria-hidden="true" />
              <span>Documents</span>
            </div>
          </div>

          <div className="ak-scroll-area min-h-0 flex-1 overflow-y-auto">
            <div className="ak-scroll-content grid gap-1">
              {!selectedWorkspaceId ? <SidebarState label="Select a project" /> : null}
              {selectedWorkspace && !selectedWorkspace.isAvailable ? (
                <SidebarState label="Project unavailable" tone="error" />
              ) : null}
              {documentSetsQuery.isLoading ? <SidebarState label="Loading documents" /> : null}
              {documentSetsQuery.isError ? (
                <SidebarState label="Could not load documents" tone="error" />
              ) : null}
              {documentSetsQuery.isSuccess && documentSets.length === 0 ? (
                <SidebarState label="No documents" />
              ) : null}
              <DocumentSetNavigator
                documentSets={documentSets}
                onSelectFile={(file) => {
                  setSelectedFileId(file.id);
                  setPreferredFilePath(file.workspaceRelativePath);
                  if (file.type !== "tickets") {
                    setSelectedTicketId(undefined);
                  }
                }}
                selectedFileId={resolvedSelectedFileId}
              />
            </div>
          </div>

          <div className="border-t border-[var(--ak-hairline)] p-3">
            <HealthPill status={healthQuery.status} />
          </div>
        </aside>

        <SidebarResizeHandle
          isDragging={isSidebarResizing}
          onChangeWidth={setSidebarWidth}
          onNudge={(delta) => setSidebarWidth((width) => clampSidebarWidth(width + delta))}
          onPointerDown={(clientX) => {
            resizeSidebarFromClientX(clientX);
            setIsSidebarResizing(true);
          }}
          onReset={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          width={sidebarWidth}
        />

        <section
          className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
          aria-labelledby="workspace-title"
        >
          <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-6 py-4 max-[720px]:flex-col max-[720px]:items-start">
            <div>
              <p className="ak-muted-label">
                {selectedWorkspace?.root ?? "Select a project"}
              </p>
              <h2 id="workspace-title" className="ak-title mt-1 text-xl">
                {ticketQuery.data?.document.title ??
                  markdownQuery.data?.outline[0]?.title ??
                  selectedFile?.workspaceRelativePath ??
                  "Document workspace"}
              </h2>
              {selectedFile ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <DocumentTypeBadge type={selectedFile.type} />
                  <p className="ak-body-muted text-xs">
                    {selectedFile.workspaceRelativePath}
                  </p>
                </div>
              ) : null}
            </div>
            <DocumentSummary
              file={ticketQuery.data?.file}
              fallbackFile={selectedFile}
              isLoading={
                selectedFile?.type === "tickets"
                  ? ticketQuery.isLoading
                  : markdownQuery.isLoading
              }
              markdownDocument={markdownQuery.data}
              runSummary={codexRunSummaryQuery.data}
              selectedDocumentSet={selectedDocumentSet}
              ticketCount={ticketQuery.data?.document.tickets.length ?? 0}
            />
          </header>

          <div className="ak-scroll-area min-h-0 overflow-auto p-5">
            <DocumentContent
              documentSetsError={documentSetsQuery.error}
              documentSetsIsError={documentSetsQuery.isError}
              documentSetsIsLoading={documentSetsQuery.isLoading}
              markdownDocument={markdownQuery.data}
              markdownError={markdownQuery.error}
              markdownIsError={markdownQuery.isError}
              markdownIsLoading={markdownQuery.isLoading}
              onFileSelect={(file) => {
                setSelectedFileId(file.id);
                setPreferredFilePath(file.workspaceRelativePath);
                if (file.type !== "tickets") {
                  setSelectedTicketId(undefined);
                }
              }}
              onTicketSelect={setSelectedTicketId}
              runSummaryByTicket={runSummaryByTicket}
              selectedDocumentSet={selectedDocumentSet}
              selectedFile={selectedFile}
              selectedFileId={resolvedSelectedFileId}
              selectedWorkspace={selectedWorkspace}
              ticketError={ticketQuery.error}
              ticketIsError={ticketQuery.isError}
              ticketIsLoading={ticketQuery.isLoading}
              workspaceError={workspacesQuery.error}
              workspacesError={workspacesQuery.isError}
              workspacesIsLoading={workspacesQuery.isLoading}
              ticketsByStatus={ticketsByStatus}
            />
          </div>
        </section>
      </main>

      {selectedTicket && resolvedSelectedFileId && ticketQuery.data ? (
        <TicketDetailDrawer
          availableTickets={ticketQuery.data.document.tickets}
          documentHash={ticketQuery.data.file.hash}
          documentMtimeMs={ticketQuery.data.file.mtimeMs}
          codexDisabledReason={selectedWorkspaceId ? undefined : "Select a workspace before running Codex."}
          fileId={resolvedSelectedFileId}
          isResizing={isTicketDetailResizing}
          mode={ticketDetailMode}
          onChangeMode={(mode) => {
            setTicketDetailMode(mode);
            setIsTicketDetailResizing(false);
          }}
          onClose={() => setSelectedTicketId(undefined)}
          onPatchTicket={handlePatchTicket}
          onReload={() => ticketQuery.refetch()}
          onRunDocumentChange={async () => {
            await ticketQuery.refetch();
            await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
          }}
          onRunStatusChange={refetchRunSummary}
          onRunRead={refetchRunSummary}
          onResizeNudge={(delta) =>
            setTicketDetailWidth((width) => clampTicketDetailWidth(width + delta))
          }
          onResizeReset={() => setTicketDetailWidth(DEFAULT_TICKET_DETAIL_WIDTH)}
          onResizeStart={(clientX) => {
            resizeTicketDetailFromClientX(clientX);
            setIsTicketDetailResizing(true);
          }}
          ticket={selectedTicket}
          ticketRunSummary={selectedTicketRunSummary}
          width={ticketDetailWidth}
          workspaceId={selectedWorkspaceId}
          documentRunSummary={codexRunSummaryQuery.data}
        />
      ) : null}
    </>
  );
}

function SidebarResizeHandle({
  isDragging,
  onChangeWidth,
  onNudge,
  onPointerDown,
  onReset,
  width,
}: {
  isDragging: boolean;
  onChangeWidth: (width: number) => void;
  onNudge: (delta: number) => void;
  onPointerDown: (clientX: number) => void;
  onReset: () => void;
  width: number;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudge(-24);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudge(24);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChangeWidth(MIN_SIDEBAR_WIDTH);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChangeWidth(MAX_SIDEBAR_WIDTH);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onReset();
    }
  }

  return (
    <button
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuenow={width}
      className={[
        "ak-focus-ring group relative h-full w-full cursor-col-resize border-x border-[var(--ak-hairline)] transition-colors max-[860px]:hidden",
        isDragging
          ? "bg-neutral-100"
          : "bg-[var(--ak-surface)] hover:bg-[var(--ak-canvas-soft)]",
      ].join(" ")}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.preventDefault();
        onPointerDown(event.clientX);
      }}
      role="separator"
      title="Drag to resize. Double-click to reset."
      type="button"
    >
      <span
        className={[
          "absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ak-ink-faint)] transition-colors group-hover:bg-[var(--ak-ink-muted)]",
          isDragging ? "bg-[var(--ak-ink-muted)]" : "",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}

function TicketDetailResizeHandle({
  isDragging,
  onChangeWidth,
  onNudge,
  onPointerDown,
  onReset,
  width,
}: {
  isDragging: boolean;
  onChangeWidth: (width: number) => void;
  onNudge: (delta: number) => void;
  onPointerDown: (clientX: number) => void;
  onReset: () => void;
  width: number;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudge(24);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudge(-24);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChangeWidth(MIN_TICKET_DETAIL_WIDTH);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChangeWidth(MAX_TICKET_DETAIL_WIDTH);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onReset();
    }
  }

  return (
    <button
      aria-label="Resize ticket detail panel"
      aria-orientation="vertical"
      aria-valuemax={MAX_TICKET_DETAIL_WIDTH}
      aria-valuemin={MIN_TICKET_DETAIL_WIDTH}
      aria-valuenow={width}
      className={[
        "ak-focus-ring group absolute inset-y-0 left-0 z-10 w-3 -translate-x-1/2 cursor-col-resize transition-colors max-[720px]:hidden",
        isDragging ? "bg-[var(--ak-surface-active)]" : "hover:bg-[var(--ak-surface-hover)]",
      ].join(" ")}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.preventDefault();
        onPointerDown(event.clientX);
      }}
      role="separator"
      title="Drag to resize. Double-click to reset."
      type="button"
    >
      <span
        className={[
          "absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ak-ink-faint)] transition-colors group-hover:bg-[var(--ak-ink-muted)]",
          isDragging ? "bg-[var(--ak-ink-muted)]" : "",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}

function DocumentSetNavigator({
  documentSets,
  onSelectFile,
  selectedFileId,
}: {
  documentSets: DocumentSetSummary[];
  onSelectFile: (file: MarkdownFileSummary) => void;
  selectedFileId?: string;
}) {
  return (
    <nav className="grid gap-1" aria-label="Documents">
      {documentSets.map((documentSet) => (
        <DocumentSetRow
          documentSet={documentSet}
          key={documentSet.id}
          onSelectFile={onSelectFile}
          selectedFileId={selectedFileId}
        />
      ))}
    </nav>
  );
}

function DocumentSetRow({
  documentSet,
  onSelectFile,
  selectedFileId,
}: {
  documentSet: DocumentSetSummary;
  onSelectFile: (file: MarkdownFileSummary) => void;
  selectedFileId?: string;
}) {
  const isSelected = documentSet.documents.some((file) => file.id === selectedFileId);

  return (
    <section
      className={[
        "ak-row grid min-w-0 gap-2 px-3 py-2 transition-colors",
        isSelected ? "ak-row-active" : "",
      ].join(" ")}
      title={documentSet.documents.map((file) => file.relativePath).join("\n")}
    >
      <div className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-[var(--ak-ink)]">
              {documentSet.label}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {documentSet.documents.length === 1 ? (
                <Badge variant="outline">standalone</Badge>
              ) : null}
              {documentSet.ticketProgress?.totalTickets !== undefined ? (
                <Badge variant="muted">
                  {documentSet.ticketProgress.doneTickets ?? 0}/
                  {documentSet.ticketProgress.totalTickets}
                </Badge>
              ) : null}
            </span>
          </div>
          <span className="ak-body-muted block truncate text-xs">
            {documentSet.directory || "docs root"}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1 pl-6">
        {documentSet.documents.map((file) => (
          <DocumentTypeButton
            file={file}
            isSelected={file.id === selectedFileId}
            key={file.id}
            onSelect={() => onSelectFile(file)}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentTypeButton({
  file,
  isSelected,
  onSelect,
}: {
  file: MarkdownFileSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = documentTypeIcon(file.type);

  return (
    <button
      className={[
        "ak-focus-ring inline-flex h-7 min-w-0 items-center gap-1 rounded-[var(--ak-radius-sm)] border px-1.5 text-[11px] font-medium transition-colors",
        isSelected
          ? "border-[var(--ak-primary)] bg-blue-50 text-[var(--ak-primary)]"
          : "border-[var(--ak-hairline)] bg-[var(--ak-surface)] text-[var(--ak-ink-muted)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
      ].join(" ")}
      onClick={onSelect}
      title={file.relativePath}
      type="button"
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{documentTypeLabel(file.type)}</span>
    </button>
  );
}

function ProjectSwitcher({
  isLoading,
  onOpenPath,
  onSelect,
  selectedWorkspace,
  selectedWorkspaceId,
  workspaces,
}: {
  isLoading: boolean;
  onOpenPath: (root: string) => Promise<void>;
  onSelect: (workspaceId: string) => Promise<void>;
  selectedWorkspace?: WorkspaceSummary;
  selectedWorkspaceId?: string;
  workspaces: WorkspaceSummary[];
}) {
  const [pathDraft, setPathDraft] = useState("");
  const [browseRoot, setBrowseRoot] = useState<string | undefined>();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isOpeningPath, setIsOpeningPath] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const directoriesQuery = useQuery({
    enabled: isBrowserOpen,
    queryKey: workspaceDirectoriesKey(browseRoot),
    queryFn: () => fetchWorkspaceDirectories(browseRoot),
  });
  const recentWorkspaces = workspaces.filter((workspace) => workspace.lastOpenedAt);
  const discoveredWorkspaces = workspaces.filter((workspace) => !workspace.lastOpenedAt);

  async function openPath(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const root = pathDraft.trim();
    if (!root) {
      return;
    }

    await openWorkspaceRoot(root, { clearDraft: true });
  }

  async function openWorkspaceRoot(
    root: string,
    options: { clearDraft?: boolean } = {},
  ): Promise<void> {
    const nextRoot = root.trim();
    if (!nextRoot) {
      return;
    }

    setIsOpeningPath(true);
    setError(null);
    try {
      await onOpenPath(nextRoot);
      if (options.clearDraft) {
        setPathDraft("");
      }
      setIsSwitcherOpen(false);
      setIsBrowserOpen(false);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsOpeningPath(false);
    }
  }

  return (
    <section className="border-b border-[var(--ak-hairline)] p-3" aria-label="Projects">
      <button
        className="ak-row grid w-full min-w-0 gap-1 px-3 py-2 text-left transition-colors hover:bg-[var(--ak-surface-hover)]"
        onClick={() => setIsSwitcherOpen(true)}
        title={selectedWorkspace?.root ?? "Select a project"}
        type="button"
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="ak-muted-label">Project</span>
          {isLoading ? (
            <Loader2 className="size-3 animate-spin text-[var(--ak-ink-muted)]" />
          ) : (
            <ChevronDown className="size-3 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          )}
        </span>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-[var(--ak-ink)]">
            {selectedWorkspace?.label ?? "Select project"}
          </span>
          {selectedWorkspace ? (
            <Badge variant={selectedWorkspace.isAvailable ? "muted" : "warning"}>
              {selectedWorkspace.isAvailable
                ? selectedWorkspace.hasDocs
                  ? "docs"
                  : "empty"
                : "missing"}
            </Badge>
          ) : null}
        </span>
        {selectedWorkspace ? (
          <span className="ak-body-muted truncate text-xs">{selectedWorkspace.root}</span>
        ) : (
          <span className="ak-body-muted text-xs">Open recent or browse a workspace</span>
        )}
      </button>

      <Dialog onOpenChange={setIsSwitcherOpen} open={isSwitcherOpen}>
        <DialogContent className="h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)]">
          <DialogHeader className="pr-12">
            <DialogTitle>Switch project</DialogTitle>
            <DialogDescription>
              Select a workspace or open a folder inside the configured roots.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-2 border-y border-[var(--ak-hairline)] py-3" onSubmit={(event) => void openPath(event)}>
            <div className="flex items-center justify-between gap-2">
              <label
                className="ak-muted-label"
                htmlFor="workspace-root-input"
              >
                Open path
              </label>
              <Button
                onClick={() => {
                  setIsSwitcherOpen(false);
                  setIsBrowserOpen(true);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Folder className="size-3" aria-hidden="true" />
                Browse
              </Button>
            </div>
            <div className="flex min-w-0 gap-2">
              <input
                aria-describedby={error ? "workspace-root-error" : undefined}
                className="ak-control-field h-9 min-w-0 flex-1 px-3 text-sm placeholder:text-[var(--ak-ink-faint)] disabled:bg-[var(--ak-canvas-soft)] disabled:text-[var(--ak-ink-faint)]"
                disabled={isOpeningPath}
                id="workspace-root-input"
                onChange={(event) => {
                  setPathDraft(event.target.value);
                  setError(null);
                }}
                placeholder="/Users/.../project"
                value={pathDraft}
              />
              <Button
                className="shrink-0"
                disabled={!pathDraft.trim() || isOpeningPath}
                size="sm"
                type="submit"
                variant="outline"
              >
                {isOpeningPath ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderKanban className="size-3" aria-hidden="true" />
                )}
                Open
              </Button>
            </div>
            {error ? (
              <p
                className="break-words rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700"
                id="workspace-root-error"
              >
                {formatClientError(error)}
              </p>
            ) : null}
          </form>

          <div className="ak-scroll-area min-h-0 overflow-y-auto">
            <div className="grid gap-4 pr-2">
              {selectedWorkspace ? (
                <div className="grid gap-1">
                  <p className="ak-muted-label px-3">Current</p>
                  <WorkspaceButton
                    isSelected
                    onSelect={async () => setIsSwitcherOpen(false)}
                    workspace={selectedWorkspace}
                  />
                </div>
              ) : null}
              {recentWorkspaces.length > 0 ? (
                <WorkspaceGroup
                  label="Recent"
                  onSelect={async (workspaceId) => {
                    await onSelect(workspaceId);
                    setIsSwitcherOpen(false);
                  }}
                  selectedWorkspaceId={selectedWorkspaceId}
                  workspaces={recentWorkspaces}
                />
              ) : null}
              <WorkspaceGroup
                label={recentWorkspaces.length > 0 ? "Discovered" : "Available"}
                onSelect={async (workspaceId) => {
                  await onSelect(workspaceId);
                  setIsSwitcherOpen(false);
                }}
                selectedWorkspaceId={selectedWorkspaceId}
                workspaces={discoveredWorkspaces}
              />
              {!isLoading && workspaces.length === 0 ? (
                <p className="ak-body-muted px-3 py-3 text-sm">No projects found</p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FolderPickerDialog
        data={directoriesQuery.data}
        error={directoriesQuery.isError ? normalizeClientError(directoriesQuery.error) : null}
        isLoading={directoriesQuery.isLoading}
        isOpening={isOpeningPath}
        onBrowse={(root) => {
          setError(null);
          setBrowseRoot(root);
        }}
        onOpen={(root) => void openWorkspaceRoot(root)}
        onOpenChange={setIsBrowserOpen}
        open={isBrowserOpen}
      />
    </section>
  );
}

function FolderPickerDialog({
  data,
  error,
  isLoading,
  isOpening,
  onBrowse,
  onOpen,
  onOpenChange,
  open,
}: {
  data?: WorkspaceDirectoriesResponse;
  error: ClientApiError | Error | null;
  isLoading: boolean;
  isOpening: boolean;
  onBrowse: (root: string | undefined) => void;
  onOpen: (root: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const currentDirectory = data?.directory;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[min(720px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="pr-12">
          <DialogTitle>Select workspace folder</DialogTitle>
          <DialogDescription className="sr-only">
            Select a folder inside the configured workspace roots.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[190px_minmax(0,1fr)] border-y border-[var(--ak-hairline)] max-[720px]:grid-cols-1">
          <aside className="min-h-0 border-r border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] p-3 max-[720px]:border-b max-[720px]:border-r-0">
            <p className="ak-muted-label mb-2 px-1">Roots</p>
            <div className="grid gap-1 max-[720px]:grid-cols-2">
              {data?.roots.map((root) => (
                <DirectoryRootButton
                  isSelected={isRootSelected(root, currentDirectory?.path)}
                  key={root.path}
                  onBrowse={() => onBrowse(root.path)}
                  root={root}
                />
              ))}
              {!isLoading && data?.roots.length === 0 ? (
                <p className="ak-body-muted px-2 py-3 text-sm">No roots configured</p>
              ) : null}
            </div>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--ak-surface)]">
            <div className="grid gap-3 border-b border-[var(--ak-hairline)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  aria-label="Parent folder"
                  disabled={!currentDirectory?.parentPath || isLoading}
                  onClick={() => onBrowse(currentDirectory?.parentPath)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <div className="ak-control flex h-9 min-w-0 flex-1 items-center gap-2 px-3 text-sm">
                  <Folder className="size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
                  <span className="truncate">{currentDirectory?.path ?? "Loading"}</span>
                </div>
              </div>
              {currentDirectory ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={currentDirectory.hasDocs ? "muted" : "outline"}>
                    {currentDirectory.hasDocs ? "docs" : "empty"}
                  </Badge>
                  {currentDirectory.isWorkspaceCandidate ? (
                    <Badge variant="success">project</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="ak-scroll-area min-h-0 overflow-auto">
              <div className="grid min-w-[700px] grid-cols-[minmax(190px,1.25fr)_150px_minmax(300px,2fr)] border-b border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] px-3 py-2 ak-muted-label">
                <span>Name</span>
                <span>Type</span>
                <span>Path</span>
              </div>
              {isLoading ? (
                <div className="ak-body-muted flex items-center gap-2 px-4 py-5 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading folders
                </div>
              ) : null}
              {error ? (
                <p className="m-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formatClientError(error)}
                </p>
              ) : null}
              {currentDirectory?.children.map((entry) => (
                <DirectoryEntryButton
                  entry={entry}
                  key={entry.path}
                  onBrowse={() => onBrowse(entry.path)}
                />
              ))}
              {!isLoading && currentDirectory?.children.length === 0 ? (
                <p className="ak-panel-muted m-3 border-dashed px-3 py-8 text-center text-sm text-[var(--ak-ink-muted)]">
                  Empty folder
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter className="max-[720px]:flex-col max-[720px]:items-stretch">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!currentDirectory?.path || isOpening}
            onClick={() => onOpen(currentDirectory?.path ?? "")}
            type="button"
          >
            {isOpening ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FolderKanban className="size-4" aria-hidden="true" />
            )}
            Select Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DirectoryRootButton({
  isSelected,
  onBrowse,
  root,
}: {
  isSelected: boolean;
  onBrowse: () => void;
  root: WorkspaceDirectoryRoot;
}) {
  return (
    <button
      className={[
        "ak-row min-w-0 border px-3 py-2 text-left transition-colors",
        isSelected
          ? "ak-row-active border-[var(--ak-hairline)]"
          : "border-transparent hover:border-[var(--ak-hairline)]",
      ].join(" ")}
      onClick={onBrowse}
      title={root.path}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Folder className="size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ak-ink)]">
            {root.label}
          </span>
          <span className="ak-body-muted block truncate text-[11px]">{root.path}</span>
        </span>
      </span>
    </button>
  );
}

function DirectoryEntryButton({
  entry,
  onBrowse,
}: {
  entry: WorkspaceDirectoryEntry;
  onBrowse: () => void;
}) {
  return (
    <button
      className="grid min-h-11 min-w-[700px] grid-cols-[minmax(190px,1.25fr)_150px_minmax(300px,2fr)] items-center border-b border-[var(--ak-hairline)] px-3 text-left text-sm transition-colors hover:bg-[var(--ak-surface-hover)]"
      onClick={onBrowse}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Folder className="size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
        <span className="truncate font-medium text-[var(--ak-ink)]">{entry.name}</span>
      </span>
      <span className="flex min-w-0 gap-1 overflow-hidden">
        {entry.isWorkspaceCandidate ? <Badge variant="success">project</Badge> : null}
        <Badge variant={entry.hasDocs ? "muted" : "outline"}>
          {entry.hasDocs ? "docs" : "empty"}
        </Badge>
      </span>
      <span className="ak-body-muted truncate text-xs">{entry.path}</span>
    </button>
  );
}

function isRootSelected(root: WorkspaceDirectoryRoot, currentPath?: string): boolean {
  return Boolean(
    currentPath && (currentPath === root.path || currentPath.startsWith(`${root.path}/`)),
  );
}

function WorkspaceGroup({
  label,
  onSelect,
  selectedWorkspaceId,
  workspaces,
}: {
  label: string;
  onSelect: (workspaceId: string) => Promise<void>;
  selectedWorkspaceId?: string;
  workspaces: WorkspaceSummary[];
}) {
  if (workspaces.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1">
      <p className="ak-muted-label px-3">{label}</p>
      {workspaces.map((workspace) => (
        <WorkspaceButton
          isSelected={workspace.id === selectedWorkspaceId}
          key={workspace.id}
          onSelect={() => onSelect(workspace.id)}
          workspace={workspace}
        />
      ))}
    </div>
  );
}

function WorkspaceButton({
  isSelected,
  onSelect,
  workspace,
}: {
  isSelected: boolean;
  onSelect: () => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <button
      className={[
        "ak-row grid min-h-14 min-w-0 gap-1 px-3 py-2 text-left transition-colors",
        isSelected ? "ak-row-active" : "",
        workspace.isAvailable ? "" : "opacity-70",
      ].join(" ")}
      disabled={!workspace.isAvailable}
      onClick={() => void onSelect()}
      title={workspace.root}
      type="button"
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-[var(--ak-ink)]">
          {workspace.label}
        </span>
        <Badge variant={workspace.isAvailable ? "muted" : "warning"}>
          {workspace.isAvailable ? (workspace.hasDocs ? "docs" : "empty") : "missing"}
        </Badge>
      </span>
      <span className="ak-body-muted break-all text-xs leading-4">{workspace.root}</span>
    </button>
  );
}

function SidebarState({ label, tone = "muted" }: { label: string; tone?: "error" | "muted" }) {
  return (
    <div
      className={[
        "m-2 rounded-[var(--ak-radius-md)] border px-3 py-2 text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-muted)]",
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
    <div className="ak-control inline-flex w-full items-center gap-2 px-3 py-2 text-xs font-medium">
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

function DocumentSummary({
  fallbackFile,
  file,
  isLoading,
  markdownDocument,
  runSummary,
  selectedDocumentSet,
  ticketCount,
}: {
  fallbackFile?: MarkdownFileSummary;
  file?: MarkdownFileSummary;
  isLoading: boolean;
  markdownDocument?: MarkdownDocumentResponse;
  runSummary?: CodexDocumentRunSummaryResponse;
  selectedDocumentSet?: DocumentSetSummary;
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

  const displayFile = file ?? markdownDocument?.file ?? fallbackFile;

  if (!displayFile) {
    return <Badge variant="muted">No document</Badge>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2 max-[720px]:justify-start">
      {runSummary ? <DocumentRunSignalBadge runSummary={runSummary} /> : null}
      <DocumentTypeBadge type={displayFile.type} />
      {displayFile.type === "tickets" ? (
        <Badge variant="outline">{ticketCount} tickets</Badge>
      ) : null}
      {selectedDocumentSet?.ticketProgress?.totalTickets !== undefined ? (
        <Badge variant="outline">
          {selectedDocumentSet.ticketProgress.doneTickets ?? 0}/
          {selectedDocumentSet.ticketProgress.totalTickets} tickets
        </Badge>
      ) : null}
      <Badge variant="muted">{new Date(displayFile.mtimeMs).toLocaleDateString()}</Badge>
    </div>
  );
}

function DocumentContent({
  documentSetsError,
  documentSetsIsError,
  documentSetsIsLoading,
  markdownDocument,
  markdownError,
  markdownIsError,
  markdownIsLoading,
  onFileSelect,
  onTicketSelect,
  runSummaryByTicket,
  selectedDocumentSet,
  selectedFile,
  selectedFileId,
  selectedWorkspace,
  ticketError,
  ticketIsError,
  ticketIsLoading,
  ticketsByStatus,
  workspaceError,
  workspacesError,
  workspacesIsLoading,
}: {
  documentSetsError: Error | null;
  documentSetsIsError: boolean;
  documentSetsIsLoading: boolean;
  markdownDocument?: MarkdownDocumentResponse;
  markdownError: Error | null;
  markdownIsError: boolean;
  markdownIsLoading: boolean;
  onFileSelect: (file: MarkdownFileSummary) => void;
  onTicketSelect: (ticketId: string) => void;
  runSummaryByTicket: Map<string, CodexRunSummary>;
  selectedDocumentSet?: DocumentSetSummary;
  selectedFile?: MarkdownFileSummary;
  selectedFileId?: string;
  selectedWorkspace?: WorkspaceSummary;
  ticketError: Error | null;
  ticketIsError: boolean;
  ticketIsLoading: boolean;
  ticketsByStatus: Map<TicketStatus, TicketItem[]>;
  workspaceError: Error | null;
  workspacesError: boolean;
  workspacesIsLoading: boolean;
}) {
  if (workspacesIsLoading || documentSetsIsLoading) {
    return <BoardState isLoading title="Loading documents" />;
  }

  if (workspacesError) {
    return (
      <BoardState
        icon="error"
        title="Could not load projects"
        description={workspaceError?.message ?? "Unknown API error"}
      />
    );
  }

  if (documentSetsIsError) {
    return (
      <BoardState
        icon="error"
        title="Could not load documents"
        description={documentSetsError?.message ?? "Unknown API error"}
      />
    );
  }

  if (!selectedWorkspace) {
    return (
      <BoardState
        title="Select a project"
        description="Choose a workspace from the project switcher to load ticket documents."
      />
    );
  }

  if (!selectedWorkspace.isAvailable) {
    return (
      <BoardState
        icon="error"
        title="Project unavailable"
        description="Select another available project from the project switcher."
      />
    );
  }

  if (!selectedFileId) {
    return <BoardState title="No document selected" />;
  }

  if (!selectedFile) {
    return <BoardState title="Document unavailable" />;
  }

  if (selectedFile.type !== "tickets") {
    return (
      <MarkdownDocumentReader
        document={markdownDocument}
        documentSet={selectedDocumentSet}
        error={markdownError}
        file={selectedFile}
        isError={markdownIsError}
        isLoading={markdownIsLoading}
        onFileSelect={onFileSelect}
      />
    );
  }

  if (ticketIsLoading) {
    return <BoardState isLoading title="Loading ticket board" />;
  }

  if (ticketIsError) {
    return (
      <BoardState
        icon="error"
        title="Could not load ticket board"
        description={ticketError?.message ?? "Unknown API error"}
      />
    );
  }

  return (
    <div className="grid min-w-[900px] grid-cols-6 gap-3" aria-label="Ticket kanban board">
      {BOARD_STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          onTicketSelect={onTicketSelect}
          runSummaryByTicket={runSummaryByTicket}
          status={status}
          tickets={ticketsByStatus.get(status) ?? []}
        />
      ))}
    </div>
  );
}

function MarkdownDocumentReader({
  document,
  documentSet,
  error,
  file,
  isError,
  isLoading,
  onFileSelect,
}: {
  document?: MarkdownDocumentResponse;
  documentSet?: DocumentSetSummary;
  error: Error | null;
  file: MarkdownFileSummary;
  isError: boolean;
  isLoading: boolean;
  onFileSelect: (file: MarkdownFileSummary) => void;
}) {
  if (isLoading) {
    return <BoardState isLoading title={`Loading ${documentTypeLabel(file.type)}`} />;
  }

  if (isError || !document) {
    return (
      <BoardState
        icon="error"
        title="Could not load document"
        description={error?.message ?? "Unknown API error"}
      />
    );
  }

  const headingIdsByLine = createHeadingIdsByLine(document.outline);

  return (
    <div className="grid h-full min-h-0 min-w-[840px] grid-cols-[260px_minmax(0,1fr)] items-stretch gap-4 max-[960px]:h-auto max-[960px]:min-w-0 max-[960px]:grid-cols-1">
      <aside className="ak-panel flex min-h-0 flex-col overflow-hidden max-[960px]:max-h-[40dvh]">
        <div className="shrink-0 border-b border-[var(--ak-hairline)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentTypeBadge type={file.type} />
            {file.sequenceNumber !== undefined ? (
              <Badge variant="muted">#{file.sequenceNumber}</Badge>
            ) : null}
          </div>
          <h3 className="ak-title mt-2 truncate text-sm" title={documentSet?.label ?? file.slug}>
            {documentSet?.label ?? file.slug}
          </h3>
          <p className="ak-body-muted mt-1 break-all text-xs">{file.workspaceRelativePath}</p>
        </div>

        <div className="ak-scroll-area grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
          <section className="grid gap-2">
            <h4 className="ak-muted-label">Linked docs</h4>
            <div className="grid gap-1">
              {(documentSet?.documents ?? [file]).map((linkedFile) => (
                <button
                  className={[
                    "ak-row flex min-w-0 items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                    linkedFile.id === file.id ? "ak-row-active" : "",
                  ].join(" ")}
                  key={linkedFile.id}
                  onClick={() => onFileSelect(linkedFile)}
                  title={linkedFile.relativePath}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {(() => {
                      const Icon = documentTypeIcon(linkedFile.type);
                      return <Icon className="size-3 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />;
                    })()}
                    <span className="truncate">{documentTypeLabel(linkedFile.type)}</span>
                  </span>
                  {linkedFile.id === file.id ? <Check className="size-3" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </section>

          {documentSet?.ticketProgress?.totalTickets !== undefined ? (
            <section className="grid gap-2">
              <h4 className="ak-muted-label">Ticket progress</h4>
              <div className="ak-panel-muted px-3 py-2 text-sm">
                <span className="font-medium text-[var(--ak-ink)]">
                  {documentSet.ticketProgress.doneTickets ?? 0}
                </span>
                <span className="text-[var(--ak-ink-muted)]">
                  {" "}
                  / {documentSet.ticketProgress.totalTickets} tickets done
                </span>
              </div>
            </section>
          ) : null}

          <section className="grid gap-2">
            <h4 className="ak-muted-label">Outline</h4>
            {document.outline.length > 0 ? (
              <ol className="grid gap-1 text-xs leading-5 text-[var(--ak-ink-muted)]">
                {document.outline.map((heading) => {
                  const headingId = headingIdsByLine[heading.line];
                  return (
                  <li
                    className="min-w-0"
                    key={`${heading.line}-${heading.title}`}
                    style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 8}px` }}
                  >
                    <button
                      className="ak-focus-ring grid w-full min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2 rounded-[var(--ak-radius-sm)] px-1 py-1 text-left transition-colors hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]"
                      onClick={() => scrollToMarkdownHeading(headingId)}
                      title={heading.title}
                      type="button"
                    >
                      <span className="text-[var(--ak-ink-faint)]">L{heading.line}</span>
                      <span className="truncate">{heading.title}</span>
                    </button>
                  </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-[var(--ak-ink-faint)]">No headings</p>
            )}
          </section>
        </div>
      </aside>

      <article className="ak-panel flex min-h-0 min-w-0 flex-col overflow-hidden max-[960px]:h-[calc(100dvh-10rem)]">
        <div className="shrink-0 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-5 py-4">
          <p className="ak-muted-label">{documentTypeLabel(file.type)} reader</p>
          <h3 className="ak-title mt-1 break-words text-lg">
            {document.outline[0]?.title ?? file.filename}
          </h3>
        </div>
        <div className="ak-scroll-area min-h-0 flex-1 overflow-auto px-5 py-4">
          <MarkdownMessage content={document.markdown} headingIdsByLine={headingIdsByLine} />
        </div>
      </article>
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
    <div className="ak-panel grid min-h-96 place-items-center border-dashed">
      <div className="grid max-w-md justify-items-center gap-3 px-6 text-center">
        {isLoading ? (
          <Loader2 className="size-6 animate-spin text-[var(--ak-ink-muted)]" aria-hidden="true" />
        ) : (
          <Icon className="size-6 text-[var(--ak-ink-muted)]" aria-hidden="true" />
        )}
        <h3 className="ak-title text-sm">{title}</h3>
        {description ? <p className="ak-body-muted text-sm">{description}</p> : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  onTicketSelect,
  runSummaryByTicket,
  status,
  tickets,
}: {
  onTicketSelect: (ticketId: string) => void;
  runSummaryByTicket: Map<string, CodexRunSummary>;
  status: TicketStatus;
  tickets: TicketItem[];
}) {
  return (
    <section className="ak-panel-muted min-h-[calc(100vh-8rem)] overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <h3 className="ak-muted-label truncate">{status}</h3>
        </div>
        <Badge variant="muted">{tickets.length}</Badge>
      </header>
      <div className="grid gap-2 p-2">
        {tickets.length === 0 ? (
          <div className="rounded-[var(--ak-radius-md)] border border-dashed border-[var(--ak-hairline)] px-3 py-8 text-center text-xs text-[var(--ak-ink-muted)]">
            Empty
          </div>
        ) : null}
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            onSelect={() => onTicketSelect(ticket.id)}
            runSummary={runSummaryByTicket.get(ticket.id)}
            ticket={ticket}
          />
        ))}
      </div>
    </section>
  );
}

function TicketCard({
  onSelect,
  runSummary,
  ticket,
}: {
  onSelect: () => void;
  runSummary?: CodexRunSummary;
  ticket: TicketItem;
}) {
  return (
    <article className="ak-card transition-colors hover:border-[rgba(0,0,0,0.18)] hover:bg-[rgba(255,255,255,0.92)]">
      <button
        aria-label={`Open ${ticket.id}`}
        className="block w-full p-3 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <Badge variant="outline">{ticket.id}</Badge>
            {runSummary ? <RunSignalBadge compact run={runSummary} /> : null}
          </div>
          <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
        </div>
        <h4 className="mt-2 line-clamp-3 break-words text-sm font-medium leading-5 text-[var(--ak-ink)]">
          {ticket.title}
        </h4>
        <div className="ak-body-muted mt-3 grid gap-1.5 text-xs">
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
  availableTickets,
  codexDisabledReason,
  documentRunSummary,
  documentHash,
  documentMtimeMs,
  fileId,
  isResizing,
  mode,
  onChangeMode,
  onClose,
  onPatchTicket,
  onReload,
  onRunDocumentChange,
  onRunRead,
  onRunStatusChange,
  onResizeNudge,
  onResizeReset,
  onResizeStart,
  ticket,
  ticketRunSummary,
  width,
  workspaceId,
}: {
  availableTickets: TicketItem[];
  codexDisabledReason?: string;
  documentRunSummary?: CodexDocumentRunSummaryResponse;
  documentHash: string;
  documentMtimeMs: number;
  fileId: string;
  isResizing: boolean;
  mode: TicketDetailMode;
  onChangeMode: (mode: TicketDetailMode) => void;
  onClose: () => void;
  onPatchTicket: (
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
  ) => Promise<void>;
  onReload: () => Promise<unknown>;
  onRunDocumentChange: () => Promise<unknown>;
  onRunRead: () => Promise<unknown>;
  onRunStatusChange: () => Promise<unknown>;
  onResizeNudge: (delta: number) => void;
  onResizeReset: () => void;
  onResizeStart: (clientX: number) => void;
  ticket: TicketItem;
  ticketRunSummary?: CodexRunSummary;
  width: number;
  workspaceId?: string;
}) {
  const [statusDraft, setStatusDraft] = useState<TicketStatus>(ticket.status);
  const [progressDraft, setProgressDraft] = useState<TicketProgress>(ticket.progress);
  const [runDraft, setRunDraft] = useState("");
  const [runMode, setRunMode] = useState<CodexRunMode>("edit");
  const [preview, setPreview] = useState<CodexPromptPreviewResponse | null>(null);
  const [run, setRun] = useState<CodexRunSnapshot | null>(null);
  const [runEvents, setRunEvents] = useState<CodexRunEvent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const ticketChatQuery = useQuery({
    enabled: Boolean(workspaceId && fileId && ticket.id),
    queryFn: () => fetchTicketChat(workspaceId ?? "", fileId, ticket.id),
    queryKey: ticketChatKey(workspaceId, fileId, ticket.id),
    refetchInterval: run?.status === "running" ? 5_000 : false,
  });

  useEffect(() => {
    setStatusDraft(ticket.status);
    setProgressDraft(ticket.progress);
    setRunDraft("");
    setRunMode("edit");
    setPreview(null);
    setError(null);
  }, [ticket.id, ticket.progress, ticket.status]);

  useEffect(() => {
    if (!ticketRunSummary?.id) {
      setRun(null);
      setRunEvents([]);
      return;
    }

    if (run?.id === ticketRunSummary.id) {
      return;
    }

    void fetchCodexRun(ticketRunSummary.id)
      .then((response) => {
        setRun(response.run);
        setRunEvents(response.run.events);
      })
      .catch((nextError: unknown) => setError(normalizeClientError(nextError)));
  }, [run?.id, ticketRunSummary?.id]);

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
          void onRunStatusChange();
          void onRunDocumentChange();
          void ticketChatQuery.refetch();
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
        await previewCodexPrompt(workspaceId ?? "", {
          fileId,
          ticketId: ticket.id,
          instructionDraft: runDraft.trim() || undefined,
          mode: runMode,
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
      const response = await startCodexRun(workspaceId ?? "", {
        expectedHash: documentHash,
        expectedMtimeMs: documentMtimeMs,
        fileId,
        ticketId: ticket.id,
        instructionDraft: runDraft.trim() || undefined,
        mode: runMode,
      });
      setRun(response.run);
      setRunEvents(response.run.events);
      setPreview({
        fileId: response.run.fileId,
        ticketId: response.run.ticketId,
        prompt: response.run.prompt,
        command: response.run.command,
        args: response.run.args,
        mode: response.run.mode,
        resumeSessionId: response.run.resumeSessionId,
        scopeResolution: response.run.scopeResolution,
        statePath: "",
      });
      await onRunDocumentChange();
      await onRunStatusChange();
      await ticketChatQuery.refetch();
      setRunDraft("");
    } catch (nextError) {
      const normalizedError = normalizeClientError(nextError);
      setError(normalizedError);
      if (
        normalizedError instanceof ClientApiError &&
        normalizedError.code === "CODEX_DOCUMENT_RUN_ACTIVE"
      ) {
        await onRunStatusChange();
      }
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
      await onRunStatusChange();
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsCancelling(false);
    }
  }

  async function markRunRead(): Promise<void> {
    if (!ticketRunSummary) {
      return;
    }

    setIsMarkingRead(true);
    setError(null);
    try {
      await markCodexRunRead(ticketRunSummary.id);
      await onRunRead();
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsMarkingRead(false);
    }
  }

  const canSaveStatus = statusDraft !== ticket.status || progressDraft !== ticket.progress;
  const latestErrorCode = error instanceof ClientApiError ? error.code : undefined;
  const activeRun = documentRunSummary?.activeRun;
  const scopeResolution = useMemo(
    () =>
      resolveCodexChatScope({
        defaultScope: "ticket",
        rawMessage: runDraft,
        targetFileId: fileId,
        targetTicketId: ticket.id,
        targetWorkspaceId: workspaceId ?? "",
      }),
    [fileId, runDraft, ticket.id, workspaceId],
  );
  const scopeWarnings = codexChatScopeRunWarnings(scopeResolution, runMode);
  const isScopeAllowed = isCodexChatScopeRunAllowed(scopeResolution, runMode);
  const canUseCodex = !codexDisabledReason;
  const canStartCodexRun =
    canUseCodex && (documentRunSummary?.canStartRun ?? true) && isScopeAllowed;
  const panelStyle = {
    "--ticket-detail-width": `${width}px`,
  } as CSSProperties;
  const panelClassName =
    mode === "side"
      ? "absolute inset-y-0 right-0 flex w-[min(var(--ticket-detail-width),100vw)] flex-col overflow-clip border-l border-[var(--ak-hairline)] bg-[var(--ak-surface)] shadow-[var(--ak-shadow-soft)]"
      : "relative flex max-h-[min(960px,calc(100dvh-2rem))] w-[min(960px,calc(100vw-2rem))] flex-col overflow-clip rounded-[var(--ak-radius-lg)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] shadow-[var(--ak-shadow-soft)]";

  return (
    <div
      aria-labelledby="ticket-detail-title"
      aria-modal="true"
      className={[
        "fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]",
        mode === "modal" ? "grid place-items-center p-4" : "",
      ].join(" ")}
      role="dialog"
    >
      <div className={panelClassName} style={panelStyle}>
        {mode === "side" ? (
          <TicketDetailResizeHandle
            isDragging={isResizing}
            onChangeWidth={(nextWidth) => onResizeNudge(nextWidth - width)}
            onNudge={onResizeNudge}
            onPointerDown={onResizeStart}
            onReset={onResizeReset}
            width={width}
          />
        ) : null}
        <header className="ak-drawer-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{ticket.id}</Badge>
              <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
              <Badge variant="muted">lines {ticket.range.startLine}-{ticket.range.endLine}</Badge>
            </div>
            <h2
              className="ak-title mt-3 break-words text-2xl"
              id="ticket-detail-title"
            >
              {ticket.title}
            </h2>
            <p className="ak-body-muted mt-2 text-sm">{ticket.type}</p>
          </div>
          <div className="ak-drawer-actions">
            <Button
              aria-label={mode === "side" ? "Open ticket detail as modal" : "Open ticket detail as side panel"}
              onClick={() => onChangeMode(mode === "side" ? "modal" : "side")}
              size="iconSm"
              title={mode === "side" ? "Open as modal" : "Open as side panel"}
              variant="ghost"
            >
              {mode === "side" ? (
                <Maximize2 className="size-4" aria-hidden="true" />
              ) : (
                <PanelRight className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              aria-label="Close ticket detail"
              onClick={onClose}
              size="iconSm"
              variant="ghost"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="ak-scroll-area ak-drawer-body min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <ErrorBanner
              error={error}
              isStale={latestErrorCode === "STALE_FILE"}
              onReload={onReload}
            />
          ) : null}

          <section className="grid gap-3 border-b border-[var(--ak-hairline)] pb-5">
            <h3 className="ak-title text-sm">Properties</h3>
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <label className="grid gap-1 text-xs font-medium text-[var(--ak-ink-muted)]">
                Status
                <select
                  className="ak-control-field h-9 px-2 text-sm font-medium"
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
              <label className="grid gap-1 text-xs font-medium text-[var(--ak-ink-muted)]">
                Progress
                <select
                  className="ak-control-field h-9 px-2 text-sm font-medium"
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
            <CanonicalSection
              title="완료 기준"
              items={ticket.completionCriteria}
              checklistItems={ticket.completionCriteriaItems}
            />
            <CanonicalSection
              title="검증"
              items={ticket.validation}
              checklistItems={ticket.validationItems}
            />

            <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="ak-title text-sm">사용자 지시</h3>
                <Badge variant="muted">{ticket.userInstructions.length}</Badge>
              </div>
              <LogTimeline emptyLabel="No user instructions" entries={ticket.userInstructions} />
            </section>

            <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="ak-title text-sm">진행 메모</h3>
                <Badge variant="muted">{ticket.progressNotes.length}</Badge>
              </div>
              <LogTimeline emptyLabel="No progress notes" entries={ticket.progressNotes} />
            </section>

            <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-[var(--ak-ink-muted)]" aria-hidden="true" />
                  <h3 className="ak-title text-sm">Run with Codex</h3>
                </div>
                <Badge variant={runMode === "edit" ? "default" : "muted"}>
                  {runModeLabel(runMode)}
                </Badge>
              </div>
              {codexDisabledReason ? (
                <div className="ak-panel-muted px-3 py-2 text-xs text-[var(--ak-ink-muted)]">
                  {codexDisabledReason}
                </div>
              ) : null}
              <div className="ak-panel-muted grid gap-3 p-3">
                <RunModeControl
                  idPrefix={`codex-run-mode-${ticket.id}`}
                  disabled={!canUseCodex}
                  mode={runMode}
                  onChange={(nextMode) => {
                    setRunMode(nextMode);
                    setPreview(null);
                  }}
                />
                <ScopeComposer
                  availableTickets={availableTickets}
                  disabled={!canUseCodex}
                  label="Execution draft"
                  onChange={(nextValue) => {
                    setRunDraft(nextValue);
                    setPreview(null);
                  }}
                  placeholder={
                    runMode === "read_only"
                      ? "답변받을 질문을 입력"
                      : "이번 Codex 실행에서 처리할 지시를 입력"
                  }
                  value={runDraft}
                />
                <ScopeResolutionPanel
                  mode={runMode}
                  resolution={scopeResolution}
                  warnings={scopeWarnings}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isPreviewing || !canUseCodex}
                  onClick={loadPreview}
                  size="sm"
                  variant="outline"
                >
                  {isPreviewing ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Terminal className="size-3" aria-hidden="true" />
                  )}
                  Preview prompt
                </Button>
                <Button disabled={isStartingRun || !canStartCodexRun} onClick={runCodex} size="sm">
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
              {activeRun ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <RunSignalBadge compact run={activeRun} />
                  <span className="font-medium">Active run on {activeRun.ticketId}</span>
                </div>
              ) : null}
              {ticketRunSummary?.isUnread ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  <div className="flex min-w-0 items-center gap-2">
                    <RunSignalBadge compact run={ticketRunSummary} />
                    <span className="truncate font-medium">Unread run result</span>
                  </div>
                  <Button disabled={isMarkingRead} onClick={markRunRead} size="sm" variant="outline">
                    {isMarkingRead ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="size-3" aria-hidden="true" />
                    )}
                    Mark as read
                  </Button>
                </div>
              ) : null}
              <TicketChatHistory
                chat={ticketChatQuery.data}
                error={ticketChatQuery.error}
                isLoading={ticketChatQuery.isLoading}
              />
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
    <div className="mb-5 rounded-[var(--ak-radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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

const RUN_MODE_OPTIONS: Array<{ label: string; mode: CodexRunMode }> = [
  { label: "Edit files", mode: "edit" },
  { label: "Read-only", mode: "read_only" },
];

function ScopeComposer({
  availableTickets,
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  availableTickets: TicketItem[];
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [activeMention, setActiveMention] = useState<ActiveMentionQuery | undefined>();
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const suggestions = useMemo(
    () => buildScopeSuggestions(availableTickets, activeMention?.query ?? ""),
    [activeMention?.query, availableTickets],
  );
  const isPopoverOpen = Boolean(activeMention && suggestions.length > 0);
  const activeOptionId = `${listboxId}-option-${Math.min(
    activeIndex,
    Math.max(0, suggestions.length - 1),
  )}`;
  const activeSuggestion = suggestions[Math.min(activeIndex, Math.max(0, suggestions.length - 1))];
  const editor = useEditor({
    content: buildScopeComposerContent(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-autocomplete": "list",
        "aria-expanded": "false",
        class: "ak-scope-composer-editor",
        role: "combobox",
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
      ScopeMentionNode,
    ],
    immediatelyRender: false,
    onSelectionUpdate: ({ editor: nextEditor }) => {
      setActiveMention(readActiveMentionQuery(nextEditor));
      setActiveIndex(0);
    },
    onUpdate: ({ editor: nextEditor }) => {
      const nextValue = serializeScopeComposerContent(nextEditor.getJSON());
      onChange(nextValue);
      setActiveMention(readActiveMentionQuery(nextEditor));
      setActiveIndex(0);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isPopoverOpen) {
      editor.view.dom.setAttribute("aria-controls", listboxId);
      editor.view.dom.setAttribute("aria-expanded", "true");
      editor.view.dom.setAttribute("aria-activedescendant", activeOptionId);
    } else {
      editor.view.dom.removeAttribute("aria-controls");
      editor.view.dom.setAttribute("aria-expanded", "false");
      editor.view.dom.removeAttribute("aria-activedescendant");
    }
  }, [activeOptionId, editor, isPopoverOpen, listboxId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editorValue = serializeScopeComposerContent(editor.getJSON());
    if (editorValue !== value) {
      editor.commands.setContent(buildScopeComposerContent(value), { emitUpdate: false });
      setActiveMention(readActiveMentionQuery(editor));
      setActiveIndex(0);
    }
  }, [editor, value]);

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, suggestions.length]);

  useEffect(() => {
    if (!isPopoverOpen) {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      document.getElementById(activeOptionId)?.scrollIntoView({
        block: "nearest",
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [activeOptionId, isPopoverOpen]);

  function insertSuggestion(suggestion: ScopeSuggestion | undefined): void {
    if (!editor || !activeMention || !suggestion) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: activeMention.from, to: activeMention.to },
        [
          {
            attrs: {
              kind: suggestion.kind,
              label: suggestion.label,
              targetTicketId: suggestion.targetTicketId,
              token: suggestion.token,
            },
            type: SCOPE_MENTION_NODE_TYPE,
          },
          { text: " ", type: "text" },
        ],
      )
      .run();
    setActiveMention(undefined);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Backspace" && deletePreviousScopeMentionAtom(editor)) {
      event.preventDefault();
      setActiveMention(undefined);
      setActiveIndex(0);
      return;
    }

    if (!activeMention || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertSuggestion(activeSuggestion);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveMention(undefined);
      setActiveIndex(0);
    }
  }

  return (
    <div className="grid gap-2 text-xs font-medium text-[var(--ak-ink-muted)]">
      <span>{label}</span>
      <Popover
        modal={false}
        onOpenChange={(open) => {
          if (!open) {
            setActiveMention(undefined);
            setActiveIndex(0);
          }
        }}
        open={isPopoverOpen}
      >
        <PopoverAnchor asChild>
          <div
            className="relative"
            onKeyDownCapture={handleKeyDown}
          >
            <div
              className={[
                "ak-scope-composer ak-control-field",
                disabled ? "opacity-60" : "",
              ].join(" ")}
            >
              {editor && !value ? (
                <div className="ak-scope-composer-placeholder">{placeholder}</div>
              ) : null}
              <EditorContent editor={editor} />
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="ak-scope-suggest-popover"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div
            aria-label="Scope suggestions"
            className="ak-scroll-area ak-scope-suggest"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <button
                aria-selected={index === activeIndex}
                className={[
                  "ak-scope-suggest-row",
                  index === activeIndex ? "ak-scope-suggest-row-active" : "",
                ].join(" ")}
                id={`${listboxId}-option-${index}`}
                key={suggestion.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertSuggestion(suggestion);
                }}
                role="option"
                type="button"
              >
                <span className="ak-scope-suggest-label">{suggestion.label}</span>
                <span className="ak-scope-suggest-description">
                  {suggestion.description}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function deletePreviousScopeMentionAtom(editor: Editor | null): boolean {
  if (!editor || !editor.state.selection.empty) {
    return false;
  }

  const position = editor.state.selection.from;
  let deleteRange: { from: number; to: number } | undefined;

  editor.state.doc.nodesBetween(Math.max(0, position - 80), position, (node, nodePosition) => {
    if (node.type.name !== SCOPE_MENTION_NODE_TYPE) {
      return;
    }

    const afterMention = nodePosition + node.nodeSize;
    if (afterMention > position) {
      return;
    }

    const textAfterMention = editor.state.doc.textBetween(
      afterMention,
      position,
      "\n",
      "\ufffc",
    );
    if (textAfterMention.trim() === "") {
      deleteRange = { from: nodePosition, to: position };
    }
  });

  if (!deleteRange) {
    return false;
  }

  return editor.chain().focus().deleteRange(deleteRange).run();
}

function buildScopeComposerContent(value: string): JSONContent {
  const lines = value.split("\n");
  return {
    content: lines.map((line) => {
      const content = buildScopeComposerInlineContent(line);
      return {
        content: content.length > 0 ? content : undefined,
        type: "paragraph",
      };
    }),
    type: "doc",
  };
}

function buildScopeComposerInlineContent(line: string): JSONContent[] {
  const content: JSONContent[] = [];
  let cursor = 0;

  for (const mention of findCodexChatScopeMentionRanges(line)) {
    if (mention.start > cursor) {
      content.push({ text: line.slice(cursor, mention.start), type: "text" });
    }

    content.push({
      attrs: scopeMentionAttributesFromToken({
        kind: mention.kind,
        targetTicketId: mention.targetTicketId,
        token: mention.token,
      }),
      type: SCOPE_MENTION_NODE_TYPE,
    });
    cursor = mention.end;
  }

  if (cursor < line.length) {
    content.push({ text: line.slice(cursor), type: "text" });
  }

  return content;
}

function serializeScopeComposerContent(content: JSONContent): string {
  return (content.content ?? [])
    .map((node) => serializeScopeComposerNode(node))
    .join("\n");
}

function serializeScopeComposerNode(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === SCOPE_MENTION_NODE_TYPE) {
    return typeof node.attrs?.token === "string" ? node.attrs.token : "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return (node.content ?? []).map((child) => serializeScopeComposerNode(child)).join("");
}

function scopeMentionAttributesFromToken(input: {
  kind: CodexChatScopeMentionKind;
  targetTicketId?: string;
  token: string;
}): ScopeMentionAttributes {
  return {
    kind: input.kind,
    label:
      input.kind === "ticket" && input.targetTicketId
        ? `Ticket ${input.targetTicketId}`
        : scopeMentionLabel(input.kind, input.token),
    targetTicketId: input.targetTicketId,
    token: input.token,
  };
}

function scopeMentionLabel(kind: CodexChatScopeMentionKind, token: string): string {
  if (kind === "workspace") {
    return "Workspace";
  }
  if (kind === "ticket") {
    return token.includes(":") ? `Ticket ${token.slice(token.indexOf(":") + 1).toUpperCase()}` : "Ticket";
  }
  return token.toLowerCase() === "@tickets" ? "Tickets" : "Document";
}

function readActiveMentionQuery(editor: Editor): ActiveMentionQuery | undefined {
  const { selection } = editor.state;
  if (!selection.empty) {
    return undefined;
  }

  const to = selection.from;
  const textBefore = editor.state.doc.textBetween(Math.max(0, to - 80), to, "\n", "\ufffc");
  const match = textBefore.match(/(^|[\s([{'"`])@([A-Za-z0-9:_-]*)$/);
  if (!match) {
    return undefined;
  }

  const query = match[2] ?? "";
  return {
    from: to - query.length - 1,
    query,
    to,
  };
}

function buildScopeSuggestions(
  availableTickets: TicketItem[],
  query: string,
): ScopeSuggestion[] {
  const fixedSuggestions: ScopeSuggestion[] = [
    {
      description: "Selected workspace",
      id: "workspace",
      kind: "workspace",
      label: "Workspace",
      token: "@workspace",
    },
    {
      description: "Current ticket document",
      id: "tickets",
      kind: "document",
      label: "Tickets",
      token: "@tickets",
    },
    {
      description: "Current document",
      id: "document",
      kind: "document",
      label: "Document",
      token: "@document",
    },
  ];
  const ticketSuggestions = availableTickets.map((ticket): ScopeSuggestion => ({
    description: ticket.title,
    id: ticket.id,
    kind: "ticket",
    label: `Ticket ${ticket.id}`,
    targetTicketId: ticket.id,
    token: `@t:${ticket.id}`,
  }));
  const normalizedQuery = query.toLowerCase();
  const ticketQuery = normalizedQuery.replace(/^(t:|ticket:)/, "");

  return [...fixedSuggestions, ...ticketSuggestions]
    .filter((suggestion) => {
      if (!normalizedQuery) {
        return true;
      }

      const token = suggestion.token.toLowerCase().replace(/^@/, "");
      const label = suggestion.label.toLowerCase();
      const description = suggestion.description.toLowerCase();
      if (suggestion.kind === "ticket") {
        return (
          token.includes(normalizedQuery) ||
          label.includes(ticketQuery) ||
          description.includes(ticketQuery)
        );
      }

      return token.includes(normalizedQuery) || label.includes(normalizedQuery);
    })
    .slice(0, 8);
}

function RunModeControl({
  disabled,
  idPrefix,
  mode,
  onChange,
}: {
  disabled: boolean;
  idPrefix: string;
  mode: CodexRunMode;
  onChange: (mode: CodexRunMode) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-medium text-[var(--ak-ink-muted)]">Mode</legend>
      <div className="grid grid-cols-2 gap-1 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-1">
        {RUN_MODE_OPTIONS.map((option) => {
          const isSelected = mode === option.mode;
          const inputId = `${idPrefix}-${option.mode}`;
          return (
            <label
              className={[
                "ak-focus-ring flex min-h-8 cursor-pointer items-center justify-center rounded-[var(--ak-radius-sm)] px-2 text-xs font-medium transition-colors",
                isSelected
                  ? "bg-[var(--ak-primary)] text-white"
                  : "text-[var(--ak-ink-muted)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
                disabled ? "cursor-not-allowed opacity-45" : "",
              ].join(" ")}
              htmlFor={inputId}
              key={option.mode}
            >
              <input
                checked={isSelected}
                className="sr-only"
                disabled={disabled}
                id={inputId}
                name={idPrefix}
                onChange={() => onChange(option.mode)}
                type="radio"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ScopeResolutionPanel({
  mode,
  resolution,
  warnings,
}: {
  mode: CodexRunMode;
  resolution: CodexChatScopeResolution;
  warnings: string[];
}) {
  return (
    <div className="grid gap-2 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={resolution.scope === "workspace" ? "warning" : "outline"}>
          {scopeResolutionLabel(resolution)}
        </Badge>
        <Badge variant="muted">{runModeLabel(mode)}</Badge>
        {resolution.mentions.length > 0 ? (
          <span className="truncate text-[var(--ak-ink-faint)]">
            {resolution.mentions.map((mention) => mention.token).join(", ")}
          </span>
        ) : (
          <span className="text-[var(--ak-ink-faint)]">default ticket scope</span>
        )}
      </div>
      {warnings.length > 0 ? (
        <div className="grid gap-1 text-amber-800">
          {warnings.map((warning) => (
            <p className="break-words" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CanonicalSection({
  checklistItems,
  items,
  title,
}: {
  checklistItems?: TicketChecklistItem[];
  items: string[];
  title: string;
}) {
  if (checklistItems && checklistItems.length > 0) {
    return (
      <section className="grid gap-2">
        <h3 className="ak-title text-sm">{title}</h3>
        <ul className="grid gap-2 text-sm leading-6 text-[var(--ak-ink-secondary)]">
          {checklistItems.map((item) => (
            <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-2" key={item.index}>
              {item.checked === null ? (
                <span className="mt-2 size-1.5 rounded-full bg-[var(--ak-ink-faint)]" aria-hidden="true" />
              ) : (
                <input
                  aria-label={item.text}
                  checked={item.checked}
                  className="mt-1 size-4 rounded border-[var(--ak-hairline)] accent-[var(--ak-primary)]"
                  onChange={() => undefined}
                  type="checkbox"
                />
              )}
              <span
                className={[
                  "break-words",
                  item.checked === true
                    ? "text-[var(--ak-ink-muted)] line-through decoration-[var(--ak-ink-faint)]"
                    : "",
                ].join(" ")}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="grid gap-2">
      <h3 className="ak-title text-sm">{title}</h3>
      {items.length > 0 ? (
        <ul className="grid gap-1 text-sm leading-6 text-[var(--ak-ink-secondary)]">
          {items.map((item, index) => (
            <li className="break-words" key={`${title}-${index}`}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--ak-ink-faint)]">-</p>
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
    return <p className="text-sm text-[var(--ak-ink-faint)]">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry) => (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm" key={entry.index}>
          <span className="text-xs font-medium text-[var(--ak-ink-faint)]">{entry.date}</span>
          <p className="break-words leading-6 text-[var(--ak-ink-secondary)]">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

function TicketChatHistory({
  chat,
  error,
  isLoading,
}: {
  chat?: CodexTicketChatResponse;
  error: Error | null;
  isLoading: boolean;
}) {
  const messages = chat?.messages ?? [];

  return (
    <div className="ak-panel-muted grid gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          <h4 className="ak-title text-sm">Ticket chat</h4>
        </div>
        <Badge variant="muted">{messages.length}</Badge>
      </div>
      {isLoading ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">Loading chat history</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700">Could not load ticket chat: {error.message}</p>
      ) : null}
      {!isLoading && !error && messages.length === 0 ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">
          Run with Codex messages will appear here.
        </p>
      ) : null}
      {messages.length > 0 ? (
        <div className="grid gap-3">
          {messages.map((message) => (
            <TicketChatMessage key={message.id} message={message} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TicketChatMessage({ message }: { message: CodexChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <article
      className={[
        "grid gap-2 rounded-[var(--ak-radius-md)] border p-3",
        isAssistant
          ? "border-[var(--ak-hairline)] bg-[var(--ak-surface)]"
          : "border-blue-100 bg-blue-50/60",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={isAssistant ? "outline" : "default"}>
            {isAssistant ? "Assistant" : "User"}
          </Badge>
          {message.runId ? <Badge variant="muted">{message.runId.slice(0, 8)}</Badge> : null}
        </div>
        <time className="text-xs text-[var(--ak-ink-faint)]" dateTime={message.createdAt}>
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      {message.contentFormat === "markdown" ? (
        <MarkdownMessage content={message.content} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ak-ink-secondary)]">
          {message.content}
        </p>
      )}
    </article>
  );
}

function MarkdownMessage({
  content,
  headingIdsByLine,
}: {
  content: string;
  headingIdsByLine?: Record<number, string>;
}) {
  const remarkPlugins = headingIdsByLine
    ? [remarkGfm, remarkHeadingIds(headingIdsByLine)]
    : [remarkGfm];

  return (
    <div className="ak-markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins}>{content}</ReactMarkdown>
    </div>
  );
}

function createHeadingIdsByLine(
  outline: MarkdownDocumentResponse["outline"],
): Record<number, string> {
  return Object.fromEntries(
    outline.map((heading) => [
      heading.line,
      `md-heading-${heading.line}-${slugifyHeading(heading.title)}`,
    ]),
  );
}

function scrollToMarkdownHeading(id?: string): void {
  if (!id) {
    return;
  }

  const target = document.getElementById(id);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  const scrollContainer = target.closest(".ak-scroll-area");
  let didHighlight = false;

  const highlight = () => {
    if (didHighlight) {
      return;
    }
    didHighlight = true;
    flashMarkdownHeading(target);
  };

  if (scrollContainer && "onscrollend" in scrollContainer) {
    const fallbackTimeout = window.setTimeout(highlight, 700);
    scrollContainer.addEventListener(
      "scrollend",
      () => {
        window.clearTimeout(fallbackTimeout);
        highlight();
      },
      { once: true },
    );
    return;
  }

  window.setTimeout(highlight, 450);
}

function flashMarkdownHeading(target: HTMLElement): void {
  const existingTimeout = Number(target.dataset.akHighlightTimeout);
  if (Number.isFinite(existingTimeout) && existingTimeout > 0) {
    window.clearTimeout(existingTimeout);
  }

  target.classList.remove(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
  void target.offsetWidth;
  target.classList.add(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
  const timeout = window.setTimeout(() => {
    target.classList.remove(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
    delete target.dataset.akHighlightTimeout;
  }, 1_200);
  target.dataset.akHighlightTimeout = String(timeout);
}

function slugifyHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

function remarkHeadingIds(headingIdsByLine: Record<number, string>) {
  return function attachHeadingIds() {
    return function transformMarkdownTree(tree: unknown): void {
      visitMarkdownAst(tree, (node) => {
        if (node.type !== "heading") {
          return;
        }

        const line = node.position?.start?.line;
        const id = typeof line === "number" ? headingIdsByLine[line] : undefined;
        if (!id) {
          return;
        }

        const data = ensureRecordProperty(node, "data");
        const hProperties = ensureRecordProperty(data, "hProperties");
        hProperties.id = id;
      });
    };
  };
}

type MarkdownAstNode = Record<string, unknown> & {
  children?: unknown[];
  position?: {
    start?: {
      line?: number;
    };
  };
  type?: unknown;
};

function visitMarkdownAst(
  value: unknown,
  visitor: (node: MarkdownAstNode) => void,
): void {
  if (!isRecord(value)) {
    return;
  }

  const node = value as MarkdownAstNode;
  visitor(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitMarkdownAst(child, visitor);
    }
  }
}

function ensureRecordProperty(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = target[key];
  if (isRecord(current)) {
    return current;
  }

  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function PromptPreview({ preview }: { preview: CodexPromptPreviewResponse }) {
  return (
    <div className="ak-panel-muted grid gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{preview.command}</Badge>
        <Badge variant={preview.mode === "edit" ? "default" : "muted"}>
          {runModeLabel(preview.mode)}
        </Badge>
        <Badge variant={preview.scopeResolution.scope === "workspace" ? "warning" : "outline"}>
          {scopeResolutionLabel(preview.scopeResolution)}
        </Badge>
        <Badge variant="muted">
          {preview.resumeSessionId ? "resume session" : "new session"}
        </Badge>
      </div>
      {codexChatScopeRunWarnings(preview.scopeResolution, preview.mode).length > 0 ? (
        <div className="grid gap-1 text-xs text-amber-800">
          {codexChatScopeRunWarnings(preview.scopeResolution, preview.mode).map((warning) => (
            <p className="break-words" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      <p className="ak-body-muted truncate text-xs" title={preview.args.join(" ")}>
        {preview.args.slice(0, -1).join(" ")}
      </p>
      <pre className="ak-scroll-area ak-control-field max-h-56 overflow-auto whitespace-pre-wrap p-3 text-xs leading-5">
        {preview.prompt}
      </pre>
    </div>
  );
}

function RunLog({ events, run }: { events: CodexRunEvent[]; run: CodexRunSnapshot }) {
  return (
    <div className="grid gap-2 rounded-[var(--ak-radius-md)] border border-neutral-800 bg-neutral-950 p-3 text-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-neutral-400" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-normal text-neutral-400">
            {run.status}
          </span>
          <Badge variant="muted">{runModeLabel(run.mode)}</Badge>
        </div>
        <Badge variant="muted">{events.length} events</Badge>
      </div>
      <div className="ak-scroll-area max-h-72 overflow-auto rounded-[var(--ak-radius-md)] bg-black/30 p-2 font-mono text-xs leading-5">
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

function DocumentRunSignalBadge({
  runSummary,
}: {
  runSummary: CodexDocumentRunSummaryResponse;
}) {
  const unreadRuns = runSummary.runs.filter((run) => run.isUnread);
  const displayRun = runSummary.activeRun ?? unreadRuns.at(-1);

  if (!displayRun) {
    return null;
  }

  return <RunSignalBadge run={displayRun} />;
}

function RunSignalBadge({
  compact = false,
  run,
}: {
  compact?: boolean;
  run: CodexRunSummary;
}) {
  const isActive = run.status === "queued" || run.status === "running";
  const label = runSignalLabel(run.status);

  return (
    <span
      className={[
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border px-1.5 text-xs font-medium",
        runSignalClassName(run.status),
      ].join(" ")}
      title={`${label} ${runModeLabel(run.mode)} on ${run.ticketId}`}
    >
      {isActive ? (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <span
          className={["size-2 shrink-0 rounded-full", runSignalDotClassName(run.status)].join(
            " ",
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{compact ? label : `${label}: ${run.ticketId}`}</span>
    </span>
  );
}

function shouldShowRunOnTicketCard(run: CodexRunSummary): boolean {
  return run.status === "queued" || run.status === "running" || run.isUnread;
}

function isValidTimestamp(value: string | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DocumentTypeBadge({ type }: { type: MarkdownFileType }) {
  return (
    <Badge variant={type === "tickets" ? "default" : "outline"}>
      {documentTypeLabel(type)}
    </Badge>
  );
}

function documentTypeLabel(type: MarkdownFileType): string {
  return {
    inventory: "Inventory",
    markdown: "Markdown",
    plan: "Plan",
    tickets: "Tickets",
  }[type];
}

function documentTypeIcon(type: MarkdownFileType) {
  return {
    inventory: Archive,
    markdown: FileText,
    plan: BookOpen,
    tickets: ListChecks,
  }[type];
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

function runSignalLabel(status: CodexRunSignalStatus): string {
  return {
    cancelled: "Cancelled",
    failed: "Failed",
    idle: "Idle",
    needs_auth: "Needs auth",
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    unknown: "Unknown",
  }[status];
}

function runModeLabel(mode: CodexRunMode): string {
  return {
    edit: "Edit files",
    read_only: "Read-only",
  }[mode];
}

function scopeResolutionLabel(resolution: CodexChatScopeResolution): string {
  if (resolution.scope === "workspace") {
    return "Workspace scope";
  }
  if (resolution.scope === "document") {
    return "Document scope";
  }
  return resolution.targetTicketId ? `Ticket ${resolution.targetTicketId}` : "Ticket scope";
}

function runSignalClassName(status: CodexRunSignalStatus): string {
  return {
    cancelled: "border-neutral-200 bg-neutral-50 text-neutral-600",
    failed: "border-red-200 bg-red-50 text-red-700",
    idle: "border-neutral-200 bg-neutral-50 text-neutral-500",
    needs_auth: "border-amber-200 bg-amber-50 text-amber-800",
    queued: "border-blue-200 bg-blue-50 text-blue-700",
    running: "border-blue-200 bg-blue-50 text-blue-700",
    succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
    unknown: "border-neutral-300 bg-neutral-100 text-neutral-700",
  }[status];
}

function runSignalDotClassName(status: CodexRunSignalStatus): string {
  return {
    cancelled: "bg-neutral-400",
    failed: "bg-red-500",
    idle: "bg-neutral-300",
    needs_auth: "bg-amber-500",
    queued: "bg-blue-500",
    running: "bg-blue-500",
    succeeded: "bg-emerald-500",
    unknown: "bg-neutral-500",
  }[status];
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

function formatClientError(error: ClientApiError | Error): string {
  return error instanceof ClientApiError ? `${error.code}: ${error.message}` : error.message;
}

function upsertEvent(events: CodexRunEvent[], event: CodexRunEvent): CodexRunEvent[] {
  if (events.some((item) => item.id === event.id)) {
    return events.map((item) => (item.id === event.id ? event : item));
  }
  return [...events, event].sort((a, b) => a.id - b.id);
}
