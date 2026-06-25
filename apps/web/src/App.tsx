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
  codexModelsResponseSchema,
  codexRunEventSchema,
  codexRunDefaultsResponseSchema,
  codexRunResponseSchema,
  codexTicketChatResponseSchema,
  codexWorkspaceChatResponseSchema,
  codexWorkspacePromptPreviewResponseSchema,
  codexChatScopeRunWarnings,
  createWorkspaceResponseSchema,
  findCodexChatScopeMentionRanges,
  markCodexRunReadResponseSchema,
  createCodexRunResponseSchema,
  documentSetsResponseSchema,
  healthResponseSchema,
  isCodexChatScopeRunAllowed,
  markdownFileChangeEventSchema,
  markdownDocumentResponseSchema,
  resolveCodexChatScope,
  ticketDocumentResponseSchema,
  selectWorkspaceResponseSchema,
  workspaceDirectoriesResponseSchema,
  workspacesResponseSchema,
  type ApiErrorResponse,
  type CodexDocumentRunSummaryResponse,
  type CodexPromptPreviewResponse,
  type CodexAppliedRunDefaults,
  type CodexModelsResponse,
  type CodexRunDefaults,
  type CodexRunEvent,
  type CodexRunMode,
  type CodexRunSignalStatus,
  type CodexRunSnapshot,
  type CodexRunSummary,
  type CodexChatScopeMentionKind,
  type CodexChatScopeResolution,
  type CodexChatMessage,
  type CodexTicketChatResponse,
  type CodexWorkspaceChatResponse,
  type CodexWorkspaceChatIntent,
  type CodexWorkspacePromptPreviewResponse,
  type CreateWorkspaceResponse,
  type DocumentSetSummary,
  type MarkdownDocumentResponse,
  type MarkdownFileChangeEvent,
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
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  Check,
  CircleDot,
  FileText,
  Folder,
  FolderKanban,
  House,
  ListChecks,
  Loader2,
  Maximize2,
  PanelRight,
  Play,
  RefreshCcw,
  Save,
  Search,
  Send,
  Settings2,
  Square,
  Terminal,
  Trash2,
  Zap,
  X,
} from "lucide-react";

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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_DOCUMENT_SET_SORT_PREFERENCE,
  DOCUMENT_SET_SORT_OPTIONS,
  defaultDirectionForDocumentSetSortMode,
  isDocumentSetSortDirection,
  isDocumentSetSortMode,
  sortDocumentSets,
  type DocumentSetSortPreference,
} from "./documentSetSorting";

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
const DOCUMENT_SET_SORT_STORAGE_KEY = "alpha-kanban.documentSetSort";
const AUTO_OPEN_LAST_WORKSPACE_STORAGE_KEY = "alpha-kanban.autoOpenLastWorkspace";
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
const CLI_DEFAULT_SELECT_VALUE = "__cli_default__";
const MODEL_DEFAULT_SELECT_VALUE = "__model_default__";

type TicketDetailMode = "side" | "modal";

type AppRouteState = {
  detailMode?: TicketDetailMode;
  filePath?: string;
  ticketId?: string;
  workspaceId?: string;
};

type PromptPreviewModel = {
  args: string[];
  command: string;
  intent?: CodexWorkspaceChatIntent;
  mode: CodexRunMode;
  prompt: string;
  resumeSessionId?: string;
  runDefaults: CodexAppliedRunDefaults;
  scopeResolution: CodexChatScopeResolution;
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

type RunActivityItem = {
  detail: string;
  id: string;
  label: string;
  priority: number;
  tone: "danger" | "info" | "success" | "warning";
};

type ChatHistoryEntry =
  | { kind: "activity"; runId: string }
  | { kind: "message"; message: CodexChatMessage };

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

function readStoredDocumentSetSortPreferences(): Record<string, DocumentSetSortPreference> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(DOCUMENT_SET_SORT_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([workspaceId, value]) => {
        const preference = normalizeDocumentSetSortPreference(value);
        return preference ? [[workspaceId, preference]] : [];
      }),
    );
  } catch {
    return {};
  }
}

function writeStoredDocumentSetSortPreferences(
  preferences: Record<string, DocumentSetSortPreference>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DOCUMENT_SET_SORT_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failures; sorting still works for the current session.
  }
}

function readStoredAutoOpenLastWorkspace(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(AUTO_OPEN_LAST_WORKSPACE_STORAGE_KEY) === "true";
}

function normalizeDocumentSetSortPreference(
  value: unknown,
): DocumentSetSortPreference | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return isDocumentSetSortMode(value.mode) && isDocumentSetSortDirection(value.direction)
    ? {
        direction: value.direction,
        mode: value.mode,
      }
    : undefined;
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
const workspaceChatKey = (workspaceId?: string) => ["workspace-chat", workspaceId] as const;
const workspaceDirectoriesKey = (root?: string) => ["workspace-directories", root] as const;
const codexModelsKey = ["codex-models"] as const;
const codexRunDefaultsKey = ["codex-run-defaults"] as const;

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

async function createWorkspaceProject(body: {
  gitInit: boolean;
  parentRoot: string;
  projectName: string;
}): Promise<CreateWorkspaceResponse> {
  return requestJson("/api/workspaces/create", createWorkspaceResponseSchema, {
    body: JSON.stringify(body),
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

async function deleteTicketChatMessage(
  workspaceId: string,
  fileId: string,
  ticketId: string,
  messageId: string,
) {
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets/${ticketId}/chat/${messageId}`,
    codexTicketChatResponseSchema,
    { method: "DELETE" },
  );
}

async function fetchWorkspaceChat(workspaceId: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/workspace-chat`,
    codexWorkspaceChatResponseSchema,
  );
}

async function fetchCodexModels() {
  return requestJson("/api/codex/models", codexModelsResponseSchema);
}

async function fetchCodexRunDefaults() {
  return requestJson("/api/codex/run-defaults", codexRunDefaultsResponseSchema);
}

async function updateCodexRunDefaults(defaults: {
  model?: string | null;
  reasoningEffort?: string | null;
  speedTier?: string | null;
}) {
  return requestJson("/api/codex/run-defaults", codexRunDefaultsResponseSchema, {
    body: JSON.stringify(defaults),
    method: "PUT",
  });
}

async function appendWorkspaceChatMessage(workspaceId: string, content: string) {
  return requestJson(
    `/api/workspaces/${workspaceId}/workspace-chat/messages`,
    codexWorkspaceChatResponseSchema,
    {
      body: JSON.stringify({ content, contentFormat: "markdown" }),
      method: "POST",
    },
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
  bypassSandbox?: boolean;
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

async function previewWorkspacePrompt(workspaceId: string, body: {
  bypassSandbox?: boolean;
  currentFileId?: string;
  intent?: CodexWorkspaceChatIntent;
  instructionDraft?: string;
  mode?: CodexRunMode;
}) {
  return requestJson(
    `/api/workspaces/${workspaceId}/workspace-chat/prompt-preview`,
    codexWorkspacePromptPreviewResponseSchema,
    {
      body: JSON.stringify(body),
      method: "POST",
    },
  );
}

async function startWorkspaceChatRun(workspaceId: string, body: {
  bypassSandbox?: boolean;
  currentFileId?: string;
  intent?: CodexWorkspaceChatIntent;
  instructionDraft?: string;
  mode?: CodexRunMode;
}) {
  return requestJson(
    `/api/workspaces/${workspaceId}/workspace-chat/runs`,
    createCodexRunResponseSchema,
    {
      body: JSON.stringify(body),
      method: "POST",
    },
  );
}

async function startCodexRun(workspaceId: string, body: {
  bypassSandbox?: boolean;
  expectedHash?: string;
  expectedMtimeMs?: number;
  fileId: string;
  instructionDraft?: string;
  mode?: CodexRunMode;
  sourceMessageId?: string;
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
  const [isWorkspaceChatOpen, setIsWorkspaceChatOpen] = useState(false);
  const [externalFileChange, setExternalFileChange] =
    useState<MarkdownFileChangeEvent | null>(null);
  const [documentSetSortPreferences, setDocumentSetSortPreferences] = useState(
    readStoredDocumentSetSortPreferences,
  );
  const [initialAutoOpenLastWorkspace] = useState(readStoredAutoOpenLastWorkspace);
  const shouldAutoOpenLastWorkspaceOnLoadRef = useRef(
    !initialRouteRef.current.workspaceId && initialAutoOpenLastWorkspace,
  );
  const [autoOpenLastWorkspace, setAutoOpenLastWorkspace] = useState(
    initialAutoOpenLastWorkspace,
  );
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
  const codexModelsQuery = useQuery({
    queryKey: codexModelsKey,
    queryFn: fetchCodexModels,
    staleTime: 60_000,
  });
  const codexRunDefaultsQuery = useQuery({
    queryKey: codexRunDefaultsKey,
    queryFn: fetchCodexRunDefaults,
  });
  const saveCodexRunDefaults = useCallback(
    async (defaults: {
      model?: string | null;
      reasoningEffort?: string | null;
      speedTier?: string | null;
    }) => {
      const response = await updateCodexRunDefaults(defaults);
      queryClient.setQueryData(codexRunDefaultsKey, response);
      await queryClient.invalidateQueries({ queryKey: codexRunDefaultsKey });
      return response;
    },
    [queryClient],
  );
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
  const storedDocumentSetSortPreference = selectedWorkspaceId
    ? documentSetSortPreferences[selectedWorkspaceId]
    : undefined;
  const documentSetSortPreference =
    storedDocumentSetSortPreference ?? DEFAULT_DOCUMENT_SET_SORT_PREFERENCE;
  const sortedDocumentSets = useMemo(
    () => sortDocumentSets(documentSets, documentSetSortPreference),
    [documentSetSortPreference, documentSets],
  );
  const allFiles = useMemo(
    () => sortedDocumentSets.flatMap((documentSet) => documentSet.documents),
    [sortedDocumentSets],
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
  const currentSelectedFilePath = selectedFile?.workspaceRelativePath ?? preferredFilePath;
  const selectedDocumentSet = sortedDocumentSets.find((documentSet) =>
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
  const updateDocumentSetSortPreference = useCallback(
    (preference: DocumentSetSortPreference) => {
      if (!selectedWorkspaceId) {
        return;
      }

      setDocumentSetSortPreferences((current) => {
        const next = {
          ...current,
          [selectedWorkspaceId]: preference,
        };
        writeStoredDocumentSetSortPreferences(next);
        return next;
      });
    },
    [selectedWorkspaceId],
  );

  useEffect(() => {
    if (
      !shouldAutoOpenLastWorkspaceOnLoadRef.current ||
      selectedWorkspaceId ||
      !workspacesQuery.data ||
      !autoOpenLastWorkspace
    ) {
      return;
    }

    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    const lastWorkspace = workspacesQuery.data.workspaces.find(
      (workspace) =>
        workspace.id === workspacesQuery.data.lastWorkspaceId && workspace.isAvailable,
    );
    if (lastWorkspace) {
      setSelectedWorkspaceId(lastWorkspace.id);
    }
  }, [autoOpenLastWorkspace, selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    if (!selectedWorkspaceId || sortedDocumentSets.length === 0) {
      return;
    }

    const selectedFileExists = Boolean(selectedFileId && selectedFileById);
    if (selectedFileExists) {
      return;
    }

    const nextFile = preferredFile ?? sortedDocumentSets[0]?.primaryFile;
    if (nextFile?.id && nextFile.id !== selectedFileId) {
      setSelectedFileId(nextFile.id);
    }
  }, [
    preferredFile,
    selectedFileById,
    selectedFileId,
    selectedWorkspaceId,
    sortedDocumentSets,
  ]);

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
    replaceAppRoute({
      workspaceId: selectedWorkspaceId,
      filePath: currentSelectedFilePath,
      ticketId: selectedTicketId,
      detailMode: selectedTicketId ? ticketDetailMode : undefined,
    });
  }, [
    currentSelectedFilePath,
    preferredFilePath,
    selectedTicketId,
    selectedWorkspaceId,
    ticketDetailMode,
  ]);

  useEffect(() => {
    setExternalFileChange(null);
  }, [resolvedSelectedFileId, selectedWorkspaceId]);

  useEffect(() => {
    if (!canLoadWorkspace || !selectedWorkspaceId) {
      return;
    }

    const source = new EventSource(`/api/workspaces/${selectedWorkspaceId}/files/events`);
    source.addEventListener("markdown-file", (message) => {
      const parsed = markdownFileChangeEventSchema.safeParse(
        JSON.parse((message as MessageEvent).data as string),
      );
      if (!parsed.success) {
        return;
      }

      const event = parsed.data;
      void queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });

      const isCurrentFile =
        event.fileId === resolvedSelectedFileId ||
        event.workspaceRelativePath === currentSelectedFilePath;
      if (!isCurrentFile) {
        return;
      }

      const currentHash = ticketQuery.data?.file.hash ?? markdownQuery.data?.file.hash;
      if (event.file?.hash && event.file.hash === currentHash) {
        setExternalFileChange(null);
        return;
      }

      if (isTicketsDocument && selectedTicketId) {
        setExternalFileChange(event);
        return;
      }

      setExternalFileChange(null);
      if (isTicketsDocument) {
        void queryClient.invalidateQueries({
          queryKey: ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
        });
      }
    });

    return () => source.close();
  }, [
    canLoadWorkspace,
    currentSelectedFilePath,
    isTicketsDocument,
    markdownQuery.data?.file.hash,
    queryClient,
    resolvedSelectedFileId,
    selectedTicketId,
    selectedWorkspaceId,
    ticketQuery.data?.file.hash,
  ]);

  useEffect(() => {
    if (!canLoadWorkspace || !selectedWorkspaceId) {
      return;
    }

    function refetchVisibleDocument(): void {
      if (document.visibilityState === "hidden") {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
      if (!resolvedSelectedFileId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: isTicketsDocument
          ? ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId)
          : markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
      });
    }

    window.addEventListener("focus", refetchVisibleDocument);
    document.addEventListener("visibilitychange", refetchVisibleDocument);
    return () => {
      window.removeEventListener("focus", refetchVisibleDocument);
      document.removeEventListener("visibilitychange", refetchVisibleDocument);
    };
  }, [
    canLoadWorkspace,
    isTicketsDocument,
    queryClient,
    resolvedSelectedFileId,
    selectedWorkspaceId,
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
      window.localStorage.setItem(
        AUTO_OPEN_LAST_WORKSPACE_STORAGE_KEY,
        String(autoOpenLastWorkspace),
      );
    } catch {
      // Ignore storage failures; startup behavior falls back to the start page.
    }
  }, [autoOpenLastWorkspace]);

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

  async function reloadExternalFileChange(): Promise<void> {
    if (!selectedWorkspaceId || !resolvedSelectedFileId) {
      setExternalFileChange(null);
      return;
    }

    if (isTicketsDocument) {
      await ticketQuery.refetch();
    } else {
      await markdownQuery.refetch();
    }
    await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
    setExternalFileChange(null);
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

  async function handleWorkspaceCreate(input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }): Promise<void> {
    const response = await createWorkspaceProject(input);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(response.workspace.id);
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  function handleGoToStartPage(): void {
    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(undefined);
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
            autoOpenLastWorkspace={autoOpenLastWorkspace}
            isLoading={workspacesQuery.isLoading}
            onAutoOpenLastWorkspaceChange={setAutoOpenLastWorkspace}
            onGoToStartPage={handleGoToStartPage}
            onOpenPath={handleWorkspaceOpenPath}
            onSelect={handleWorkspaceSelect}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            workspaces={workspacesQuery.data?.workspaces ?? []}
          />

          <div className="border-b border-[var(--ak-hairline)] p-3">
            <Button
              className="ak-row w-full justify-start gap-3 px-3 py-2 text-left"
              disabled={!canLoadWorkspace}
              onClick={() => setIsWorkspaceChatOpen(true)}
              title={
                selectedWorkspace
                  ? `Workspace chat for ${selectedWorkspace.root}`
                  : "Select a project before opening workspace chat"
              }
              variant="ghost"
            >
              <Bot className="size-4 text-[var(--ak-ink-muted)]" aria-hidden="true" />
              <span className="grid min-w-0 gap-0.5">
                <span className="ak-title truncate text-sm">Workspace Chat</span>
                <span className="ak-body-muted truncate text-xs">
                  {selectedWorkspace ? "All discovered docs" : "Select a project"}
                </span>
              </span>
            </Button>
          </div>

          <div className="border-b border-[var(--ak-hairline)] p-3">
            <DocumentListHeader
              disabled={!canLoadWorkspace}
              onPreferenceChange={updateDocumentSetSortPreference}
              preference={documentSetSortPreference}
            />
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
              {documentSetsQuery.isSuccess && sortedDocumentSets.length === 0 ? (
                <SidebarState label="No documents" />
              ) : null}
              <DocumentSetNavigator
                documentSets={sortedDocumentSets}
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
                {selectedWorkspace
                  ? ticketQuery.data?.document.title ??
                    markdownQuery.data?.outline[0]?.title ??
                    selectedFile?.workspaceRelativePath ??
                    "Document workspace"
                  : "Start"}
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
              autoOpenLastWorkspace={autoOpenLastWorkspace}
              lastWorkspaceId={workspacesQuery.data?.lastWorkspaceId}
              onAutoOpenLastWorkspaceChange={setAutoOpenLastWorkspace}
              onWorkspaceCreate={handleWorkspaceCreate}
              onWorkspaceSelect={handleWorkspaceSelect}
              selectedDocumentSet={selectedDocumentSet}
              selectedFile={selectedFile}
              selectedFileId={resolvedSelectedFileId}
              selectedWorkspace={selectedWorkspace}
              ticketError={ticketQuery.error}
              ticketIsError={ticketQuery.isError}
              ticketIsLoading={ticketQuery.isLoading}
              workspaceError={workspacesQuery.error}
              workspaces={workspacesQuery.data?.workspaces ?? []}
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
          externalFileChange={externalFileChange}
          onExternalFileReload={reloadExternalFileChange}
          onRunDocumentChange={async () => {
            await ticketQuery.refetch();
            await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
            setExternalFileChange(null);
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
          codexModels={codexModelsQuery.data}
          codexRunDefaults={codexRunDefaultsQuery.data?.defaults}
          codexRunDefaultsError={codexModelsQuery.error ?? codexRunDefaultsQuery.error}
          isLoadingCodexRunDefaults={
            codexModelsQuery.isLoading || codexRunDefaultsQuery.isLoading
          }
          onCodexRunDefaultsChange={saveCodexRunDefaults}
        />
      ) : null}

      <WorkspaceChatDialog
        availableTickets={ticketQuery.data?.document.tickets ?? []}
        codexModels={codexModelsQuery.data}
        codexRunDefaults={codexRunDefaultsQuery.data?.defaults}
        codexRunDefaultsError={codexModelsQuery.error ?? codexRunDefaultsQuery.error}
        documentSets={sortedDocumentSets}
        isLoadingCodexRunDefaults={
          codexModelsQuery.isLoading || codexRunDefaultsQuery.isLoading
        }
        onCodexRunDefaultsChange={saveCodexRunDefaults}
        onOpenChange={setIsWorkspaceChatOpen}
        open={isWorkspaceChatOpen}
        selectedFile={selectedFile}
        selectedWorkspace={selectedWorkspace}
        workspaceId={selectedWorkspaceId}
      />
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

function DocumentListHeader({
  disabled,
  onPreferenceChange,
  preference,
}: {
  disabled: boolean;
  onPreferenceChange: (preference: DocumentSetSortPreference) => void;
  preference: DocumentSetSortPreference;
}) {
  const directionLabel = preference.direction === "asc" ? "Ascending" : "Descending";
  const DirectionIcon = preference.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="grid gap-2">
      <div className="ak-control flex h-9 items-center gap-2 px-3 text-sm text-[var(--ak-ink-muted)]">
        <Search className="size-4" aria-hidden="true" />
        <span>Documents</span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Select
          disabled={disabled}
          onValueChange={(value) => {
            if (!isDocumentSetSortMode(value)) {
              return;
            }

            onPreferenceChange({
              direction: defaultDirectionForDocumentSetSortMode(value),
              mode: value,
            });
          }}
          value={preference.mode}
        >
          <SelectTrigger
            aria-label="Document sort"
            className="h-8 min-w-0 flex-1 px-2.5 text-xs"
            title="Document list sort"
          >
            <SelectValue placeholder="Document order" />
          </SelectTrigger>
          <SelectContent className="min-w-52">
            {DOCUMENT_SET_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.mode} title={option.title} value={option.mode}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={`Sort ${directionLabel.toLowerCase()}`}
          disabled={disabled}
          onClick={() =>
            onPreferenceChange({
              ...preference,
              direction: preference.direction === "asc" ? "desc" : "asc",
            })
          }
          size="iconSm"
          title={`${directionLabel}. Click to toggle sort direction.`}
          type="button"
          variant="outline"
        >
          <DirectionIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
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
  autoOpenLastWorkspace,
  isLoading,
  onAutoOpenLastWorkspaceChange,
  onGoToStartPage,
  onOpenPath,
  onSelect,
  selectedWorkspace,
  selectedWorkspaceId,
  workspaces,
}: {
  autoOpenLastWorkspace: boolean;
  isLoading: boolean;
  onAutoOpenLastWorkspaceChange: (enabled: boolean) => void;
  onGoToStartPage: () => void;
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
        <DialogContent className="h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_auto_auto_minmax(0,1fr)]">
          <DialogHeader className="pr-12">
            <DialogTitle>Switch project</DialogTitle>
            <DialogDescription>
              Select a workspace or open a folder inside the configured roots.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 border-y border-[var(--ak-hairline)] px-5 py-4">
            <div className="ak-panel-muted grid gap-3 p-3 text-sm">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={autoOpenLastWorkspace}
                  className="mt-0.5"
                  onCheckedChange={(checked) => onAutoOpenLastWorkspaceChange(checked === true)}
                />
                <span className="grid gap-1">
                  <span className="font-medium text-[var(--ak-ink)]">
                    Open last project on startup
                  </span>
                  <span className="text-xs leading-5 text-[var(--ak-ink-muted)]">
                    Changes apply on the next root URL load. Use Start page to leave the current project now.
                  </span>
                </span>
              </label>
              {selectedWorkspace ? (
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      onGoToStartPage();
                      setIsSwitcherOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <House className="size-3" aria-hidden="true" />
                    Start page
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <form className="grid gap-2 border-b border-[var(--ak-hairline)] px-5 py-4" onSubmit={(event) => void openPath(event)}>
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

          <div className="ak-scroll-area min-h-0 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 pr-3">
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
  autoOpenLastWorkspace,
  documentSetsError,
  documentSetsIsError,
  documentSetsIsLoading,
  lastWorkspaceId,
  markdownDocument,
  markdownError,
  markdownIsError,
  markdownIsLoading,
  onAutoOpenLastWorkspaceChange,
  onFileSelect,
  onTicketSelect,
  onWorkspaceCreate,
  onWorkspaceSelect,
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
  workspaces,
  workspacesError,
  workspacesIsLoading,
}: {
  autoOpenLastWorkspace: boolean;
  documentSetsError: Error | null;
  documentSetsIsError: boolean;
  documentSetsIsLoading: boolean;
  lastWorkspaceId?: string;
  markdownDocument?: MarkdownDocumentResponse;
  markdownError: Error | null;
  markdownIsError: boolean;
  markdownIsLoading: boolean;
  onAutoOpenLastWorkspaceChange: (enabled: boolean) => void;
  onFileSelect: (file: MarkdownFileSummary) => void;
  onTicketSelect: (ticketId: string) => void;
  onWorkspaceCreate: (input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }) => Promise<void>;
  onWorkspaceSelect: (workspaceId: string) => Promise<void>;
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
  workspaces: WorkspaceSummary[];
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
      <StartWorkspacePage
        autoOpenLastWorkspace={autoOpenLastWorkspace}
        lastWorkspaceId={lastWorkspaceId}
        onAutoOpenLastWorkspaceChange={onAutoOpenLastWorkspaceChange}
        onWorkspaceCreate={onWorkspaceCreate}
        onWorkspaceSelect={onWorkspaceSelect}
        workspaces={workspaces}
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

function StartWorkspacePage({
  autoOpenLastWorkspace,
  lastWorkspaceId,
  onAutoOpenLastWorkspaceChange,
  onWorkspaceCreate,
  onWorkspaceSelect,
  workspaces,
}: {
  autoOpenLastWorkspace: boolean;
  lastWorkspaceId?: string;
  onAutoOpenLastWorkspaceChange: (enabled: boolean) => void;
  onWorkspaceCreate: (input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }) => Promise<void>;
  onWorkspaceSelect: (workspaceId: string) => Promise<void>;
  workspaces: WorkspaceSummary[];
}) {
  const availableWorkspaces = workspaces.filter((workspace) => workspace.isAvailable);
  const recentWorkspaces = availableWorkspaces
    .filter((workspace) => workspace.lastOpenedAt)
    .slice(0, 5);
  const lastWorkspace = availableWorkspaces.find((workspace) => workspace.id === lastWorkspaceId);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 py-6">
      <section className="ak-panel grid gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="ak-muted-label">Start</p>
            <h2 className="ak-title mt-2 text-2xl">Choose a project to begin</h2>
            <p className="ak-body-muted mt-2 max-w-2xl text-sm leading-6">
              Alpha Kanban stays empty on startup unless you choose to reopen the last project.
            </p>
          </div>
          {lastWorkspace ? (
            <Button onClick={() => void onWorkspaceSelect(lastWorkspace.id)} size="sm">
              <FolderKanban className="size-3.5" aria-hidden="true" />
              Open {lastWorkspace.label}
            </Button>
          ) : null}
        </div>

        <label className="ak-panel-muted flex items-start gap-3 p-3 text-sm">
          <Checkbox
            checked={autoOpenLastWorkspace}
            className="mt-0.5"
            onCheckedChange={(checked) => onAutoOpenLastWorkspaceChange(checked === true)}
          />
          <span className="grid gap-1">
            <span className="font-medium text-[var(--ak-ink)]">
              Open the last project automatically
            </span>
            <span className="text-xs leading-5 text-[var(--ak-ink-muted)]">
              When enabled, root URL visits use the saved last workspace. When disabled, this start page is shown first.
            </span>
          </span>
        </label>
      </section>

      <NewProjectPanel onCreate={onWorkspaceCreate} />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="ak-title text-sm">Recent projects</h3>
          <Badge variant="muted">{recentWorkspaces.length}</Badge>
        </div>
        {recentWorkspaces.length > 0 ? (
          <div className="grid gap-2">
            {recentWorkspaces.map((workspace) => (
              <WorkspaceButton
                isSelected={false}
                key={workspace.id}
                onSelect={() => onWorkspaceSelect(workspace.id)}
                workspace={workspace}
              />
            ))}
          </div>
        ) : (
          <p className="ak-body-muted text-sm">
            No recent projects yet. Use the project switcher to open a workspace.
          </p>
        )}
      </section>

      <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
        <h3 className="ak-title text-sm">How Alpha Kanban works</h3>
        <div className="grid gap-2">
          <StartGuideStep
            description="Pick a project inside the configured roots. Alpha Kanban keeps local app state in this control repo."
            icon={FolderKanban}
            title="Select a workspace"
          />
          <StartGuideStep
            description="Document sets are grouped by slug, then shown as Kanban, plan reader, or Markdown reader depending on type."
            icon={BookOpen}
            title="Open a plan, ticket, or inventory document"
          />
          <StartGuideStep
            description="Use ticket chat for one ticket, or Workspace Chat for project-wide questions and plan-ticketing handoff."
            icon={Bot}
            title="Chat with Codex from the right scope"
          />
          <StartGuideStep
            description="Run answers stay in chat logs; durable summaries, status, progress, and completion time stay in ticket Markdown."
            icon={ListChecks}
            title="Keep durable progress in Markdown"
          />
        </div>
      </section>
    </div>
  );
}

function NewProjectPanel({
  onCreate,
}: {
  onCreate: (input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }) => Promise<void>;
}) {
  const [parentRoot, setParentRoot] = useState("");
  const [projectName, setProjectName] = useState("");
  const [gitInit, setGitInit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const directoriesQuery = useQuery({
    queryFn: () => fetchWorkspaceDirectories(),
    queryKey: workspaceDirectoriesKey(undefined),
    staleTime: 30_000,
  });
  const roots = directoriesQuery.data?.roots ?? [];

  useEffect(() => {
    if (!parentRoot && roots[0]?.path) {
      setParentRoot(roots[0].path);
    }
  }, [parentRoot, roots]);

  async function createProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextProjectName = projectName.trim();
    if (!parentRoot || !nextProjectName) {
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      await onCreate({
        gitInit,
        parentRoot,
        projectName: nextProjectName,
      });
      setProjectName("");
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="ak-panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ak-muted-label">New project</p>
          <h3 className="ak-title mt-1 text-base">Create a workspace folder</h3>
          <p className="ak-body-muted mt-1 text-sm leading-6">
            Choose a configured root, create a named folder, and initialize git.
          </p>
        </div>
        <Badge variant="outline">before selection</Badge>
      </div>

      <form className="grid gap-3" onSubmit={(event) => void createProject(event)}>
        <label className="grid gap-1.5 text-xs font-medium text-[var(--ak-ink-muted)]">
          Location
          <select
            className="ak-control-field h-9 px-2 text-sm"
            disabled={isCreating || directoriesQuery.isLoading || roots.length === 0}
            onChange={(event) => setParentRoot(event.target.value)}
            value={parentRoot}
          >
            {roots.length === 0 ? <option value="">No configured roots</option> : null}
            {roots.map((root) => (
              <option key={root.path} value={root.path}>
                {root.label} · {root.path}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5 text-xs font-medium text-[var(--ak-ink-muted)]">
            Project name
            <input
              className="ak-control-field h-9 px-3 text-sm placeholder:text-[var(--ak-ink-faint)]"
              disabled={isCreating}
              onChange={(event) => {
                setProjectName(event.target.value);
                setError(null);
              }}
              placeholder="my-new-project"
              value={projectName}
            />
          </label>
          <Button
            className="shrink-0"
            disabled={!parentRoot || !projectName.trim() || isCreating}
            size="sm"
            type="submit"
          >
            {isCreating ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <FolderKanban className="size-3" aria-hidden="true" />
            )}
            Create
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-[var(--ak-ink-secondary)]">
          <Checkbox
            checked={gitInit}
            disabled={isCreating}
            onCheckedChange={(checked) => setGitInit(checked === true)}
          />
          Initialize git repository with main branch
        </label>

        {directoriesQuery.isError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {formatClientError(normalizeClientError(directoriesQuery.error))}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {formatClientError(error)}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function StartGuideStep({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof FolderKanban;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-[var(--ak-radius-md)] px-1 py-2">
      <span className="flex size-8 items-center justify-center rounded-full border border-[var(--ak-hairline)] bg-[var(--ak-surface)] text-[var(--ak-ink-muted)]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ak-ink)]">{title}</span>
        <span className="text-sm leading-6 text-[var(--ak-ink-muted)]">{description}</span>
      </span>
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

function WorkspaceChatDialog({
  availableTickets,
  codexModels,
  codexRunDefaults,
  codexRunDefaultsError,
  documentSets,
  isLoadingCodexRunDefaults,
  onCodexRunDefaultsChange,
  onOpenChange,
  open,
  selectedFile,
  selectedWorkspace,
  workspaceId,
}: {
  availableTickets: TicketItem[];
  codexModels?: CodexModelsResponse;
  codexRunDefaults?: CodexRunDefaults;
  codexRunDefaultsError?: unknown;
  documentSets: DocumentSetSummary[];
  isLoadingCodexRunDefaults: boolean;
  onCodexRunDefaultsChange: (defaults: {
    model?: string | null;
    reasoningEffort?: string | null;
    speedTier?: string | null;
  }) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedFile?: MarkdownFileSummary;
  selectedWorkspace?: WorkspaceSummary;
  workspaceId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [bypassSandbox, setBypassSandbox] = useState(false);
  const [intent, setIntent] = useState<CodexWorkspaceChatIntent>("general");
  const [mode, setMode] = useState<CodexRunMode>("read_only");
  const [preview, setPreview] = useState<PromptPreviewModel | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [run, setRun] = useState<CodexRunSnapshot | null>(null);
  const [runEvents, setRunEvents] = useState<CodexRunEvent[]>([]);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const canUseWorkspaceChat = Boolean(workspaceId && selectedWorkspace?.isAvailable);
  const workspaceChatQuery = useQuery({
    enabled: Boolean(open && canUseWorkspaceChat && workspaceId),
    queryFn: () => fetchWorkspaceChat(workspaceId ?? ""),
    queryKey: workspaceChatKey(workspaceId),
  });
  const refetchWorkspaceChat = workspaceChatQuery.refetch;
  const documentCount = useMemo(
    () => documentSets.reduce((count, documentSet) => count + documentSet.documents.length, 0),
    [documentSets],
  );
  const latestWorkspaceRunId = useMemo(() => {
    const messages = workspaceChatQuery.data?.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const runId = messages[index]?.runId;
      if (runId) {
        return runId;
      }
    }
    return undefined;
  }, [workspaceChatQuery.data]);
  const scopeResolution = useMemo(
    () =>
      resolveCodexChatScope({
        defaultScope: "workspace",
        rawMessage: draft,
        targetWorkspaceId: workspaceId ?? "unselected-workspace",
      }),
    [draft, workspaceId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setPreview(null);
    setIsPreviewOpen(false);
    setRun(null);
    setRunEvents([]);
    setBypassSandbox(false);
  }, [open, workspaceId]);

  useEffect(() => {
    if (!open || !latestWorkspaceRunId || run?.id === latestWorkspaceRunId) {
      return;
    }

    let isCancelled = false;
    void fetchCodexRun(latestWorkspaceRunId)
      .then((response) => {
        if (isCancelled) {
          return;
        }
        setRun(response.run);
        setRunEvents(response.run.events);
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [latestWorkspaceRunId, open, run?.id]);

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
          void refetchWorkspaceChat();
        });
      }
    });
    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [refetchWorkspaceChat, run?.id, run?.status]);

  async function sendWorkspaceMessage(): Promise<void> {
    if (!workspaceId) {
      return;
    }

    const instructionDraft = draft.trim();
    if (!instructionDraft) {
      return;
    }

    if (bypassSandbox && !confirmBypassSandboxRun()) {
      return;
    }

    setIsPreparing(true);
    setError(null);
    try {
      const response = await startWorkspaceChatRun(workspaceId, {
        bypassSandbox,
        currentFileId: selectedFile?.id,
        intent,
        instructionDraft,
        mode,
      });
      setRun(response.run);
      setRunEvents(response.run.events);
      setPreview({
        args: response.run.args,
        command: response.run.command,
        intent,
        mode: response.run.mode,
        prompt: response.run.prompt,
        resumeSessionId: response.run.resumeSessionId,
        runDefaults: response.run.runDefaults,
        scopeResolution: response.run.scopeResolution,
      });
      setIsPreviewOpen(false);
      setDraft("");
      setBypassSandbox(false);
      await refetchWorkspaceChat();
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsPreparing(false);
    }
  }

  async function loadWorkspacePreview(): Promise<void> {
    if (!workspaceId) {
      return;
    }

    const instructionDraft = draft.trim();
    setIsPreparing(true);
    setError(null);
    try {
      const nextPreview = await previewWorkspacePrompt(workspaceId, {
        bypassSandbox,
        currentFileId: selectedFile?.id,
        intent,
        instructionDraft: instructionDraft || undefined,
        mode,
      });
      setPreview(nextPreview);
      setIsPreviewOpen(true);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsPreparing(false);
    }
  }

  const isWorkspaceRunActive = run?.status === "running";
  const isRunModeLocked = intent !== "general";
  const sendLabel =
    intent === "plan_ticketing_handoff"
      ? "Run handoff"
      : intent === "spec_grilling"
        ? "Ask"
        : "Send";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="ak-workspace-chat-dialog">
        <DialogHeader className="border-b border-[var(--ak-hairline)] px-5 py-4 pr-12">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>Workspace Chat</DialogTitle>
              <DialogDescription className="mt-1 truncate">
                {selectedWorkspace?.root ?? "Select a project"}
              </DialogDescription>
              {selectedFile ? (
                <p className="ak-body-muted mt-1 truncate text-xs">
                  {selectedFile.workspaceRelativePath}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant="warning">{workspaceIntentLabel(intent)}</Badge>
              <Badge variant={mode === "edit" ? "default" : "muted"}>
                {runModeLabel(mode)}
              </Badge>
              {isWorkspaceRunActive ? (
                <Badge variant="warning">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Running
                </Badge>
              ) : run ? (
                <Badge variant="muted">{run.status}</Badge>
              ) : null}
              <Badge variant="outline">{documentCount} docs</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="ak-scroll-area min-h-0 overflow-y-auto bg-[var(--ak-canvas-soft)]">
          <div className="ak-workspace-chat-thread grid gap-4">
            {error ? (
              <div className="rounded-[var(--ak-radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error.message}
              </div>
            ) : null}

            {!canUseWorkspaceChat ? (
              <div className="ak-panel-muted px-3 py-2 text-sm text-[var(--ak-ink-muted)]">
                Select an available project before opening workspace chat.
              </div>
            ) : null}

            <WorkspaceChatHistory
              chat={workspaceChatQuery.data}
              error={workspaceChatQuery.error}
              isLoading={workspaceChatQuery.isLoading}
              run={run}
              runEvents={runEvents}
            />

          </div>
        </div>

        <footer className="ak-workspace-chat-composer">
          <div className="ak-workspace-chat-composer-inner">
            <ScopeComposer
              availableTickets={availableTickets}
              disabled={!canUseWorkspaceChat}
              hideLabel
              label="Workspace message"
              onChange={(nextValue) => {
                setDraft(nextValue);
                setPreview(null);
                setIsPreviewOpen(false);
              }}
              placeholder={workspaceIntentPlaceholder(intent)}
              value={draft}
            />
            <div className="ak-workspace-chat-toolbar">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className="max-w-full rounded-full px-2.5 text-[var(--ak-ink-secondary)]"
                      disabled={!canUseWorkspaceChat}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Settings2 className="size-3.5" aria-hidden="true" />
                      <span className="truncate">{workspaceIntentLabel(intent)}</span>
                      <span className="text-[var(--ak-ink-faint)]">/</span>
                      <span className="truncate">{runModeLabel(mode)}</span>
                      <ChevronDown className="size-3 text-[var(--ak-ink-faint)]" aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="grid w-[min(92vw,560px)] gap-4 p-3"
                    side="top"
                    sideOffset={10}
                  >
                    <section className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                        Purpose
                      </p>
                      <CompactWorkspaceIntentControl
                        disabled={!canUseWorkspaceChat || isWorkspaceRunActive}
                        idPrefix="workspace-chat-intent"
                        intent={intent}
                        onChange={(nextIntent) => {
                          setIntent(nextIntent);
                          setPreview(null);
                          setIsPreviewOpen(false);
                          if (nextIntent === "spec_grilling") {
                            setMode("read_only");
                          }
                          if (nextIntent === "plan_ticketing_handoff") {
                            setMode("edit");
                          }
                        }}
                      />
                    </section>
                    <section className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                        Access
                      </p>
                      <CompactRunModeControl
                        disabled={!canUseWorkspaceChat || isRunModeLocked}
                        idPrefix="workspace-chat-mode"
                        mode={mode}
                        onChange={(nextMode) => {
                          setMode(nextMode);
                          setPreview(null);
                          setIsPreviewOpen(false);
                        }}
                      />
                      {isRunModeLocked ? (
                        <p className="text-xs text-[var(--ak-ink-faint)]">
                          Locked by {workspaceIntentLabel(intent)}.
                        </p>
                      ) : null}
                    </section>
                    <section className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                        Model
                      </p>
                      <CodexRunDefaultsControl
                        defaults={codexRunDefaults}
                        disabled={!canUseWorkspaceChat || isWorkspaceRunActive}
                        isLoading={isLoadingCodexRunDefaults}
                        models={codexModels}
                        onChange={async (nextDefaults) => {
                          setPreview(null);
                          setIsPreviewOpen(false);
                          await onCodexRunDefaultsChange(nextDefaults);
                        }}
                        queryError={codexRunDefaultsError}
                      />
                    </section>
                    <section className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                        Advanced
                      </p>
                      <BypassSandboxControl
                        checked={bypassSandbox}
                        disabled={!canUseWorkspaceChat || isWorkspaceRunActive}
                        onChange={(checked) => {
                          setBypassSandbox(checked);
                          setPreview(null);
                          setIsPreviewOpen(false);
                        }}
                      />
                    </section>
                    <ScopeResolutionPanel
                      emptyMentionsLabel="default workspace scope"
                      mode={mode}
                      resolution={scopeResolution}
                      warnings={codexChatScopeRunWarnings(scopeResolution, mode)}
                    />
                  </PopoverContent>
                </Popover>

                <Popover
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                      setIsPreviewOpen(false);
                      return;
                    }
                    setIsPreviewOpen(true);
                    if (!preview) {
                      void loadWorkspacePreview();
                    }
                  }}
                  open={isPreviewOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      disabled={isPreparing || !canUseWorkspaceChat}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Terminal className="size-3.5" aria-hidden="true" />
                      Preview
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[min(92vw,720px)] p-3"
                    side="top"
                    sideOffset={10}
                  >
                    {preview ? (
                      <PromptPreview preview={preview} />
                    ) : (
                      <div className="flex items-center gap-2 p-2 text-sm text-[var(--ak-ink-muted)]">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        Preparing prompt
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                <Badge variant={scopeResolution.scope === "workspace" ? "warning" : "outline"}>
                  {scopeResolutionLabel(scopeResolution)}
                </Badge>
                <span className="min-w-0 max-w-72 truncate text-xs text-[var(--ak-ink-faint)]">
                  {workspaceComposerSummary({
                    bypassSandbox,
                    defaults: codexRunDefaults,
                    isRunModeLocked,
                    mentions: scopeResolution.mentions.map((mention) => mention.token),
                    mode,
                    models: codexModels,
                  })}
                </span>
                {isWorkspaceRunActive ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--ak-ink-muted)]">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    Running
                  </span>
                ) : run ? (
                  <span className="text-xs text-[var(--ak-ink-faint)]">
                    Last run {run.status}
                  </span>
                ) : null}
              </div>
              <Button
                disabled={
                  isPreparing ||
                  !canUseWorkspaceChat ||
                  !draft.trim() ||
                  isWorkspaceRunActive
                }
                onClick={sendWorkspaceMessage}
                size="sm"
              >
                {isPreparing || isWorkspaceRunActive ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-3" aria-hidden="true" />
                )}
                {isWorkspaceRunActive ? "Running" : sendLabel}
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDrawer({
  availableTickets,
  codexModels,
  codexDisabledReason,
  codexRunDefaults,
  codexRunDefaultsError,
  documentRunSummary,
  documentHash,
  documentMtimeMs,
  externalFileChange,
  fileId,
  isLoadingCodexRunDefaults,
  isResizing,
  mode,
  onCodexRunDefaultsChange,
  onChangeMode,
  onClose,
  onExternalFileReload,
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
  codexModels?: CodexModelsResponse;
  codexDisabledReason?: string;
  codexRunDefaults?: CodexRunDefaults;
  codexRunDefaultsError?: unknown;
  documentRunSummary?: CodexDocumentRunSummaryResponse;
  documentHash: string;
  documentMtimeMs: number;
  externalFileChange?: MarkdownFileChangeEvent | null;
  fileId: string;
  isLoadingCodexRunDefaults: boolean;
  isResizing: boolean;
  mode: TicketDetailMode;
  onCodexRunDefaultsChange: (defaults: {
    model?: string | null;
    reasoningEffort?: string | null;
    speedTier?: string | null;
  }) => Promise<unknown>;
  onChangeMode: (mode: TicketDetailMode) => void;
  onClose: () => void;
  onExternalFileReload: () => Promise<unknown>;
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
  const [bypassSandbox, setBypassSandbox] = useState(false);
  const [preview, setPreview] = useState<CodexPromptPreviewResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [run, setRun] = useState<CodexRunSnapshot | null>(null);
  const [runEvents, setRunEvents] = useState<CodexRunEvent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
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
    setBypassSandbox(false);
    setPreview(null);
    setIsPreviewOpen(false);
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
          bypassSandbox,
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
    if (bypassSandbox && !confirmBypassSandboxRun()) {
      return;
    }

    setIsStartingRun(true);
    setError(null);
    try {
      const response = await startCodexRun(workspaceId ?? "", {
        bypassSandbox,
        expectedHash: documentHash,
        expectedMtimeMs: documentMtimeMs,
        fileId,
        ticketId: ticket.id,
        instructionDraft: runDraft.trim() || undefined,
        mode: runMode,
      });
      setRun(response.run);
      setRunEvents(response.run.events);
      setIsPreviewOpen(false);
      setPreview({
        fileId: response.run.fileId,
        ticketId: response.run.ticketId,
        prompt: response.run.prompt,
        command: response.run.command,
        args: response.run.args,
        mode: response.run.mode,
        resumeSessionId: response.run.resumeSessionId,
        runDefaults: response.run.runDefaults,
        scopeResolution: response.run.scopeResolution,
        statePath: "",
      });
      await onRunDocumentChange();
      await onRunStatusChange();
      await ticketChatQuery.refetch();
      setRunDraft("");
      setBypassSandbox(false);
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

  async function retryChatMessage(message: CodexChatMessage): Promise<void> {
    if (!message.id || !canStartCodexRun) {
      return;
    }

    if (bypassSandbox && !confirmBypassSandboxRun()) {
      return;
    }

    const sourceRun = documentRunSummary?.runs.find((item) => item.id === message.runId);
    setRetryingMessageId(message.id);
    setError(null);
    try {
      const response = await startCodexRun(workspaceId ?? "", {
        bypassSandbox,
        expectedHash: documentHash,
        expectedMtimeMs: documentMtimeMs,
        fileId,
        ticketId: ticket.id,
        sourceMessageId: message.id,
        mode: sourceRun?.mode ?? runMode,
      });
      setRun(response.run);
      setRunEvents(response.run.events);
      setIsPreviewOpen(false);
      setPreview({
        fileId: response.run.fileId,
        ticketId: response.run.ticketId,
        prompt: response.run.prompt,
        command: response.run.command,
        args: response.run.args,
        mode: response.run.mode,
        resumeSessionId: response.run.resumeSessionId,
        runDefaults: response.run.runDefaults,
        scopeResolution: response.run.scopeResolution,
        statePath: "",
      });
      await onRunDocumentChange();
      await onRunStatusChange();
      await ticketChatQuery.refetch();
      setBypassSandbox(false);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setRetryingMessageId(null);
    }
  }

  async function deleteChatMessage(message: CodexChatMessage): Promise<void> {
    const confirmed = window.confirm(
      "Delete this failed chat message? The raw run log will be kept.",
    );
    if (!confirmed) {
      return;
    }

    setDeletingMessageId(message.id);
    setError(null);
    try {
      await deleteTicketChatMessage(workspaceId ?? "", fileId, ticket.id, message.id);
      await ticketChatQuery.refetch();
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setDeletingMessageId(null);
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
    canUseCodex &&
    !externalFileChange &&
    (documentRunSummary?.canStartRun ?? true) &&
    isScopeAllowed;
  const ticketChatMessageCount = ticketChatQuery.data?.messages.length ?? 0;
  const panelStyle = {
    "--ticket-detail-width": `${width}px`,
  } as CSSProperties;
  const panelClassName =
    mode === "side"
      ? "absolute inset-y-0 right-0 flex w-[min(var(--ticket-detail-width),100vw)] flex-col overflow-clip border-l border-[var(--ak-hairline)] bg-[var(--ak-surface)] shadow-[var(--ak-shadow-soft)]"
      : "relative flex max-h-[min(960px,calc(100dvh-2rem))] w-[min(960px,calc(100vw-2rem))] flex-col overflow-clip rounded-[var(--ak-radius-lg)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] shadow-[var(--ak-shadow-soft)]";
  const ticketSendLabel = runMode === "read_only" ? "Ask" : "Run";

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
          {externalFileChange ? (
            <ExternalFileChangeBanner
              event={externalFileChange}
              hasLocalDraft={canSaveStatus || Boolean(runDraft.trim())}
              onReload={onExternalFileReload}
            />
          ) : null}
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
              <Button
                disabled={!canSaveStatus || isSaving || Boolean(externalFileChange)}
                onClick={saveStatus}
                size="sm"
              >
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
                  <h3 className="ak-title text-sm">Ticket chat</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{ticketChatMessageCount}</Badge>
                  <Badge variant={runMode === "edit" ? "default" : "muted"}>
                    {runModeLabel(runMode)}
                  </Badge>
                </div>
              </div>
              {codexDisabledReason ? (
                <div className="ak-panel-muted px-3 py-2 text-xs text-[var(--ak-ink-muted)]">
                  {codexDisabledReason}
                </div>
              ) : null}
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
                canStartRun={canStartCodexRun}
                deletingMessageId={deletingMessageId}
                error={ticketChatQuery.error}
                isLoading={ticketChatQuery.isLoading}
                onDeleteMessage={(message) => void deleteChatMessage(message)}
                onRetryMessage={(message) => void retryChatMessage(message)}
                retryingMessageId={retryingMessageId}
                liveRun={run}
                liveRunEvents={runEvents}
                runs={documentRunSummary?.runs ?? []}
              />
              <div className="ak-workspace-chat-composer-inner ak-ticket-chat-composer-inner">
                <ScopeComposer
                  availableTickets={availableTickets}
                  disabled={!canUseCodex}
                  hideLabel
                  label="Ticket message"
                  onChange={(nextValue) => {
                    setRunDraft(nextValue);
                    setPreview(null);
                    setIsPreviewOpen(false);
                  }}
                  placeholder={
                    runMode === "read_only"
                      ? "답변받을 질문을 입력"
                      : "이번 Codex 실행에서 처리할 지시를 입력"
                  }
                  value={runDraft}
                />
                <div className="ak-workspace-chat-toolbar">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          className="max-w-full rounded-full px-2.5 text-[var(--ak-ink-secondary)]"
                          disabled={!canUseCodex}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Settings2 className="size-3.5" aria-hidden="true" />
                          <span className="truncate">{runModeLabel(runMode)}</span>
                          <ChevronDown className="size-3 text-[var(--ak-ink-faint)]" aria-hidden="true" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="grid w-[min(92vw,560px)] gap-4 p-3"
                        side="top"
                        sideOffset={10}
                      >
                        <section className="grid gap-2">
                          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                            Access
                          </p>
                          <RunModeControl
                            idPrefix={`codex-run-mode-${ticket.id}`}
                            disabled={!canUseCodex}
                            mode={runMode}
                            onChange={(nextMode) => {
                              setRunMode(nextMode);
                              setPreview(null);
                              setIsPreviewOpen(false);
                            }}
                          />
                        </section>
                        <section className="grid gap-2">
                          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                            Model
                          </p>
                          <CodexRunDefaultsControl
                            defaults={codexRunDefaults}
                            disabled={!canUseCodex || run?.status === "running"}
                            isLoading={isLoadingCodexRunDefaults}
                            models={codexModels}
                            onChange={async (nextDefaults) => {
                              setPreview(null);
                              setIsPreviewOpen(false);
                              await onCodexRunDefaultsChange(nextDefaults);
                            }}
                            queryError={codexRunDefaultsError}
                          />
                        </section>
                        <section className="grid gap-2">
                          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                            Advanced
                          </p>
                          <BypassSandboxControl
                            checked={bypassSandbox}
                            disabled={!canUseCodex || run?.status === "running"}
                            onChange={(checked) => {
                              setBypassSandbox(checked);
                              setPreview(null);
                              setIsPreviewOpen(false);
                            }}
                          />
                        </section>
                        <ScopeResolutionPanel
                          mode={runMode}
                          resolution={scopeResolution}
                          warnings={scopeWarnings}
                        />
                      </PopoverContent>
                    </Popover>

                    <Popover
                      onOpenChange={(nextOpen) => {
                        if (!nextOpen) {
                          setIsPreviewOpen(false);
                          return;
                        }
                        setIsPreviewOpen(true);
                        if (!preview) {
                          void loadPreview();
                        }
                      }}
                      open={isPreviewOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          disabled={isPreviewing || !canUseCodex || Boolean(externalFileChange)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {isPreviewing ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Terminal className="size-3.5" aria-hidden="true" />
                          )}
                          Preview
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[min(92vw,720px)] p-3"
                        side="top"
                        sideOffset={10}
                      >
                        {preview ? (
                          <PromptPreview preview={preview} />
                        ) : (
                          <div className="flex items-center gap-2 p-2 text-sm text-[var(--ak-ink-muted)]">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            Preparing prompt
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>

                    <Badge variant={scopeResolution.scope === "workspace" ? "warning" : "outline"}>
                      {scopeResolutionLabel(scopeResolution)}
                    </Badge>
                    <span className="min-w-0 max-w-72 truncate text-xs text-[var(--ak-ink-faint)]">
                      {workspaceComposerSummary({
                        bypassSandbox,
                        defaults: codexRunDefaults,
                        isRunModeLocked: false,
                        mentions: scopeResolution.mentions.map((mention) => mention.token),
                        mode: runMode,
                        models: codexModels,
                      })}
                    </span>
                    {run?.status === "running" ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--ak-ink-muted)]">
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        Running
                      </span>
                    ) : run ? (
                      <span className="text-xs text-[var(--ak-ink-faint)]">
                        Last run {run.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                    <Button
                      disabled={isStartingRun || run?.status === "running" || !canStartCodexRun}
                      onClick={runCodex}
                      size="sm"
                    >
                      {isStartingRun || run?.status === "running" ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="size-3" aria-hidden="true" />
                      )}
                      {run?.status === "running" ? "Running" : ticketSendLabel}
                    </Button>
                  </div>
                </div>
              </div>
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

function ExternalFileChangeBanner({
  event,
  hasLocalDraft,
  onReload,
}: {
  event: MarkdownFileChangeEvent;
  hasLocalDraft: boolean;
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
    <div className="mb-5 rounded-[var(--ak-radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {event.eventType === "removed" ? "Markdown file was removed" : "File changed externally"}
          </p>
          <p className="mt-1 break-words text-xs text-amber-800">
            {event.workspaceRelativePath} · {formatDateTime(event.observedAt)}
          </p>
          {hasLocalDraft ? (
            <p className="mt-1 text-xs text-amber-800">
              Reload before saving or running Codex so the draft does not use stale Markdown.
            </p>
          ) : null}
        </div>
        <Button disabled={isReloading} onClick={reload} size="sm" variant="outline">
          {isReloading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="size-3" aria-hidden="true" />
          )}
          Reload
        </Button>
      </div>
    </div>
  );
}

const RUN_MODE_OPTIONS: Array<{ label: string; mode: CodexRunMode }> = [
  { label: "Edit files", mode: "edit" },
  { label: "Read-only", mode: "read_only" },
];

const WORKSPACE_CHAT_INTENT_OPTIONS: Array<{
  intent: CodexWorkspaceChatIntent;
  label: string;
}> = [
  { intent: "general", label: "Chat" },
  { intent: "spec_grilling", label: "Spec" },
  { intent: "plan_ticketing_handoff", label: "Plan/Ticket" },
];

function ScopeComposer({
  availableTickets,
  disabled,
  hideLabel = false,
  label,
  onChange,
  placeholder,
  value,
}: {
  availableTickets: TicketItem[];
  disabled: boolean;
  hideLabel?: boolean;
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
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
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

function CompactRunModeControl({
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
    <fieldset className="flex min-h-8 items-center gap-1 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-1">
      <legend className="sr-only">Mode</legend>
      {RUN_MODE_OPTIONS.map((option) => {
        const isSelected = mode === option.mode;
        const inputId = `${idPrefix}-compact-${option.mode}`;
        return (
          <label
            className={[
              "ak-focus-ring flex h-6 cursor-pointer items-center rounded-[var(--ak-radius-sm)] px-2 text-xs font-medium transition-colors",
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
              name={`${idPrefix}-compact`}
              onChange={() => onChange(option.mode)}
              type="radio"
            />
            {option.mode === "edit" ? "Edit" : "Read-only"}
          </label>
        );
      })}
    </fieldset>
  );
}

function CompactWorkspaceIntentControl({
  disabled,
  idPrefix,
  intent,
  onChange,
}: {
  disabled: boolean;
  idPrefix: string;
  intent: CodexWorkspaceChatIntent;
  onChange: (intent: CodexWorkspaceChatIntent) => void;
}) {
  return (
    <fieldset className="flex min-h-8 items-center gap-1 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-1">
      <legend className="sr-only">Workspace chat purpose</legend>
      {WORKSPACE_CHAT_INTENT_OPTIONS.map((option) => {
        const isSelected = intent === option.intent;
        const inputId = `${idPrefix}-compact-${option.intent}`;
        return (
          <label
            className={[
              "ak-focus-ring flex h-6 cursor-pointer items-center rounded-[var(--ak-radius-sm)] px-2 text-xs font-medium transition-colors",
              isSelected
                ? "bg-[var(--ak-primary)] text-white"
                : "text-[var(--ak-ink-muted)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
              disabled ? "cursor-not-allowed opacity-45" : "",
            ].join(" ")}
            htmlFor={inputId}
            key={option.intent}
          >
            <input
              checked={isSelected}
              className="sr-only"
              disabled={disabled}
              id={inputId}
              name={`${idPrefix}-compact`}
              onChange={() => onChange(option.intent)}
              type="radio"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

function BypassSandboxControl({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "ak-focus-ring grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2 text-xs transition-colors hover:bg-[var(--ak-surface-hover)]",
        checked ? "border-amber-200 bg-amber-50 text-amber-950" : "text-[var(--ak-ink-secondary)]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      title="Pass --dangerously-bypass-approvals-and-sandbox to Codex CLI for this run only"
    >
      <Checkbox
        checked={checked}
        className="mt-0.5 size-3.5"
        disabled={disabled}
        onCheckedChange={(nextChecked) => onChange(nextChecked === true)}
      />
      <span className="grid gap-0.5">
        <span className="font-semibold">Bypass approvals and sandbox</span>
        <span className="font-normal text-[var(--ak-ink-muted)]">
          This run only. Allows operations such as Git metadata creation, installs, and scripts.
        </span>
      </span>
    </label>
  );
}

function ScopeResolutionPanel({
  emptyMentionsLabel = "default ticket scope",
  mode,
  resolution,
  warnings,
}: {
  emptyMentionsLabel?: string;
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
          <span className="text-[var(--ak-ink-faint)]">{emptyMentionsLabel}</span>
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

function CodexRunDefaultsControl({
  defaults,
  disabled,
  isLoading,
  models,
  onChange,
  queryError,
}: {
  defaults?: CodexRunDefaults;
  disabled: boolean;
  isLoading: boolean;
  models?: CodexModelsResponse;
  onChange: (defaults: {
    model?: string | null;
    reasoningEffort?: string | null;
    speedTier?: string | null;
  }) => Promise<unknown>;
  queryError?: unknown;
}) {
  const [draft, setDraft] = useState<CodexRunDefaults>(defaults ?? {});
  const [saveError, setSaveError] = useState<ClientApiError | Error | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isSaving) {
      return;
    }
    setDraft(defaults ?? {});
  }, [defaults?.model, defaults?.reasoningEffort, defaults?.speedTier, isSaving]);

  const modelOptions = models?.models ?? [];
  const selectedModel = modelOptions.find((model) => model.slug === draft.model);
  const reasoningOptions = selectedModel?.supportedReasoning ?? [];
  const canUseFast = Boolean(selectedModel?.supportsFast);
  const isDisabled = disabled || isLoading || isSaving;
  const error = saveError ?? (queryError ? normalizeClientError(queryError) : null);

  async function commitDefaults(nextDraft: CodexRunDefaults): Promise<void> {
    setDraft(nextDraft);
    setSaveError(null);
    setIsSaving(true);
    try {
      await onChange({
        model: nextDraft.model ?? null,
        reasoningEffort: nextDraft.reasoningEffort ?? null,
        speedTier: nextDraft.speedTier ?? null,
      });
    } catch (nextError) {
      setSaveError(normalizeClientError(nextError));
      setDraft(defaults ?? {});
    } finally {
      setIsSaving(false);
    }
  }

  function nextDraftForModel(value: string): CodexRunDefaults {
    const model = value === CLI_DEFAULT_SELECT_VALUE ? undefined : value;
    const nextModel = modelOptions.find((item) => item.slug === model);
    const reasoningEffort =
      nextModel?.supportedReasoning.some((level) => level.effort === draft.reasoningEffort)
        ? draft.reasoningEffort
        : undefined;
    const speedTier = nextModel?.supportsFast ? draft.speedTier : undefined;

    return {
      model,
      reasoningEffort,
      speedTier,
    };
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Select
        disabled={isDisabled}
        onValueChange={(value) => void commitDefaults(nextDraftForModel(value))}
        value={draft.model ?? CLI_DEFAULT_SELECT_VALUE}
      >
        <SelectTrigger
          aria-label="Codex model"
          className="h-8 w-auto min-w-[8.5rem] max-w-52 rounded-full px-2.5 text-xs"
        >
          <Zap className="size-3.5 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          <SelectValue placeholder="CLI model" />
        </SelectTrigger>
        <SelectContent className="min-w-56">
          <SelectItem value={CLI_DEFAULT_SELECT_VALUE}>CLI default</SelectItem>
          {draft.model && !selectedModel ? (
            <SelectItem value={draft.model}>{draft.model}</SelectItem>
          ) : null}
          {modelOptions.map((model) => (
            <SelectItem key={model.slug} value={model.slug}>
              {compactModelLabel(model.displayName, model.slug)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        disabled={isDisabled || !draft.model || reasoningOptions.length === 0}
        onValueChange={(value) => {
          void commitDefaults({
            ...draft,
            reasoningEffort: value === MODEL_DEFAULT_SELECT_VALUE ? undefined : value,
          });
        }}
        value={draft.reasoningEffort ?? MODEL_DEFAULT_SELECT_VALUE}
      >
        <SelectTrigger
          aria-label="Codex reasoning effort"
          className="h-8 w-auto min-w-[6.75rem] rounded-full px-2.5 text-xs"
        >
          <SelectValue placeholder="Model default" />
        </SelectTrigger>
        <SelectContent className="min-w-44">
          <SelectItem value={MODEL_DEFAULT_SELECT_VALUE}>Model default</SelectItem>
          {draft.reasoningEffort &&
          !reasoningOptions.some((level) => level.effort === draft.reasoningEffort) ? (
            <SelectItem value={draft.reasoningEffort}>
              {reasoningEffortLabel(draft.reasoningEffort)}
            </SelectItem>
          ) : null}
          {reasoningOptions.map((level) => (
            <SelectItem key={level.effort} value={level.effort}>
              {reasoningEffortLabel(level.effort)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label
        className={[
          "ak-focus-ring flex h-8 items-center gap-2 rounded-full border border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-2.5 text-xs font-medium text-[var(--ak-ink-secondary)] transition-colors hover:bg-[var(--ak-surface-hover)]",
          isDisabled || !canUseFast ? "cursor-not-allowed opacity-45" : "cursor-pointer",
          draft.speedTier === "fast" ? "border-amber-200 bg-amber-50 text-amber-900" : "",
        ].join(" ")}
        title={canUseFast ? "Use Codex fast service tier" : "Selected model does not expose fast tier"}
      >
        <Checkbox
          checked={draft.speedTier === "fast"}
          className="size-3.5"
          disabled={isDisabled || !canUseFast}
          onCheckedChange={(checked) => {
            void commitDefaults({
              ...draft,
              speedTier: checked === true ? "fast" : undefined,
            });
          }}
        />
        Fast
      </label>

      {isSaving ? (
        <span className="flex items-center gap-1 text-xs text-[var(--ak-ink-faint)]">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          saving
        </span>
      ) : null}
      {error ? (
        <span className="max-w-72 truncate text-xs text-red-700" title={error.message}>
          {error.message}
        </span>
      ) : null}
    </div>
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
  canStartRun,
  chat,
  deletingMessageId,
  error,
  isLoading,
  liveRun,
  liveRunEvents,
  onDeleteMessage,
  onRetryMessage,
  retryingMessageId,
  runs,
}: {
  canStartRun: boolean;
  chat?: CodexTicketChatResponse;
  deletingMessageId: string | null;
  error: Error | null;
  isLoading: boolean;
  liveRun: CodexRunSnapshot | null;
  liveRunEvents: CodexRunEvent[];
  onDeleteMessage: (message: CodexChatMessage) => void;
  onRetryMessage: (message: CodexChatMessage) => void;
  retryingMessageId: string | null;
  runs: CodexRunSummary[];
}) {
  const messages = chat?.messages ?? [];
  const entries = useMemo(() => buildChatHistoryEntries(messages), [messages]);
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const assistantRunIds = useMemo(
    () =>
      new Set(
        messages
          .filter((message) => message.role === "assistant" && message.runId)
          .map((message) => message.runId as string),
      ),
    [messages],
  );

  return (
    <div className="grid gap-3">
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
      {entries.length > 0 ? (
        <div className="grid gap-3">
          {entries.map((entry) =>
            entry.kind === "message" ? (
              <TicketChatMessage
                assistantRunIds={assistantRunIds}
                canStartRun={canStartRun}
                isDeleting={deletingMessageId === entry.message.id}
                isRetrying={retryingMessageId === entry.message.id}
                key={entry.message.id}
                message={entry.message}
                onDelete={onDeleteMessage}
                onRetry={onRetryMessage}
                run={entry.message.runId ? runById.get(entry.message.runId) : undefined}
                variant="stream"
              />
            ) : (
              <RunActivityForRunId
                defaultExpanded={!assistantRunIds.has(entry.runId)}
                key={`activity-${entry.runId}`}
                liveRun={liveRun}
                liveRunEvents={liveRunEvents}
                runId={entry.runId}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceChatHistory({
  chat,
  error,
  isLoading,
  run,
  runEvents,
}: {
  chat?: CodexWorkspaceChatResponse;
  error: Error | null;
  isLoading: boolean;
  run: CodexRunSnapshot | null;
  runEvents: CodexRunEvent[];
}) {
  const messages = chat?.messages ?? [];
  const entries = useMemo(() => buildChatHistoryEntries(messages), [messages]);
  const assistantRunIds = useMemo(
    () =>
      new Set(
        messages
          .filter((message) => message.role === "assistant" && message.runId)
          .map((message) => message.runId as string),
      ),
    [messages],
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          <h4 className="ak-title text-sm">Workspace chat</h4>
        </div>
        <Badge variant="muted">{messages.length}</Badge>
      </div>
      {isLoading ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">Loading workspace chat</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700">Could not load workspace chat: {error.message}</p>
      ) : null}
      {!isLoading && !error && messages.length === 0 ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">
          Project-wide messages will appear here.
        </p>
      ) : null}
      {entries.length > 0 ? (
        <div className="grid gap-3">
          {entries.map((entry) => (
            entry.kind === "message" ? (
              <TicketChatMessage key={entry.message.id} message={entry.message} variant="stream" />
            ) : (
              <RunActivityForRunId
                defaultExpanded={!assistantRunIds.has(entry.runId)}
                key={`activity-${entry.runId}`}
                liveRun={run}
                liveRunEvents={runEvents}
                runId={entry.runId}
              />
            )
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RunActivityForRunId({
  defaultExpanded,
  liveRun,
  liveRunEvents,
  runId,
}: {
  defaultExpanded: boolean;
  liveRun: CodexRunSnapshot | null;
  liveRunEvents: CodexRunEvent[];
  runId: string;
}) {
  const isLiveRun = liveRun?.id === runId;
  const runQuery = useQuery({
    enabled: !isLiveRun,
    queryFn: () => fetchCodexRun(runId),
    queryKey: ["codex-run", runId],
    staleTime: 30_000,
  });
  const run = isLiveRun ? liveRun : runQuery.data?.run;
  const events = isLiveRun ? liveRunEvents : run?.events ?? [];

  if (!run) {
    return (
      <section className="ak-workspace-run-activity">
        <div className="ak-workspace-run-activity-header">
          <div className="flex min-w-0 items-center gap-2">
            <Terminal className="size-3.5 text-[var(--ak-ink-muted)]" aria-hidden="true" />
            <span className="text-sm font-semibold text-[var(--ak-ink)]">Activity</span>
            <Badge variant="muted">{runQuery.isError ? "unavailable" : "loading"}</Badge>
          </div>
          <span className="truncate text-xs text-[var(--ak-ink-faint)]">{runId.slice(0, 8)}</span>
        </div>
        {runQuery.isError ? (
          <p className="text-xs text-red-700">
            Could not load run activity: {normalizeClientError(runQuery.error).message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <RunActivity
      defaultExpanded={run.status === "running" ? true : defaultExpanded}
      events={events}
      run={run}
    />
  );
}

function buildChatHistoryEntries(
  messages: CodexChatMessage[],
): ChatHistoryEntry[] {
  const entries: ChatHistoryEntry[] = [];
  const insertedRunIds = new Set<string>();

  for (const message of messages) {
    const runId = message.runId;
    if (message.role === "assistant" && runId && !insertedRunIds.has(runId)) {
      entries.push({ kind: "activity", runId });
      insertedRunIds.add(runId);
    }

    entries.push({ kind: "message", message });

    if (message.role !== "assistant" && runId && !insertedRunIds.has(runId)) {
      entries.push({ kind: "activity", runId });
      insertedRunIds.add(runId);
    }
  }

  return entries;
}

function RunActivity({
  defaultExpanded,
  events,
  run,
}: {
  defaultExpanded: boolean;
  events: CodexRunEvent[];
  run: CodexRunSnapshot;
}) {
  const activityItems = buildRunActivityItems(events);
  const visibleItems = selectVisibleRunActivityItems(activityItems);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const previousRunIdRef = useRef(run.id);

  useEffect(() => {
    if (previousRunIdRef.current !== run.id) {
      previousRunIdRef.current = run.id;
      setIsExpanded(defaultExpanded);
      return;
    }

    if (run.status === "running") {
      return;
    }

    if (!defaultExpanded) {
      setIsExpanded(false);
    }
  }, [defaultExpanded, run.id, run.status]);

  return (
    <section className="ak-workspace-run-activity">
      <button
        aria-expanded={isExpanded}
        className="ak-workspace-run-activity-header"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={[
              "size-3.5 shrink-0 text-[var(--ak-ink-faint)] transition-transform",
              isExpanded ? "" : "-rotate-90",
            ].join(" ")}
            aria-hidden="true"
          />
          {run.status === "running" ? (
            <Loader2 className="size-3.5 animate-spin text-[var(--ak-ink-muted)]" aria-hidden="true" />
          ) : (
            <Terminal className="size-3.5 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold text-[var(--ak-ink)]">Activity</span>
          <Badge variant={run.status === "running" ? "warning" : "muted"}>{run.status}</Badge>
          {isBypassSandboxArgs(run.args) ? <Badge variant="warning">bypass sandbox</Badge> : null}
          <RunDefaultsBadges defaults={run.runDefaults} compact />
        </div>
        <span className="text-xs text-[var(--ak-ink-faint)]">
          {activityItems.length} steps · {events.length} events
        </span>
      </button>
      {isExpanded ? (
        <>
          <ol className="ak-workspace-run-activity-list">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => (
                <li className="ak-workspace-run-activity-row" key={item.id}>
                  <span
                    className={[
                      "ak-workspace-run-activity-dot",
                      `ak-workspace-run-activity-dot-${item.tone}`,
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--ak-ink-secondary)]">
                      {item.label}
                    </p>
                    <p className="ak-workspace-run-activity-detail text-xs text-[var(--ak-ink-faint)]">
                      {item.detail}
                    </p>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-xs text-[var(--ak-ink-faint)]">Waiting for Codex activity.</li>
            )}
          </ol>
          <p className="truncate text-xs text-[var(--ak-ink-faint)]" title={run.logPath}>
            {run.logPath}
          </p>
        </>
      ) : null}
    </section>
  );
}

function TicketChatMessage({
  assistantRunIds,
  canStartRun,
  isDeleting,
  isRetrying,
  message,
  onDelete,
  onRetry,
  run,
  variant = "card",
}: {
  assistantRunIds?: Set<string>;
  canStartRun?: boolean;
  isDeleting?: boolean;
  isRetrying?: boolean;
  message: CodexChatMessage;
  onDelete?: (message: CodexChatMessage) => void;
  onRetry?: (message: CodexChatMessage) => void;
  run?: CodexRunSummary;
  variant?: "card" | "stream";
}) {
  const isAssistant = message.role === "assistant";
  const isStream = variant === "stream";
  const intent = workspaceIntentFromMetadata(message.metadata);
  const hasAssistantReply = Boolean(message.runId && assistantRunIds?.has(message.runId));
  const canRetry =
    !isAssistant &&
    Boolean(onRetry) &&
    Boolean(message.runId) &&
    !hasAssistantReply &&
    (!run || run.rawStatus === "failed" || run.rawStatus === "cancelled");
  const canDelete =
    !isAssistant &&
    Boolean(onDelete) &&
    !hasAssistantReply &&
    (!run || run.rawStatus === "failed" || run.rawStatus === "cancelled");

  return (
    <article
      className={[
        "grid gap-2",
        isStream
          ? isAssistant
            ? "px-1 py-2"
            : "ml-auto max-w-[min(76%,760px)] rounded-2xl border border-[var(--ak-hairline)] bg-[var(--ak-surface-active)] px-3 py-2"
          : "rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-3",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={isAssistant ? "outline" : "default"}>
            {isAssistant ? "Assistant" : "User"}
          </Badge>
          {intent ? <Badge variant="warning">{workspaceIntentLabel(intent)}</Badge> : null}
          {message.runId ? <Badge variant="muted">{message.runId.slice(0, 8)}</Badge> : null}
          {canRetry ? (
            <Badge variant={run ? "warning" : "muted"}>
              {run ? runLabel(run.rawStatus) : "Run status unknown"}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <time className="text-xs text-[var(--ak-ink-faint)]" dateTime={message.createdAt}>
            {formatDateTime(message.createdAt)}
          </time>
          {canRetry ? (
            <Button
              disabled={!canStartRun || isRetrying}
              onClick={() => onRetry?.(message)}
              size="xs"
              title={canStartRun ? "Retry this chat message" : "Another Codex run is active"}
              variant="outline"
            >
              {isRetrying ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="size-3" aria-hidden="true" />
              )}
              Retry
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              disabled={isDeleting || isRetrying}
              onClick={() => onDelete?.(message)}
              size="xs"
              title="Delete this chat message"
              variant="ghost"
            >
              {isDeleting ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3" aria-hidden="true" />
              )}
              Delete
            </Button>
          ) : null}
        </div>
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

function PromptPreview({ preview }: { preview: PromptPreviewModel }) {
  return (
    <div className="ak-panel-muted grid gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{preview.command}</Badge>
        {preview.intent ? (
          <Badge variant="warning">{workspaceIntentLabel(preview.intent)}</Badge>
        ) : null}
        <Badge variant={preview.mode === "edit" ? "default" : "muted"}>
          {runModeLabel(preview.mode)}
        </Badge>
        <Badge variant={preview.scopeResolution.scope === "workspace" ? "warning" : "outline"}>
          {scopeResolutionLabel(preview.scopeResolution)}
        </Badge>
        <Badge variant="muted">
          {preview.resumeSessionId ? "resume session" : "new session"}
        </Badge>
        {isBypassSandboxArgs(preview.args) ? (
          <Badge variant="warning">bypass sandbox</Badge>
        ) : null}
        <RunDefaultsBadges defaults={preview.runDefaults} />
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

function RunDefaultsBadges({
  compact = false,
  defaults,
}: {
  compact?: boolean;
  defaults: CodexAppliedRunDefaults;
}) {
  const hasAnyDefault = Boolean(
    defaults.model || defaults.reasoningEffort || defaults.speedTier,
  );

  if (!hasAnyDefault) {
    return <Badge variant="muted">CLI defaults</Badge>;
  }

  return (
    <>
      {defaults.model ? (
        <Badge variant="outline">{compact ? defaults.model : `model ${defaults.model}`}</Badge>
      ) : null}
      {defaults.reasoningEffort ? (
        <Badge variant="outline">
          {compact ? defaults.reasoningEffort : `reasoning ${defaults.reasoningEffort}`}
        </Badge>
      ) : null}
      {defaults.speedTier ? (
        <Badge variant={defaults.speedTierApplied ? "warning" : "muted"}>
          {defaults.speedTierApplied
            ? `${defaults.speedTier} tier`
            : `${defaults.speedTier} saved, not applied`}
        </Badge>
      ) : null}
    </>
  );
}

function workspaceComposerSummary({
  bypassSandbox,
  defaults,
  isRunModeLocked,
  mentions,
  mode,
  models,
}: {
  bypassSandbox: boolean;
  defaults?: CodexRunDefaults;
  isRunModeLocked: boolean;
  mentions: string[];
  mode: CodexRunMode;
  models?: CodexModelsResponse;
}): string {
  const model = defaults?.model
    ? (models?.models.find((item) => item.slug === defaults.model)?.displayName ?? defaults.model)
    : "CLI default";
  const reasoning = defaults?.reasoningEffort
    ? reasoningEffortLabel(defaults.reasoningEffort)
    : "model default";
  const speed = defaults?.speedTier === "fast" ? "fast tier" : "standard";
  const access = isRunModeLocked ? `${runModeLabel(mode)} locked` : runModeLabel(mode);
  const scope = mentions.length > 0 ? mentions.join(", ") : "default scope";
  const sandbox = bypassSandbox ? "bypass sandbox" : undefined;

  return [compactModelLabel(model, defaults?.model ?? model), reasoning, speed, access, scope, sandbox]
    .filter(Boolean)
    .join(" · ");
}

function confirmBypassSandboxRun(): boolean {
  return window.confirm(
    "This run will bypass Codex approvals and sandbox restrictions. Continue only if you trust the target workspace and command scope.",
  );
}

function isBypassSandboxArgs(args: string[]): boolean {
  return args.includes("--dangerously-bypass-approvals-and-sandbox");
}

function buildRunActivityItems(events: CodexRunEvent[]): RunActivityItem[] {
  const completedItemIds = new Set(
    events
      .map((event) => getRunJsonItem(event))
      .filter((item) => getStringValue(item, "status") !== "in_progress")
      .map((item) => getStringValue(item, "id"))
      .filter((id): id is string => Boolean(id)),
  );

  return events.flatMap((event) => {
    if (event.type === "prompt") {
      return [
        {
          detail: summarizePromptEvent(event),
          id: `event-${event.id}`,
          label: "Prompt prepared",
          priority: 1,
          tone: "info" as const,
        },
      ];
    }

    if (event.type === "stderr") {
      return [
        {
          detail: summarizeText(event.message),
          id: `event-${event.id}`,
          label: "CLI stderr",
          priority: 2,
          tone: "warning" as const,
        },
      ];
    }

    if (event.type === "error") {
      return [
        {
          detail: summarizeText(event.message),
          id: `event-${event.id}`,
          label: "Run error",
          priority: 5,
          tone: "danger" as const,
        },
      ];
    }

    if (event.type === "exit") {
      const status = getStringValue(asRecord(event.data), "status") ?? "finished";
      return [
        {
          detail: summarizeText(event.message),
          id: `event-${event.id}`,
          label: status === "succeeded" ? "Run succeeded" : "Run finished",
          priority: 4,
          tone: status === "succeeded" ? "success" as const : "info" as const,
        },
      ];
    }

    if (event.type === "system") {
      const message = event.message.toLowerCase();
      if (message.includes("starting")) {
        return [
          {
            detail: summarizeText(event.message),
            id: `event-${event.id}`,
            label: "Codex started",
            priority: 1,
            tone: "info" as const,
          },
        ];
      }
      if (message.includes("finished") || message.includes("cancel")) {
        return [
          {
            detail: summarizeText(event.message),
            id: `event-${event.id}`,
            label: message.includes("cancel") ? "Cancel requested" : "Codex finished",
            priority: 3,
            tone: message.includes("cancel") ? "warning" as const : "success" as const,
          },
        ];
      }
      return [];
    }

    if (event.type !== "json") {
      return [];
    }

    const item = getRunJsonItem(event);
    if (item) {
      const itemId = getStringValue(item, "id") ?? `event-${event.id}`;
      const itemStatus = getStringValue(item, "status");
      if (itemStatus === "in_progress" && completedItemIds.has(itemId)) {
        return [];
      }

      const itemType = getStringValue(item, "type");
      if (itemType === "command_execution") {
        return [summarizeCommandItem(event, item)];
      }
      if (itemType === "agent_message") {
        return [summarizeAgentMessageItem(event, item)];
      }
    }

    const eventType = getStringValue(asRecord(event.data), "type");
    if (eventType === "turn.completed") {
      return [
        {
          detail: summarizeUsage(asRecord(asRecord(event.data)?.usage)),
          id: `event-${event.id}`,
          label: "Turn completed",
          priority: 1,
          tone: "info" as const,
        },
      ];
    }

    return [];
  });
}

function selectVisibleRunActivityItems(items: RunActivityItem[]): RunActivityItem[] {
  if (items.length <= 12) {
    return items;
  }

  const first = items.slice(0, 2);
  const important = items
    .slice(2, -8)
    .filter((item) => item.priority >= 4)
    .slice(-4);
  const recent = items.slice(-8);
  const seen = new Set<string>();

  return [...first, ...important, ...recent].filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function summarizeCommandItem(event: CodexRunEvent, item: Record<string, unknown>): RunActivityItem {
  const command = summarizeShellCommand(getStringValue(item, "command") ?? "command");
  const output = summarizeOutput(getStringValue(item, "aggregated_output"));
  const status = getStringValue(item, "status");
  const exitCode = getNumberValue(item, "exit_code");
  const failed = status === "failed" || (typeof exitCode === "number" && exitCode !== 0);
  const running = status === "in_progress";
  const exit = typeof exitCode === "number" ? `exit ${exitCode}` : running ? "running" : status;
  const detail = [command, exit, output].filter(Boolean).join(" · ");

  return {
    detail,
    id: `event-${event.id}`,
    label: running ? "Running command" : failed ? "Command failed" : "Command completed",
    priority: failed ? 5 : running ? 3 : 2,
    tone: running ? "info" : failed ? "danger" : "success",
  };
}

function summarizeAgentMessageItem(
  event: CodexRunEvent,
  item: Record<string, unknown>,
): RunActivityItem {
  const text = getStringValue(item, "text") ?? event.message;
  const hasBlocker = /blocked|failed|failure|error|not permitted|permission|권한|막혔|실패/i.test(text);

  return {
    detail: summarizeText(text, 220),
    id: `event-${event.id}`,
    label: hasBlocker ? "Codex reported a blocker" : "Codex note",
    priority: hasBlocker ? 5 : 3,
    tone: hasBlocker ? "danger" : "info",
  };
}

function summarizePromptEvent(event: CodexRunEvent): string {
  const data = asRecord(event.data);
  const scope = asRecord(data?.scopeResolution);
  const scopeLabel = getStringValue(scope, "scope");
  const instruction = getStringValue(data, "instructionSummary");
  const mode = getStringValue(data, "mode");
  return [scopeLabel ? `${scopeLabel} scope` : undefined, mode, instruction]
    .filter(Boolean)
    .join(" · ");
}

function summarizeUsage(usage: Record<string, unknown> | undefined): string {
  const inputTokens = getNumberValue(usage, "input_tokens");
  const outputTokens = getNumberValue(usage, "output_tokens");
  const reasoningTokens = getNumberValue(usage, "reasoning_output_tokens");
  return [
    typeof inputTokens === "number" ? `${inputTokens.toLocaleString()} input tokens` : undefined,
    typeof outputTokens === "number" ? `${outputTokens.toLocaleString()} output tokens` : undefined,
    typeof reasoningTokens === "number" ? `${reasoningTokens.toLocaleString()} reasoning tokens` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getRunJsonItem(event: CodexRunEvent): Record<string, unknown> | undefined {
  const data = asRecord(event.data);
  return asRecord(data?.item);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getStringValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberValue(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function summarizeShellCommand(command: string): string {
  const match = command.match(/^\/bin\/(?:zsh|bash|sh)\s+-lc\s+(['"])([\s\S]*)\1$/);
  const cleaned = match?.[2] ?? command;
  return summarizeText(cleaned.replace(/\\"/g, "\"").replace(/\\'/g, "'"), 120);
}

function summarizeOutput(output: string | undefined): string | undefined {
  if (!output) {
    return undefined;
  }

  const meaningfulLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return meaningfulLine ? summarizeText(meaningfulLine, 140) : undefined;
}

function summarizeText(value: string, limit = 180): string {
  const cleaned = value
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-z]*\n?/gi, "").replace(/```/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, limit - 3)}...`;
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

function runLabel(status: CodexRunSummary["rawStatus"]): string {
  return {
    cancelled: "Cancelled",
    failed: "Failed",
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
  }[status];
}

function runModeLabel(mode: CodexRunMode): string {
  return {
    edit: "Edit files",
    read_only: "Read-only",
  }[mode];
}

function compactModelLabel(displayName: string, slug: string): string {
  return displayName.trim() || slug;
}

function reasoningEffortLabel(effort: string): string {
  const labels: Record<string, string> = {
    high: "높음",
    low: "낮음",
    medium: "중간",
    minimal: "최소",
    none: "없음",
    xhigh: "매우 높음",
  };

  return labels[effort] ?? effort;
}

function workspaceIntentLabel(intent: CodexWorkspaceChatIntent): string {
  return {
    general: "Workspace chat",
    plan_ticketing_handoff: "Plan/Ticket handoff",
    spec_grilling: "Spec grilling",
  }[intent];
}

function workspaceIntentPlaceholder(intent: CodexWorkspaceChatIntent): string {
  return {
    general: "프로젝트 전체 기준 질문이나 논의를 입력",
    plan_ticketing_handoff: "정리된 논의를 plan/ticket 문서로 생성 또는 갱신하도록 지시",
    spec_grilling: "구현 전 요구사항을 질문으로 좁히고 싶은 내용을 입력",
  }[intent];
}

function workspaceIntentFromMetadata(
  metadata: CodexChatMessage["metadata"],
): CodexWorkspaceChatIntent | undefined {
  const intent = metadata?.intent;
  if (
    intent === "general" ||
    intent === "spec_grilling" ||
    intent === "plan_ticketing_handoff"
  ) {
    return intent;
  }
  return undefined;
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
