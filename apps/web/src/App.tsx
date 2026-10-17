import { IS_BROWSER_LOCAL } from "./storageMode";
import { BrowserMarkdownImage, BrowserMarkdownLink } from "./browser/MarkdownResources";
import { browserRepository, BrowserFileError } from "./browser/repository";
import { subscribeFileEvents } from "./browser/fileEvents";
import { BrowserStartPage, BrowserProjectSwitcher, BrowserFilesMenu, BrowserReconnect } from "./browser/BrowserConnections";
import { documentRouteId } from "./appRoute";
import { t, locale, useTranslation } from "@/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { PwaMenu } from "./pwa/PwaMenu";
import { StartPageHeader, WorkspaceButton, WorkspaceStatusBadge, WorkspaceSwitcherTrigger } from "@/components/WorkspaceNavigation";
import { ProjectLists, StartPageNavigation } from "@/components/ProjectLauncher";
import { SkillGuide } from "@/components/SkillGuide";
import { ProjectGuide } from "@/components/ProjectGuide";
import { TourButton, useScreenTour } from "./onboarding/ScreenTour";
import { errorSummary, errorDetails } from "@/i18n/errors";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Node as TiptapNode, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  APP_NAME,
  TICKET_PROGRESS_BY_STATUS,
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
  workspaceRootsSettingsResponseSchema,
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
  type TicketInstructionKind,
  type TicketProgress,
  type TicketStatus,
  type WorkspaceDirectoryEntry,
  type WorkspaceDirectoryRoot,
  type WorkspaceDirectoriesResponse,
  type WorkspaceRootsSettingsResponse,
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
  Filter,
  Folder,
  FolderKanban,
  House,
  LayoutGrid,
  ListChecks,
  Loader2,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  buildAppRoute,
  parseAppRouteState,
  type AppRouteState,
  type TicketDocumentViewMode,
} from "./appRoute";
import {
  DEFAULT_DOCUMENT_SET_SORT_PREFERENCE,
  DOCUMENT_SET_SORT_OPTIONS,
  defaultDirectionForDocumentSetSortMode,
  isDocumentSetSortDirection,
  isDocumentSetSortMode,
  sortDocumentSets,
  type DocumentSetSortPreference,
} from "./documentSetSorting";
import { DEFAULT_DOCUMENT_FILTERS, filterDocumentSets, type DocumentFilters, type VisibleDocumentSet } from "./documentSetFiltering";
import { IN_APP_CHAT_ENABLED } from "./features";
import { TicketStatusFields, type SaveTicketStatus, type TicketWriteGuard } from "@/components/tickets/TicketStatusFields";
import { TicketMoveDialog, prepareTicketMove, type TicketMove } from "@/components/tickets/TicketMoveDialog";
import {
  useTicketDetailPresentation, type TicketDetailPresentation,
} from "./components/tickets/useTicketDetailPresentation";
import { TicketDetailFrame } from "./components/tickets/TicketDetailFrame";

export const BOARD_STATUSES: TicketStatus[] = [
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
];
const MARKDOWN_HEADING_HIGHLIGHT_CLASS = "ak-markdown-heading-highlight";
const SIDEBAR_WIDTH_STORAGE_KEY = "alpha-kanban.sidebarWidth";
const DOCUMENT_SET_SORT_STORAGE_KEY = "alpha-kanban.documentSetSort";
const DOCUMENT_FILTERS_STORAGE_KEY = "alpha-kanban.documentFilters";
const AUTO_OPEN_LAST_WORKSPACE_STORAGE_KEY = "alpha-kanban.autoOpenLastWorkspace";
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;
const SCOPE_MENTION_NODE_TYPE = "scopeMention";
const CLI_DEFAULT_SELECT_VALUE = "__cli_default__";
const MODEL_DEFAULT_SELECT_VALUE = "__model_default__";

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

export class ClientApiError extends Error {
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

function readStoredDocumentFilters(): DocumentFilters {
  try {
    const raw = window.localStorage.getItem(DOCUMENT_FILTERS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOCUMENT_FILTERS, hidePlainMarkdown: window.localStorage.getItem("alpha-kanban.hidePlainMarkdown") === "true" };
    const value: unknown = JSON.parse(raw);
    if (isRecord(value)) return { hidePlainMarkdown: value.hidePlainMarkdown === true, hideCompletedSets: value.hideCompletedSets === true };
  } catch {
    // Invalid or unavailable storage falls back to showing all documents.
  }
  return DEFAULT_DOCUMENT_FILTERS;
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
const workspaceRootBrowserKey = (root?: string) => ["workspace-root-browser", root] as const;
const workspaceRootsSettingsKey = ["workspace-roots-settings"] as const;
const codexModelsKey = ["codex-models"] as const;
const codexRunDefaultsKey = ["codex-run-defaults"] as const;

export async function requestJson<T>(
  url: string,
  schema: ParseableSchema<T>,
  options?: RequestInit,
): Promise<T> {
  if (IS_BROWSER_LOCAL) throw new Error("Server APIs are disabled in browser-local mode.");
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

async function browserWrite<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof BrowserFileError || (error instanceof Error && "code" in error)) {
      throw new ClientApiError(error instanceof BrowserFileError && error.code === "STALE_FILE" ? 409 : 400, { error: { code: String(error.code), message: error.message } });
    }
    throw error;
  }
}

async function fetchHealth() {
  return requestJson("/api/health", healthResponseSchema);
}

export async function fetchWorkspaces() {
  if (IS_BROWSER_LOCAL) return browserRepository.workspaces();
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

async function fetchWorkspaceRootBrowserDirectories(root?: string) {
  const params = new URLSearchParams();
  if (root) {
    params.set("root", root);
  }
  const query = params.toString();
  return requestJson(
    `/api/settings/workspace-root-browser${query ? `?${query}` : ""}`,
    workspaceDirectoriesResponseSchema,
  );
}

async function fetchWorkspaceRootsSettings() {
  if (IS_BROWSER_LOCAL) return { roots: [], defaultRoots: [], hasOverride: false };
  return requestJson("/api/settings/workspace-roots", workspaceRootsSettingsResponseSchema);
}

async function updateWorkspaceRootsSettings(
  roots: string[],
): Promise<WorkspaceRootsSettingsResponse> {
  return requestJson("/api/settings/workspace-roots", workspaceRootsSettingsResponseSchema, {
    body: JSON.stringify({ roots }),
    method: "PUT",
  });
}

async function selectWorkspaceById(workspaceId: string) {
  if (IS_BROWSER_LOCAL) return browserRepository.select(workspaceId);
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
  if (IS_BROWSER_LOCAL) return browserRepository.documentSets(workspaceId);
  return requestJson(
    `/api/workspaces/${workspaceId}/document-sets`,
    documentSetsResponseSchema,
  );
}

async function fetchMarkdownDocument(workspaceId: string, fileId: string) {
  if (IS_BROWSER_LOCAL) return browserRepository.markdown(workspaceId, fileId);
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/markdown`,
    markdownDocumentResponseSchema,
  );
}

export async function fetchTicketDocument(workspaceId: string, fileId: string) {
  if (IS_BROWSER_LOCAL) return browserRepository.tickets(workspaceId, fileId);
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

export async function patchTicket(
  workspaceId: string,
  fileId: string,
  ticketId: string,
  body: {
    expectedHash?: string;
    expectedMtimeMs?: number;
    progress?: TicketProgress;
    status?: TicketStatus;
    reason?: string;
  },
) {
  if (IS_BROWSER_LOCAL) return browserWrite(() => browserRepository.patch(workspaceId, fileId, ticketId, body));
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets/${ticketId}`,
    ticketDocumentResponseSchema,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

export async function appendTicketInstruction(
  workspaceId: string,
  fileId: string,
  ticketId: string,
  body: {
    kind: TicketInstructionKind;
    text: string;
    expectedHash: string;
    expectedMtimeMs: number;
  },
) {
  if (IS_BROWSER_LOCAL) return browserWrite(() => browserRepository.append(workspaceId, fileId, ticketId, body));
  return requestJson(
    `/api/workspaces/${workspaceId}/files/${fileId}/tickets/${ticketId}/instructions`,
    ticketDocumentResponseSchema,
    { body: JSON.stringify(body), method: "POST" },
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

export function App({ allowStartupAutoOpen = true }: { allowStartupAutoOpen?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const appShellRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const routeLocation = useLocation({
    select: (location) => ({
      hash: location.hash,
      href: location.href,
      pathname: location.pathname,
      searchStr: location.searchStr,
    }),
  });
  const routeState = useMemo<AppRouteState>(
    () => parseAppRouteState(routeLocation),
    [routeLocation],
  );
  const initialRouteRef = useRef<AppRouteState>(routeState);
  const previousFileSelectionRef = useRef<{ id?: string; path?: string }>({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(
    initialRouteRef.current.workspaceId,
  );
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [isProjectGuideOpen, setIsProjectGuideOpen] = useState(initialRouteRef.current.showGuide === true);
  const [pendingBoardTour, setPendingBoardTour] = useState<string>();
  const lastBoardFile = useRef<MarkdownFileSummary | undefined>(undefined);
  const [preferredFilePath, setPreferredFilePath] = useState<string | undefined>(
    initialRouteRef.current.filePath,
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>(
    initialRouteRef.current.ticketId,
  );
  const [ticketViewMode, setTicketViewMode] = useState<TicketDocumentViewMode>(
    () => initialRouteRef.current.ticketViewMode ?? "board",
  );
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const ticketPresentation = useTicketDetailPresentation(initialRouteRef.current.detailMode);
  const { mode: ticketDetailMode, setMode: setTicketDetailMode } = ticketPresentation;
  const [isWorkspaceChatOpen, setIsWorkspaceChatOpen] = useState(false);
  const [externalFileChange, setExternalFileChange] =
    useState<MarkdownFileChangeEvent | null>(null);
  const [documentSetSortPreferences, setDocumentSetSortPreferences] = useState(
    readStoredDocumentSetSortPreferences,
  );
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentFilters, setDocumentFilters] = useState(readStoredDocumentFilters);
  const [initialAutoOpenLastWorkspace] = useState(readStoredAutoOpenLastWorkspace);
  const shouldAutoOpenLastWorkspaceOnLoadRef = useRef(
    allowStartupAutoOpen && !initialRouteRef.current.workspaceId && initialAutoOpenLastWorkspace,
  );
  const [autoOpenLastWorkspace, setAutoOpenLastWorkspace] = useState(
    initialAutoOpenLastWorkspace,
  );
  const healthQuery = useQuery({
    enabled: !IS_BROWSER_LOCAL,
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
  const codexModelsQuery = useQuery({
    enabled: IN_APP_CHAT_ENABLED,
    queryKey: codexModelsKey,
    queryFn: fetchCodexModels,
    staleTime: 60_000,
  });
  const codexRunDefaultsQuery = useQuery({
    enabled: IN_APP_CHAT_ENABLED,
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
  const workspaceRootsSettingsQuery = useQuery({
    queryKey: workspaceRootsSettingsKey,
    queryFn: fetchWorkspaceRootsSettings,
  });
  const selectedWorkspace = workspacesQuery.data?.workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const canLoadWorkspace = Boolean(selectedWorkspaceId && selectedWorkspace?.isAvailable);
  const documentSetsQuery = useQuery({
    enabled: canLoadWorkspace,
    queryKey: documentSetsKey(selectedWorkspaceId),
    queryFn: () => fetchDocumentSets(selectedWorkspaceId ?? ""),
    refetchInterval: IS_BROWSER_LOCAL ? 15_000 : false,
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
  const visibleDocumentSets = useMemo(
    () => filterDocumentSets(sortedDocumentSets, documentSearch, documentFilters),
    [sortedDocumentSets, documentSearch, documentFilters],
  );
  const allFiles = useMemo(
    () => sortedDocumentSets.flatMap((documentSet) => documentSet.documents),
    [sortedDocumentSets],
  );
  const firstPlanningFile = allFiles.find((file) => file.type !== "markdown");
  const selectedFileById = allFiles.find((file) => file.id === selectedFileId);
  const preferredFile = preferredFilePath
    ? allFiles.find(
        (file) =>
          (IS_BROWSER_LOCAL ? file.id === preferredFilePath : file.workspaceRelativePath === preferredFilePath) ||
          (!IS_BROWSER_LOCAL && file.relativePath === preferredFilePath),
      )
    : undefined;
  const listedSelectedFile = selectedFileById ?? preferredFile;
  const resolvedSelectedFileId = listedSelectedFile?.id ?? selectedFileId ?? (IS_BROWSER_LOCAL ? preferredFilePath : undefined);
  const isProjectGuideVisible = IS_BROWSER_LOCAL && (isProjectGuideOpen ||
    (canLoadWorkspace && documentSetsQuery.isSuccess && !resolvedSelectedFileId && !firstPlanningFile));
  const selectedFileQuery = useQuery({
    enabled: Boolean(IS_BROWSER_LOCAL && canLoadWorkspace && resolvedSelectedFileId && !listedSelectedFile),
    queryKey: ["browser-file", selectedWorkspaceId, resolvedSelectedFileId],
    queryFn: () => browserRepository.file(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
  });
  const selectedFile = listedSelectedFile ?? selectedFileQuery.data;
  const currentSelectedFilePath = (selectedFile ? documentRouteId(selectedFile) : preferredFilePath);
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
    enabled: Boolean(
      canLoadWorkspace &&
        resolvedSelectedFileId &&
        selectedFile &&
        (!isTicketsDocument || ticketViewMode === "markdown"),
    ),
    queryFn: () => fetchMarkdownDocument(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
    queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
  });
  const codexRunSummaryQuery = useQuery({
    enabled: Boolean(IN_APP_CHAT_ENABLED && canLoadWorkspace && resolvedSelectedFileId && isTicketsDocument),
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

    if (!IN_APP_CHAT_ENABLED) {
      return summaries;
    }

    for (const runSummary of codexRunSummaryQuery.data?.runs ?? []) {
      if (shouldShowRunOnTicketCard(runSummary)) {
        summaries.set(runSummary.ticketId, runSummary);
      }
    }

    return summaries;
  }, [codexRunSummaryQuery.data?.runs]);
  const selectedTicket =
    ticketViewMode === "board"
      ? ticketQuery.data?.document.tickets.find((ticket) => ticket.id === selectedTicketId)
      : undefined;
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
    if (!selectedWorkspaceId || !workspacesQuery.data) {
      return;
    }

    const currentWorkspace = workspacesQuery.data.workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    );
    if (IS_BROWSER_LOCAL || currentWorkspace?.isAvailable) {
      return;
    }

    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(undefined);
  }, [selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    if (isProjectGuideOpen || !selectedWorkspaceId || sortedDocumentSets.length === 0) {
      return;
    }

    const selectedFileExists = Boolean(selectedFileId && selectedFileById);
    if (selectedFileExists) {
      return;
    }

    if (IS_BROWSER_LOCAL && preferredFilePath && !preferredFile) return;
    const nextFile = preferredFile ?? (IS_BROWSER_LOCAL ? firstPlanningFile : sortedDocumentSets[0]?.primaryFile);
    if (nextFile?.id && nextFile.id !== selectedFileId) {
      setSelectedFileId(nextFile.id);
    }
  }, [
    firstPlanningFile,
    isProjectGuideOpen,
    preferredFile,
    preferredFilePath,
    selectedFileById,
    selectedFileId,
    selectedWorkspaceId,
    sortedDocumentSets,
  ]);

  useEffect(() => {
    const previousSelection = previousFileSelectionRef.current;
    const currentFilePath = (selectedFile ? documentRouteId(selectedFile) : preferredFilePath);
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
    if (ticketViewMode === "markdown" && selectedTicketId) {
      setSelectedTicketId(undefined);
    }
  }, [selectedTicketId, ticketViewMode]);

  useEffect(() => {
    const nextHref = buildAppRoute({
      workspaceId: selectedWorkspaceId,
      showGuide: isProjectGuideOpen,
      filePath: currentSelectedFilePath,
      ticketId: selectedTicketId,
      detailMode: selectedTicketId ? ticketDetailMode : undefined,
      ticketViewMode,
    });
    if (nextHref !== routeLocation.href) {
      void navigate({ href: nextHref, replace: true, resetScroll: false });
    }
  }, [
    currentSelectedFilePath,
    isProjectGuideOpen,
    navigate,
    routeLocation.href,
    selectedTicketId,
    selectedWorkspaceId,
    ticketDetailMode,
    ticketViewMode,
  ]);

  useEffect(() => {
    setExternalFileChange(null);
  }, [resolvedSelectedFileId, selectedWorkspaceId]);

  useEffect(() => {
    if (!canLoadWorkspace || !selectedWorkspaceId) {
      return;
    }

    return subscribeFileEvents(selectedWorkspaceId, (incoming) => {
      const parsed = markdownFileChangeEventSchema.safeParse(incoming);
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
        const file = event.file;
        queryClient.setQueryData<TicketDocumentResponse>(
          ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
          (current) => current?.file.hash === file.hash ? { ...current, file } : current,
        );
        queryClient.setQueryData<MarkdownDocumentResponse>(
          markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
          (current) => current?.file.hash === file.hash ? { ...current, file } : current,
        );
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
        if (ticketViewMode === "markdown") {
          void queryClient.invalidateQueries({
            queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
          });
        }
      } else {
        void queryClient.invalidateQueries({
          queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
        });
      }
    }, () => { void queryClient.invalidateQueries({ queryKey: ["workspaces"] }); }, ticketQuery.data?.file ?? markdownQuery.data?.file);
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
    ticketViewMode,
  ]);

  useEffect(() => {
    if (IS_BROWSER_LOCAL || !canLoadWorkspace || !selectedWorkspaceId) {
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

      if (isTicketsDocument) {
        void queryClient.invalidateQueries({
          queryKey: ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
        });
        if (ticketViewMode === "markdown") {
          void queryClient.invalidateQueries({
            queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
          });
        }
      } else {
        void queryClient.invalidateQueries({
          queryKey: markdownDocumentKey(selectedWorkspaceId, resolvedSelectedFileId),
        });
      }
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
    ticketViewMode,
  ]);

  useEffect(() => {
    setSelectedWorkspaceId(routeState.workspaceId);
    setIsProjectGuideOpen(routeState.showGuide === true);
    setPreferredFilePath(routeState.filePath);
    setSelectedFileId(undefined);
    setSelectedTicketId(routeState.ticketId);
    setTicketViewMode(routeState.ticketViewMode ?? "board");
    if (routeState.detailMode) {
      setTicketDetailMode(routeState.detailMode);
    }
  }, [
    routeState.detailMode,
    routeState.filePath,
    routeState.showGuide,
    routeState.ticketId,
    routeState.ticketViewMode,
    routeState.workspaceId,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // Ignore storage failures; the resize affordance still works for this session.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    setDocumentSearch("");
  }, [selectedWorkspaceId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCUMENT_FILTERS_STORAGE_KEY, JSON.stringify(documentFilters));
    } catch {
      // Filtering still works when browser preferences cannot be saved.
    }
  }, [documentFilters]);

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

  async function replaceDocument(data: TicketDocumentResponse): Promise<void> {
    await queryClient.cancelQueries({ queryKey: ticketDocumentKey(data.file.workspaceId, data.file.id) });
    await queryClient.cancelQueries({ queryKey: markdownDocumentKey(data.file.workspaceId, data.file.id) });
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
      await Promise.all([
        ticketQuery.refetch(),
        ...(ticketViewMode === "markdown" ? [markdownQuery.refetch()] : []),
      ]);
    } else {
      await markdownQuery.refetch();
    }
    await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
    setExternalFileChange(null);
  }

  async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
    setPendingBoardTour(undefined);
    const response = await selectWorkspaceById(workspaceId);
    setIsProjectGuideOpen(false);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(response.workspace.id);
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  async function handleWorkspaceOpenPath(root: string): Promise<void> {
    const response = await selectWorkspaceByRoot(root);
    setIsProjectGuideOpen(false);
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
    setIsProjectGuideOpen(false);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(response.workspace.id);
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  async function handleWorkspaceRootsChange(roots: string[]): Promise<void> {
    const settings = await updateWorkspaceRootsSettings(roots);
    queryClient.setQueryData(workspaceRootsSettingsKey, settings);
    await queryClient.invalidateQueries({ queryKey: ["workspace-directories"] });
    const nextWorkspaces = await queryClient.fetchQuery({
      queryKey: ["workspaces"],
      queryFn: fetchWorkspaces,
    });

    if (!selectedWorkspaceId) {
      return;
    }

    const currentWorkspace = nextWorkspaces.workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    );
    if (currentWorkspace?.isAvailable) {
      return;
    }

    handleGoToStartPage();
  }

  function handleGoToStartPage(): void {
    setPendingBoardTour(undefined);
    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    setIsProjectGuideOpen(false);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setSelectedWorkspaceId(undefined);
  }

  function handleShowProjectGuide(): void {
    lastBoardFile.current = selectedFile?.type === "tickets" ? selectedFile : undefined;
    setPendingBoardTour(undefined);
    setIsProjectGuideOpen(true);
    setSelectedFileId(undefined);
    setPreferredFilePath(undefined);
    setSelectedTicketId(undefined);
    setTicketViewMode("board");
  }

  function handleDocumentSelect(file: MarkdownFileSummary): void {
    setPendingBoardTour(undefined);
    setIsProjectGuideOpen(false);
    setSelectedFileId(file.id);
    setPreferredFilePath(documentRouteId(file));
    if (file.type !== "tickets") setSelectedTicketId(undefined);
  }

  async function handlePatchTicket(
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
    reason: string,
    guard?: TicketWriteGuard,
  ): Promise<void> {
    if (!selectedWorkspaceId || !resolvedSelectedFileId || !ticketQuery.data) {
      return;
    }

    await replaceDocument(
      await patchTicket(selectedWorkspaceId, resolvedSelectedFileId, ticketId, {
        status,
        progress,
        reason,
        expectedHash: guard?.expectedHash ?? ticketQuery.data.file.hash,
        expectedMtimeMs: guard?.expectedMtimeMs ?? ticketQuery.data.file.mtimeMs,
      }),
    );
  }

  async function handleAppendTicketInstruction(
    ticketId: string,
    kind: TicketInstructionKind,
    text: string,
  ): Promise<void> {
    if (!selectedWorkspaceId || !resolvedSelectedFileId || !ticketQuery.data) {
      return;
    }
    await replaceDocument(
      await appendTicketInstruction(selectedWorkspaceId, resolvedSelectedFileId, ticketId, {
        kind,
        text,
        expectedHash: ticketQuery.data.file.hash,
        expectedMtimeMs: ticketQuery.data.file.mtimeMs,
      }),
    );
  }

  const boardTour = useScreenTour("project", {
    enabled: IS_BROWSER_LOCAL && canLoadWorkspace && !selectedTicketId,
    eligible: !isProjectGuideVisible && isTicketsDocument && ticketViewMode === "board" && ticketQuery.isSuccess && Boolean(ticketQuery.data?.document.tickets.length),
    scope: `${selectedWorkspaceId}:${resolvedSelectedFileId}:${ticketViewMode}:${isProjectGuideVisible}`,
  });
  const tourFile = allFiles.find((file) => file.id === lastBoardFile.current?.id && file.type === "tickets") ?? allFiles.find((file) => file.type === "tickets");
  useEffect(() => {
    if (!pendingBoardTour) return;
    if (resolvedSelectedFileId !== pendingBoardTour || isProjectGuideVisible || selectedTicketId) { setPendingBoardTour(undefined); return; }
    if (boardTour.enabled && ticketQuery.isSuccess) { boardTour.start(); setPendingBoardTour(undefined); }
  }, [pendingBoardTour, resolvedSelectedFileId, isProjectGuideVisible, selectedTicketId, boardTour.enabled, boardTour.start, ticketQuery.isSuccess]);

  if (!selectedWorkspaceId) {
    return (
      <main className="min-h-dvh overflow-auto bg-background text-foreground">
        {IS_BROWSER_LOCAL ? <BrowserStartPage autoOpen={autoOpenLastWorkspace} onAutoOpen={setAutoOpenLastWorkspace} onSelect={handleWorkspaceSelect} workspaces={workspacesQuery.data?.workspaces ?? []} error={workspacesQuery.error} isLoading={workspacesQuery.isPending} /> : <StartWorkspacePage
          autoOpenLastWorkspace={autoOpenLastWorkspace}
          onAutoOpenLastWorkspaceChange={setAutoOpenLastWorkspace}
          onWorkspaceCreate={handleWorkspaceCreate}
          onWorkspaceOpenPath={handleWorkspaceOpenPath}
          onWorkspaceRootsChange={handleWorkspaceRootsChange}
          onWorkspaceSelect={handleWorkspaceSelect}
          workspaceRootsError={workspaceRootsSettingsQuery.error}
          workspaceRootsIsLoading={workspaceRootsSettingsQuery.isLoading}
          workspaceRootsSettings={workspaceRootsSettingsQuery.data}
          workspaces={workspacesQuery.data?.workspaces ?? []}
        />}
      </main>
    );
  }

  return (
    <>
      <main
        className="grid h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-secondary)] max-[860px]:h-auto max-[860px]:min-h-dvh max-[860px]:overflow-visible"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-4 py-2 max-[720px]:flex-wrap">
          <button
            className="ak-row flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--ak-canvas-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-focus)]"
            onClick={handleGoToStartPage}
            type="button"
          >
            <FolderKanban className="size-5 text-[var(--ak-ink-muted)]" aria-hidden="true" />
            <span className="ak-title truncate text-sm">{APP_NAME}</span>
          </button>

          {IS_BROWSER_LOCAL ? <BrowserProjectSwitcher workspaces={workspacesQuery.data?.workspaces ?? []} selectedWorkspaceId={selectedWorkspaceId} onSelect={handleWorkspaceSelect} /> : <ProjectSwitcher
            autoOpenLastWorkspace={autoOpenLastWorkspace}
            isLoading={workspacesQuery.isLoading}
            onAutoOpenLastWorkspaceChange={setAutoOpenLastWorkspace}
            onGoToStartPage={handleGoToStartPage}
            onOpenPath={handleWorkspaceOpenPath}
            onSelect={handleWorkspaceSelect}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            workspaces={workspacesQuery.data?.workspaces ?? []}
          />}

          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {IS_BROWSER_LOCAL ? <TourButton tour={boardTour} /> : null}
            <LanguageSelector />
            <PwaMenu />
            <Button data-tour="all-tickets" onClick={() => navigate({ to: "/all" })} size="sm" variant="ghost">
              <LayoutGrid aria-hidden="true" />
              {t("All tickets")}
            </Button>
            {IS_BROWSER_LOCAL ? <BrowserFilesMenu /> : <HealthPill status={healthQuery.status} />}
          </div>
        </header>

        <div
          className="grid min-h-0 grid-cols-[var(--sidebar-width)_8px_minmax(0,1fr)] overflow-hidden max-[860px]:grid-cols-1 max-[860px]:overflow-visible"
          ref={appShellRef}
          style={shellStyle}
        >
          <aside
            className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--ak-hairline)] bg-[var(--ak-surface)] max-[860px]:max-h-[68dvh] max-[860px]:border-b max-[860px]:border-r-0"
            aria-label={t("Workspace files")}
          >
            <div className="border-b border-[var(--ak-hairline)] p-3">
              <DocumentListHeader
                disabled={!canLoadWorkspace}
                search={documentSearch}
                onSearchChange={setDocumentSearch}
                filters={documentFilters}
                onFiltersChange={setDocumentFilters}
                onPreferenceChange={updateDocumentSetSortPreference}
                preference={documentSetSortPreference}
              />
            </div>

            <div className="ak-scroll-area min-h-0 flex-1 overflow-y-auto">
              <div className="ak-scroll-content grid gap-1">
                {selectedWorkspace && !selectedWorkspace.isAvailable ? (
                  <SidebarState label={t("Project unavailable")} tone="error" />
                ) : null}
                {IS_BROWSER_LOCAL && !canLoadWorkspace ? <BrowserReconnect workspaceId={selectedWorkspaceId} /> : null}
                {IS_BROWSER_LOCAL && preferredFilePath && !preferredFile && documentSetsQuery.isSuccess ? <SidebarState label={t("The original document is unavailable. Select it again from the document list.")} tone="error" /> : null}
                {documentSetsQuery.isLoading ? <SidebarState label={t("Loading documents")} /> : null}
                {documentSetsQuery.isError ? (
                  <SidebarState label={t("Could not load documents")} tone="error" />
                ) : null}
                {documentSetsQuery.isSuccess && sortedDocumentSets.length === 0 ? (
                  <SidebarState label={t("No documents")} />
                ) : null}
                {sortedDocumentSets.length > 0 && visibleDocumentSets.length === 0 ? (
                  <div className="grid justify-items-start gap-2 px-3 py-2 text-sm text-muted-foreground" role="status">
                    <p>{t("No matching documents")}</p>
                    <Button size="sm" variant="link" onClick={() => { setDocumentSearch(""); setDocumentFilters(DEFAULT_DOCUMENT_FILTERS); }}>
                      {t("Clear filters")}
                    </Button>
                  </div>
                ) : null}
                <DocumentSetNavigator
                  documentSets={visibleDocumentSets}
                  onSelectFile={handleDocumentSelect}
                  selectedFileId={resolvedSelectedFileId}
                />
              </div>
            </div>
            {IS_BROWSER_LOCAL ? (
              <div className="shrink-0 border-t border-border p-3">
                <Button
                  data-tour-help=""
                  aria-current={isProjectGuideVisible ? "page" : undefined}
                  className="w-full justify-start"
                  onClick={handleShowProjectGuide}
                  size="sm"
                  type="button"
                  variant={isProjectGuideVisible ? "secondary" : "ghost"}
                >
                  <BookOpen aria-hidden="true" />
                  {t("Usage guide")}
                </Button>
              </div>
            ) : null}
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
            <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-5 py-3 max-[720px]:flex-col max-[720px]:items-start">
              <div className="min-w-0">
                <p className="ak-muted-label truncate">
                  {selectedWorkspace?.root ?? t("Project unavailable")}
                </p>
                <h2 id="workspace-title" className="ak-title mt-1 truncate text-lg">
                  {isProjectGuideVisible ? t("Usage guide") : selectedWorkspace
                    ? ticketQuery.data?.document.title ??
                      markdownQuery.data?.outline[0]?.title ??
                      selectedFile?.workspaceRelativePath ??
                      t("Document workspace")
                    : t("Project unavailable")}
                </h2>
                {selectedFile ? (
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                    <DocumentTypeBadge type={selectedFile.type} />
                    <p className="ak-body-muted min-w-0 truncate text-xs">
                      {selectedFile.workspaceRelativePath}
                    </p>
                  </div>
                ) : null}
              </div>
              {!isProjectGuideVisible ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 max-[720px]:w-full max-[720px]:justify-between">
                {selectedFile?.type === "tickets" ? (
                  <TicketDocumentViewToggle
                    mode={ticketViewMode}
                    onChange={setTicketViewMode}
                  />
                ) : null}
                <DocumentSummary
                  file={ticketQuery.data?.file}
                  fallbackFile={selectedFile}
                  isLoading={
                    selectedFile?.type === "tickets"
                      ? ticketQuery.isLoading
                      : markdownQuery.isLoading
                  }
                  markdownDocument={markdownQuery.data}
                  runSummary={IN_APP_CHAT_ENABLED ? codexRunSummaryQuery.data : undefined}
                  selectedDocumentSet={selectedDocumentSet}
                  ticketCount={ticketQuery.data?.document.tickets.length ?? 0}
                />
              </div> : null}
            </header>

            <div className={`ak-scroll-area min-h-0 overflow-auto ${isTicketsDocument && ticketViewMode === "board" ? "ak-project-board-scroll" : "p-5"}`}>
              <DocumentContent
                documentSetsError={documentSetsQuery.error}
                documentSetsIsError={documentSetsQuery.isError}
                documentSetsIsLoading={documentSetsQuery.isLoading}
                markdownDocument={markdownQuery.data}
                markdownError={markdownQuery.error}
                markdownIsError={markdownQuery.isError}
                markdownIsLoading={markdownQuery.isLoading}
                hasDocumentSets={sortedDocumentSets.length > 0}
                showProjectGuide={isProjectGuideVisible}
                onBoardTour={tourFile ? () => {
                  handleDocumentSelect(tourFile);
                  setTicketViewMode("board");
                  setSelectedTicketId(undefined);
                  setPendingBoardTour(tourFile.id);
                } : undefined}
                onFileSelect={handleDocumentSelect}
                onTicketSelect={setSelectedTicketId}
                onTicketStatusChange={handlePatchTicket}
                ticketDocument={ticketQuery.data}
                runSummaryByTicket={runSummaryByTicket}
                selectedDocumentSet={selectedDocumentSet}
                selectedFile={selectedFile}
                selectedFileError={selectedFileQuery.error}
                selectedFileIsLoading={selectedFileQuery.isLoading}
                selectedFileId={resolvedSelectedFileId}
                selectedWorkspace={selectedWorkspace}
                ticketError={ticketQuery.error}
                ticketIsError={ticketQuery.isError}
                ticketIsLoading={ticketQuery.isLoading}
                ticketViewMode={ticketViewMode}
                workspaceError={workspacesQuery.error}
                workspacesError={workspacesQuery.isError}
                workspacesIsLoading={workspacesQuery.isLoading}
                ticketsByStatus={ticketsByStatus}
              />
            </div>
          </section>
        </div>
      </main>

      {IN_APP_CHAT_ENABLED && canLoadWorkspace ? (
        <Button
          className="fixed bottom-6 right-6 z-40 h-11 rounded-full px-4 shadow-[0_14px_40px_color-mix(in_oklch,var(--foreground),transparent_84%)] max-[720px]:bottom-5 max-[720px]:right-5"
          onClick={() => setIsWorkspaceChatOpen(true)}
          title={t("Workspace chat for {{project}}", { project: selectedWorkspace?.root ?? t("selected project") })}
          type="button"
        >
          <Bot className="size-4" aria-hidden="true" />
          {t("Workspace Chat")}
        </Button>
      ) : null}

      {selectedTicket && resolvedSelectedFileId && ticketQuery.data ? (
        <TicketDetailDrawer
          key={`${selectedWorkspaceId}:${resolvedSelectedFileId}:${selectedTicket.id}`}
          availableTickets={ticketQuery.data.document.tickets}
          documentHash={ticketQuery.data.file.hash}
          documentMtimeMs={ticketQuery.data.file.mtimeMs}
          codexDisabledReason={selectedWorkspaceId ? undefined : t("Select a workspace before running Codex.")}
          fileId={resolvedSelectedFileId}
          presentation={ticketPresentation}
          onClose={() => setSelectedTicketId(undefined)}
          onAppendInstruction={handleAppendTicketInstruction}
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
          ticket={selectedTicket}
          ticketRunSummary={selectedTicketRunSummary}
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

      {IN_APP_CHAT_ENABLED ? <WorkspaceChatDialog
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
      /> : null}
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
  const { t } = useTranslation();
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
      aria-label={t("Resize sidebar")}
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
      title={t("Drag to resize. Double-click to reset.")}
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
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  onPreferenceChange,
  preference,
}: {
  disabled: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  filters: DocumentFilters;
  onFiltersChange: (value: DocumentFilters) => void;
  onPreferenceChange: (preference: DocumentSetSortPreference) => void;
  preference: DocumentSetSortPreference;
}) {
  const { t } = useTranslation();
  const directionLabel = t(preference.direction === "asc" ? "Ascending" : "Descending");
  const DirectionIcon = preference.direction === "asc" ? ArrowUp : ArrowDown;
  const activeFilters = Number(filters.hidePlainMarkdown) + Number(filters.hideCompletedSets);

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          data-tour="documents"
          role="searchbox"
          aria-label={t("Search documents")}
          placeholder={t("Search documents")}
          disabled={disabled}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-9 pr-16"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {search ? <Button size="iconSm" variant="ghost" aria-label={t("Clear search")} title={t("Clear search")} onClick={() => onSearchChange("")}>
            <X className="size-3.5" aria-hidden="true" />
          </Button> : null}
          <Popover>
            <PopoverTrigger asChild>
              <Button data-tour="document-filters" size="iconSm" variant={activeFilters ? "primary" : "ghost"} disabled={disabled}
                aria-label={t("Document filters")} title={t("Document filters ({{count}} active)", { count: activeFilters })}>
                <Filter className="size-3.5" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3" aria-label={t("Document filters")}>
              <div className="flex items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-medium">{t("Document filters")}</h3>
                <Button size="xs" variant="ghost" disabled={!activeFilters} onClick={() => onFiltersChange(DEFAULT_DOCUMENT_FILTERS)}>{t("Reset")}</Button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                <Checkbox checked={filters.hideCompletedSets} onCheckedChange={(checked) => onFiltersChange({ ...filters, hideCompletedSets: checked === true })} />
                {t("Hide completed sets (100%)")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                <Checkbox checked={filters.hidePlainMarkdown} onCheckedChange={(checked) => onFiltersChange({ ...filters, hidePlainMarkdown: checked === true })} />
                {t("Hide plain Markdown")}
              </label>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div data-tour="document-sort" className="flex min-w-0 items-center gap-2">
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
            aria-label={t("Document sort")}
            className="h-8 min-w-0 flex-1 px-2.5 text-xs"
            title={t("Document list sort")}
          >
            <SelectValue placeholder={t("Document order")} />
          </SelectTrigger>
          <SelectContent className="min-w-52">
            {DOCUMENT_SET_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.mode} title={t(option.title)} value={option.mode}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={t("Sort {{direction}}", { direction: directionLabel })}
          disabled={disabled}
          onClick={() =>
            onPreferenceChange({
              ...preference,
              direction: preference.direction === "asc" ? "desc" : "asc",
            })
          }
          size="iconSm"
          title={t("{{direction}}. Click to toggle sort direction.", { direction: directionLabel })}
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
  documentSets: VisibleDocumentSet[];
  onSelectFile: (file: MarkdownFileSummary) => void;
  selectedFileId?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav className="grid gap-1" aria-label={t("Documents")}>
      {documentSets.map(({ documentSet, documents }) => (
        <DocumentSetRow
          documentSet={documentSet}
          visibleDocuments={documents}
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
  visibleDocuments,
  onSelectFile,
  selectedFileId,
}: {
  documentSet: DocumentSetSummary;
  visibleDocuments: MarkdownFileSummary[];
  onSelectFile: (file: MarkdownFileSummary) => void;
  selectedFileId?: string;
}) {
  const { t } = useTranslation();
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
                <Badge variant="outline">{t("standalone")}</Badge>
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
            {documentSet.directory || t("docs root")}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1 pl-6">
        {visibleDocuments.map((file) => (
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
  useTranslation();
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
  const { t } = useTranslation();
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
    <div className="min-w-0 flex-1" aria-label={t("Projects")}>
      <WorkspaceSwitcherTrigger workspace={selectedWorkspace} isLoading={isLoading} onClick={() => setIsSwitcherOpen(true)} />

      <Dialog onOpenChange={setIsSwitcherOpen} open={isSwitcherOpen}>
        <DialogContent className="h-[min(760px,calc(100vh-2rem))] grid-rows-[auto_auto_auto_minmax(0,1fr)]">
          <DialogHeader className="pr-12">
            <DialogTitle>{t("Switch project")}</DialogTitle>
            <DialogDescription>
              {t("Select a workspace or open a folder inside the configured roots.")}
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
                    {t("Open last project on startup")}
                  </span>
                  <span className="text-xs leading-5 text-[var(--ak-ink-muted)]">
                    {t("Changes apply on the next root URL load. Use Start page to leave the current project now.")}
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
                    {t("Start page")}
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
                {t("Open path")}
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
                {t("Browse")}
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
                {t("Open")}
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
                  <p className="ak-muted-label px-3">{t("Current")}</p>
                  <WorkspaceButton
                    isSelected
                    onSelect={async () => setIsSwitcherOpen(false)}
                    workspace={selectedWorkspace}
                  />
                </div>
              ) : null}
              {recentWorkspaces.length > 0 ? (
                <WorkspaceGroup
                  label={t("Recent")}
                  onSelect={async (workspaceId) => {
                    await onSelect(workspaceId);
                    setIsSwitcherOpen(false);
                  }}
                  selectedWorkspaceId={selectedWorkspaceId}
                  workspaces={recentWorkspaces}
                />
              ) : null}
              <WorkspaceGroup
                label={recentWorkspaces.length > 0 ? t("Discovered") : t("Available")}
                onSelect={async (workspaceId) => {
                  await onSelect(workspaceId);
                  setIsSwitcherOpen(false);
                }}
                selectedWorkspaceId={selectedWorkspaceId}
                workspaces={discoveredWorkspaces}
              />
              {!isLoading && workspaces.length === 0 ? (
                <p className="ak-body-muted px-3 py-3 text-sm">{t("No projects found")}</p>
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
    </div>
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
  const { t } = useTranslation();
  const currentDirectory = data?.directory;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[min(720px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="pr-12">
          <DialogTitle>{t("Select workspace folder")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("Select a folder inside the configured workspace roots.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[190px_minmax(0,1fr)] border-y border-[var(--ak-hairline)] max-[720px]:grid-cols-1">
          <aside className="min-h-0 border-r border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] p-3 max-[720px]:border-b max-[720px]:border-r-0">
            <p className="ak-muted-label mb-2 px-1">{t("Roots")}</p>
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
                <p className="ak-body-muted px-2 py-3 text-sm">{t("No roots configured")}</p>
              ) : null}
            </div>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--ak-surface)]">
            <div className="grid gap-3 border-b border-[var(--ak-hairline)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  aria-label={t("Parent folder")}
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
                  <span className="truncate">{currentDirectory?.path ?? t("Loading")}</span>
                </div>
              </div>
              {currentDirectory ? (
                <div className="flex flex-wrap items-center gap-1">
                  <WorkspaceStatusBadge hasDocs={currentDirectory.hasDocs} />
                  {currentDirectory.isWorkspaceCandidate ? (
                    <Badge variant="success">{t("project")}</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="ak-scroll-area min-h-0 overflow-auto">
              <div className="grid min-w-[700px] grid-cols-[minmax(190px,1.25fr)_150px_minmax(300px,2fr)] border-b border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] px-3 py-2 ak-muted-label">
                <span>{t("Name")}</span>
                <span>{t("Type")}</span>
                <span>{t("Path")}</span>
              </div>
              {isLoading ? (
                <div className="ak-body-muted flex items-center gap-2 px-4 py-5 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t("Loading folders")}
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
                  {t("Empty folder")}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter className="max-[720px]:flex-col max-[720px]:items-stretch">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("Cancel")}
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
            {t("Select Folder")}
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
  const { t } = useTranslation();
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
        {entry.isWorkspaceCandidate ? <Badge variant="success">{t("project")}</Badge> : null}
        <WorkspaceStatusBadge hasDocs={entry.hasDocs} />
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
  const { t } = useTranslation();
  const label =
    t(status === "success" ? "API online" : status === "error" ? "API unavailable" : "Checking API");

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

function TicketDocumentViewToggle({
  mode,
  onChange,
}: {
  mode: TicketDocumentViewMode;
  onChange: (mode: TicketDocumentViewMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("Ticket document view")}
      data-tour="document-view"
      className="inline-flex items-center gap-0.5 rounded-[var(--ak-radius-lg)] border border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] p-0.5"
      role="group"
    >
      <Button
        aria-pressed={mode === "board"}
        className="rounded-[var(--ak-radius-md)]"
        onClick={() => onChange("board")}
        size="xs"
        title={t("Show ticket board")}
        type="button"
        variant={mode === "board" ? "secondary" : "ghost"}
      >
        <LayoutGrid aria-hidden="true" className="size-3.5" />
        {t("Board")}
      </Button>
      <Button
        aria-pressed={mode === "markdown"}
        className="rounded-[var(--ak-radius-md)]"
        onClick={() => onChange("markdown")}
        size="xs"
        title={t("Show raw Markdown document")}
        type="button"
        variant={mode === "markdown" ? "secondary" : "ghost"}
      >
        <FileText aria-hidden="true" className="size-3.5" />
        {t("Markdown")}
      </Button>
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
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Badge variant="muted">
        <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
        {t("Loading")}
      </Badge>
    );
  }

  const displayFile = file ?? markdownDocument?.file ?? fallbackFile;

  if (!displayFile) {
    return <Badge variant="muted">{t("No document")}</Badge>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2 max-[720px]:justify-start">
      {runSummary ? <DocumentRunSignalBadge runSummary={runSummary} /> : null}
      <DocumentTypeBadge type={displayFile.type} />
      {displayFile.type === "tickets" ? (
        <Badge variant="outline">{t("{{count}} tickets", { count: ticketCount })}</Badge>
      ) : null}
      {selectedDocumentSet?.ticketProgress?.totalTickets !== undefined ? (
        <Badge variant="outline">
          {t("{{done}} / {{total}} tickets", { done: selectedDocumentSet.ticketProgress.doneTickets ?? 0, total: selectedDocumentSet.ticketProgress.totalTickets })}
        </Badge>
      ) : null}
      <Badge variant="muted">{new Date(displayFile.mtimeMs).toLocaleDateString(locale())}</Badge>
    </div>
  );
}

function DocumentContent({
  documentSetsError,
  documentSetsIsError,
  documentSetsIsLoading,
  hasDocumentSets,
  showProjectGuide,
  onBoardTour,
  markdownDocument,
  markdownError,
  markdownIsError,
  markdownIsLoading,
  onFileSelect,
  onTicketSelect,
  onTicketStatusChange,
  runSummaryByTicket,
  selectedDocumentSet,
  selectedFile,
  selectedFileError,
  selectedFileIsLoading,
  selectedFileId,
  selectedWorkspace,
  ticketError,
  ticketDocument,
  ticketIsError,
  ticketIsLoading,
  ticketViewMode,
  ticketsByStatus,
  workspaceError,
  workspacesError,
  workspacesIsLoading,
}: {
  documentSetsError: Error | null;
  documentSetsIsError: boolean;
  documentSetsIsLoading: boolean;
  hasDocumentSets: boolean;
  showProjectGuide: boolean;
  onBoardTour?: () => void;
  markdownDocument?: MarkdownDocumentResponse;
  markdownError: Error | null;
  markdownIsError: boolean;
  markdownIsLoading: boolean;
  onFileSelect: (file: MarkdownFileSummary) => void;
  onTicketSelect: (ticketId: string) => void;
  onTicketStatusChange: SaveTicketStatus;
  runSummaryByTicket: Map<string, CodexRunSummary>;
  selectedDocumentSet?: DocumentSetSummary;
  selectedFile?: MarkdownFileSummary;
  selectedFileError: Error | null;
  selectedFileIsLoading: boolean;
  selectedFileId?: string;
  selectedWorkspace?: WorkspaceSummary;
  ticketError: Error | null;
  ticketDocument?: TicketDocumentResponse;
  ticketIsError: boolean;
  ticketIsLoading: boolean;
  ticketViewMode: TicketDocumentViewMode;
  ticketsByStatus: Map<TicketStatus, TicketItem[]>;
  workspaceError: Error | null;
  workspacesError: boolean;
  workspacesIsLoading: boolean;
}) {
  const { t } = useTranslation();
  if (showProjectGuide) return <ProjectGuide onBoardTour={onBoardTour} />;
  if (workspacesIsLoading || (!selectedFile && (selectedFileIsLoading || (documentSetsIsLoading && !selectedFileError)))) {
    return <BoardState isLoading title={t("Loading documents")} />;
  }

  if (workspacesError) {
    return (
      <BoardState
        icon="error"
        title={t("Could not load projects")}
        description={workspaceError ? formatClientError(workspaceError) : t("Unknown API error")}
      />
    );
  }

  if (documentSetsIsError && !selectedFileId) {
    return (
      <BoardState
        icon="error"
        title={t("Could not load documents")}
        description={documentSetsError ? formatClientError(documentSetsError) : t("Unknown API error")}
      />
    );
  }

  if (!selectedWorkspace?.isAvailable) {
    return (
      <BoardState
        icon="error"
        title={t("Project unavailable")}
        description={t("Select another available project from the project switcher.")}
      />
    );
  }

  if (!selectedFileId) {
    if (!hasDocumentSets) {
      return (
        <BoardState
          title={t("No planning documents yet")}
          description={t("Create tickets with the implementation-ledger skill in Codex, then review them here.")}
        />
      );
    }

    return (
      <BoardState
        title={t("No document selected")}
        description={t("Choose a plan, ticket, or inventory document from the sidebar.")}
      />
    );
  }

  if (!selectedFile) {
    if (selectedFileError) return <BoardState icon="error" title={t("Document unavailable")} description={formatClientError(selectedFileError)} />;
    return <BoardState title={t("Document unavailable")} />;
  }

  if (selectedFile.type !== "tickets" || ticketViewMode === "markdown") {
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
    return <BoardState isLoading title={t("Loading ticket board")} />;
  }

  if (ticketIsError) {
    return (
      <BoardState
        icon="error"
        title={t("Could not load ticket board")}
        description={ticketError ? formatClientError(ticketError) : t("Unknown API error")}
      />
    );
  }

  if (!ticketDocument) return <BoardState title={t("Document unavailable")} />;

  return (
    <TicketBoard
      key={`${selectedWorkspace?.id}:${selectedFileId}`}
      document={ticketDocument}
      onTicketSelect={onTicketSelect}
      onSaveStatus={onTicketStatusChange}
      runSummaryByTicket={runSummaryByTicket}
      ticketsByStatus={ticketsByStatus}
    />
  );
}

export function TicketBoard({ document, onTicketSelect, onSaveStatus, runSummaryByTicket, ticketsByStatus }: {
  document: TicketDocumentResponse;
  onTicketSelect: (ticketId: string) => void;
  onSaveStatus: SaveTicketStatus;
  runSummaryByTicket: Map<string, CodexRunSummary>;
  ticketsByStatus: Map<TicketStatus, TicketItem[]>;
}) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState<{ document: TicketDocumentResponse; ticketId: string }>();
  const [overStatus, setOverStatus] = useState<TicketStatus>();
  const [pendingMove, setPendingMove] = useState<TicketMove>();

  function resetDrag() {
    setDragged(undefined);
    setOverStatus(undefined);
  }

  function drop(event: DragEvent<HTMLElement>, status: TicketStatus) {
    event.preventDefault();
    if (dragged && !pendingMove) {
      setPendingMove(prepareTicketMove(dragged.document, dragged.ticketId, status));
    }
    resetDrag();
  }

  return (
    <>
      <div className="ak-project-board ak-kanban-grid grid min-w-[900px] grid-cols-6 gap-3" aria-label={t("Ticket kanban board")}>
        {BOARD_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            onTicketSelect={onTicketSelect}
            runSummaryByTicket={runSummaryByTicket}
            status={status}
            tickets={ticketsByStatus.get(status) ?? []}
            dragDisabled={Boolean(pendingMove)}
            isDragOver={overStatus === status}
            onDragStart={(event, ticketId) => {
              event.dataTransfer.setData("application/x-alpha-kanban-ticket", ticketId);
              event.dataTransfer.effectAllowed = "move";
              setDragged({ document, ticketId });
            }}
            onDragEnd={resetDrag}
            onDragOver={(event) => {
              if (!dragged || pendingMove) return;
              event.preventDefault();
              const target = prepareTicketMove(dragged.document, dragged.ticketId, status);
              event.dataTransfer.dropEffect = target ? "move" : "none";
              setOverStatus(target ? status : undefined);
            }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setOverStatus(undefined);
              }
            }}
            onDrop={(event) => drop(event, status)}
          />
        ))}
      </div>
      {pendingMove ? (
        <TicketMoveDialog
          move={pendingMove}
          currentHash={document.file.hash}
          currentMtimeMs={document.file.mtimeMs}
          onSave={onSaveStatus}
          onClose={() => setPendingMove(undefined)}
        />
      ) : null}
    </>
  );
}

function StartWorkspacePage({
  autoOpenLastWorkspace,
  onAutoOpenLastWorkspaceChange,
  onWorkspaceCreate,
  onWorkspaceOpenPath,
  onWorkspaceRootsChange,
  onWorkspaceSelect,
  workspaceRootsError,
  workspaceRootsIsLoading,
  workspaceRootsSettings,
  workspaces,
}: {
  autoOpenLastWorkspace: boolean;
  onAutoOpenLastWorkspaceChange: (enabled: boolean) => void;
  onWorkspaceCreate: (input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }) => Promise<void>;
  onWorkspaceOpenPath: (root: string) => Promise<void>;
  onWorkspaceRootsChange: (roots: string[]) => Promise<void>;
  onWorkspaceSelect: (workspaceId: string) => Promise<void>;
  workspaceRootsError: Error | null;
  workspaceRootsIsLoading: boolean;
  workspaceRootsSettings?: WorkspaceRootsSettingsResponse;
  workspaces: WorkspaceSummary[];
}) {
  return (
    <div className="ak-start-page">
      <StartPageNavigation />
      <div className="ak-start-content">
      <StartPageHeader autoOpen={autoOpenLastWorkspace} onAutoOpen={onAutoOpenLastWorkspaceChange}>
          <ProjectBrowseButton onOpen={onWorkspaceOpenPath} />
          <NewProjectButton onCreate={onWorkspaceCreate} />
      </StartPageHeader>

      <ProjectLists workspaces={workspaces} onSelect={onWorkspaceSelect} />

      <WorkspaceRootsPanel
        error={workspaceRootsError}
        isLoading={workspaceRootsIsLoading}
        onSave={onWorkspaceRootsChange}
        settings={workspaceRootsSettings}
      />

      <SkillGuide />
      </div>
    </div>
  );
}

function ProjectBrowseButton({
  onOpen,
}: {
  onOpen: (root: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [browseRoot, setBrowseRoot] = useState<string | undefined>();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const directoriesQuery = useQuery({
    enabled: isBrowserOpen,
    queryFn: () => fetchWorkspaceDirectories(browseRoot),
    queryKey: workspaceDirectoriesKey(browseRoot),
  });

  async function openProject(root: string): Promise<void> {
    const nextRoot = root.trim();
    if (!nextRoot) {
      return;
    }

    setIsOpening(true);
    setError(null);
    try {
      await onOpen(nextRoot);
      setIsBrowserOpen(false);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <>
      <Button
        disabled={isOpening}
        onClick={() => {
          setError(null);
          setIsBrowserOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {isOpening ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Folder className="size-3" aria-hidden="true" />
        )}
        {t("Browse project")}
      </Button>

      {error ? (
        <p className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {formatClientError(error)}
        </p>
      ) : null}

      <FolderPickerDialog
        data={directoriesQuery.data}
        error={directoriesQuery.isError ? normalizeClientError(directoriesQuery.error) : null}
        isLoading={directoriesQuery.isLoading}
        isOpening={isOpening}
        onBrowse={(root) => {
          setError(null);
          setBrowseRoot(root);
        }}
        onOpen={(root) => void openProject(root)}
        onOpenChange={setIsBrowserOpen}
        open={isBrowserOpen}
      />
    </>
  );
}

function NewProjectButton({
  onCreate,
}: {
  onCreate: (input: {
    gitInit: boolean;
    parentRoot: string;
    projectName: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [parentRoot, setParentRoot] = useState("");
  const [projectName, setProjectName] = useState("");
  const [gitInit, setGitInit] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<ClientApiError | Error | null>(null);
  const directoriesQuery = useQuery({
    enabled: isOpen,
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
      setIsOpen(false);
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <FolderKanban className="size-3" aria-hidden="true" />
        {t("New project")}
      </Button>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader className="pr-12">
            <DialogTitle>{t("New project")}</DialogTitle>
            <DialogDescription>
              {t("Create a new project folder under a configured root.")}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-0" onSubmit={(event) => void createProject(event)}>
            <div className="grid gap-4 px-5 pb-5 pt-2">
              <label className="grid gap-1.5 text-xs font-medium text-[var(--ak-ink-muted)]">
                {t("Location")}<Select
                  disabled={isCreating || directoriesQuery.isLoading || roots.length === 0}
                  onValueChange={setParentRoot}
                  value={parentRoot}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("No configured roots")} />
                  </SelectTrigger>
                  <SelectContent>
                    {roots.map((root) => (
                      <SelectItem key={root.path} value={root.path}>
                        {root.label} · {root.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-[var(--ak-ink-muted)]">
                {t("Project name")}<input
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

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--ak-ink-secondary)]">
                <Checkbox
                  checked={gitInit}
                  disabled={isCreating}
                  onCheckedChange={(checked) => setGitInit(checked === true)}
                />
                {t("Initialize git repository with main branch")}
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
            </div>

            <DialogFooter>
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="outline"
              >
                {t("Cancel")}
              </Button>
              <Button
                disabled={!parentRoot || !projectName.trim() || isCreating}
                type="submit"
              >
                {isCreating ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderKanban className="size-3" aria-hidden="true" />
                )}
                {t("Create project")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkspaceRootsPanel({
  error,
  isLoading,
  onSave,
  settings,
}: {
  error: Error | null;
  isLoading: boolean;
  onSave: (roots: string[]) => Promise<void>;
  settings?: WorkspaceRootsSettingsResponse;
}) {
  const { t } = useTranslation();
  const [localRoots, setLocalRoots] = useState<string[]>([]);
  const [browseRoot, setBrowseRoot] = useState<string | undefined>();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ClientApiError | Error | null>(null);
  const browserQueryRoot = browseRoot ?? settings?.roots[0]?.path;
  const browserQuery = useQuery({
    enabled: isBrowserOpen,
    queryKey: workspaceRootBrowserKey(browserQueryRoot),
    queryFn: () => fetchWorkspaceRootBrowserDirectories(browserQueryRoot),
  });

  useEffect(() => {
    if (settings) {
      setLocalRoots(settings.roots.map((root) => root.path));
    }
  }, [settings]);

  const defaultRootPaths = settings?.defaultRoots.map((root) => root.path) ?? [];

  function withAddedRoot(root: string): string[] | null {
    const nextRoot = root.trim();
    if (!nextRoot || localRoots.includes(nextRoot)) {
      return null;
    }

    return [...localRoots, nextRoot];
  }

  async function saveRoots(nextRoots: string[]): Promise<void> {
    if (nextRoots.length === 0) {
      setSaveError(new Error("At least one workspace root is required."));
      return;
    }

    const previousRoots = localRoots;
    setLocalRoots(nextRoots);
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(nextRoots);
    } catch (nextError) {
      setLocalRoots(previousRoots);
      setSaveError(normalizeClientError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="ak-panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ak-muted-label">{t("Workspace roots")}</p>
          <h3 className="ak-title mt-1 text-base">{t("Allowed project locations")}</h3>
          <p className="ak-body-muted mt-1 text-sm leading-6">
            {t("Project discovery, folder browsing, project creation, and Codex run cwd validation use these roots immediately after selection.")}
          </p>
        </div>
        <Badge variant={settings?.hasOverride ? "warning" : "outline"}>
          {settings?.hasOverride ? t("override") : t("default")}
        </Badge>
      </div>

      {isLoading ? (
        <div className="ak-panel-muted flex items-center gap-2 p-3 text-sm text-[var(--ak-ink-muted)]">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {t("Loading roots")}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {formatClientError(normalizeClientError(error))}
        </p>
      ) : null}

      <div className="grid gap-2">
        {localRoots.map((root, index) => (
          <div
            className="ak-control flex min-h-10 min-w-0 items-center gap-2 px-3 py-2 text-sm"
            key={`${root}-${index}`}
          >
            <Folder className="size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-all text-[var(--ak-ink)]">{root}</span>
            <Button
              aria-label={t("Remove {{path}}", { path: root })}
              disabled={isSaving || localRoots.length <= 1}
              onClick={() =>
                void saveRoots(localRoots.filter((_, rootIndex) => rootIndex !== index))
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={isSaving || defaultRootPaths.length === 0}
          onClick={() => void saveRoots(defaultRootPaths)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("Use defaults")}
        </Button>
        <Button
          disabled={isSaving}
          onClick={() => {
            setBrowseRoot(settings?.roots[0]?.path);
            setIsBrowserOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {isSaving ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <Folder className="size-3" aria-hidden="true" />
          )}
          {t("Browse root")}
        </Button>
      </div>

      {saveError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {formatClientError(saveError)}
        </p>
      ) : null}

      <WorkspaceRootBrowserDialog
        data={browserQuery.data}
        error={browserQuery.isError ? normalizeClientError(browserQuery.error) : null}
        isLoading={browserQuery.isLoading}
        onBrowse={setBrowseRoot}
        onOpenChange={setIsBrowserOpen}
        onSelect={(root) => {
          setIsBrowserOpen(false);
          const nextRoots = withAddedRoot(root);
          if (nextRoots) {
            void saveRoots(nextRoots);
          }
        }}
        open={isBrowserOpen}
      />
    </section>
  );
}

function WorkspaceRootBrowserDialog({
  data,
  error,
  isLoading,
  onBrowse,
  onOpenChange,
  onSelect,
  open,
}: {
  data?: WorkspaceDirectoriesResponse;
  error: ClientApiError | Error | null;
  isLoading: boolean;
  onBrowse: (root: string | undefined) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (root: string) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const currentDirectory = data?.directory;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[min(720px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="pr-12">
          <DialogTitle>{t("Select workspace root")}</DialogTitle>
          <DialogDescription>
            {t("Choose a local folder to use as an Alpha Kanban project root.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[190px_minmax(0,1fr)] border-y border-[var(--ak-hairline)] max-[720px]:grid-cols-1">
          <aside className="min-h-0 border-r border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] p-3 max-[720px]:border-b max-[720px]:border-r-0">
            <p className="ak-muted-label mb-2 px-1">{t("Shortcuts")}</p>
            <div className="grid gap-1 max-[720px]:grid-cols-2">
              {data?.roots.map((root) => (
                <DirectoryRootButton
                  isSelected={isRootSelected(root, currentDirectory?.path)}
                  key={root.path}
                  onBrowse={() => onBrowse(root.path)}
                  root={root}
                />
              ))}
            </div>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--ak-surface)]">
            <div className="grid gap-3 border-b border-[var(--ak-hairline)] p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  aria-label={t("Parent folder")}
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
                  <span className="truncate">{currentDirectory?.path ?? t("Loading")}</span>
                </div>
              </div>
              {currentDirectory ? (
                <div className="flex flex-wrap items-center gap-1">
                  <WorkspaceStatusBadge hasDocs={currentDirectory.hasDocs} />
                  {currentDirectory.isWorkspaceCandidate ? (
                    <Badge variant="success">{t("project")}</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="ak-scroll-area min-h-0 overflow-auto">
              <div className="grid min-w-[700px] grid-cols-[minmax(190px,1.25fr)_150px_minmax(300px,2fr)] border-b border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] px-3 py-2 ak-muted-label">
                <span>{t("Name")}</span>
                <span>{t("Type")}</span>
                <span>{t("Path")}</span>
              </div>
              {isLoading ? (
                <div className="ak-body-muted flex items-center gap-2 px-4 py-5 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t("Loading folders")}
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
                  {t("Empty folder")}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter className="max-[720px]:flex-col max-[720px]:items-stretch">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("Cancel")}
          </Button>
          <Button
            disabled={!currentDirectory?.path}
            onClick={() => onSelect(currentDirectory?.path ?? "")}
            type="button"
          >
            <Folder className="size-4" aria-hidden="true" />
            {t("Select Root")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { t } = useTranslation();
  if (isLoading) {
    return <BoardState isLoading title={t("Loading {{type}}", { type: documentTypeLabel(file.type) })} />;
  }

  if (isError || !document) {
    return (
      <BoardState
        icon="error"
        title={t("Could not load document")}
        description={error ? formatClientError(error) : t("Unknown API error")}
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
            <h4 className="ak-muted-label">{t("Linked docs")}</h4>
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
              <h4 className="ak-muted-label">{t("Ticket progress")}</h4>
              <div className="ak-panel-muted px-3 py-2 text-sm">
                {t("{{done}} / {{total}} tickets done", { done: documentSet.ticketProgress.doneTickets ?? 0, total: documentSet.ticketProgress.totalTickets })}
              </div>
            </section>
          ) : null}

          <section className="grid gap-2">
            <h4 className="ak-muted-label">{t("Outline")}</h4>
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
                      className="ak-focus-ring grid w-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-2 rounded-[var(--ak-radius-sm)] px-1 py-1 text-left transition-colors hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]"
                      onClick={() => scrollToMarkdownHeading(headingId)}
                      title={heading.title}
                      type="button"
                    >
                      <span className="text-[var(--ak-ink-faint)]">{t("Line {{line}}", { line: heading.line })}</span>
                      <span className="truncate">{heading.title}</span>
                    </button>
                  </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-[var(--ak-ink-faint)]">{t("No headings")}</p>
            )}
          </section>
        </div>
      </aside>

      <article className="ak-panel flex min-h-0 min-w-0 flex-col overflow-hidden max-[960px]:h-[calc(100dvh-10rem)]">
        <div className="shrink-0 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-5 py-4">
            <p className="ak-muted-label">{t("{{type}} reader", { type: documentTypeLabel(file.type) })}</p>
          <h3 className="ak-title mt-1 break-words text-lg">
            {document.outline[0]?.title ?? file.filename}
          </h3>
        </div>
        <div className="ak-scroll-area min-h-0 flex-1 overflow-auto px-5 py-4">
          <MarkdownMessage content={document.markdown} headingIdsByLine={headingIdsByLine} file={file} />
        </div>
      </article>
    </div>
  );
}

function BoardState({
  action,
  description,
  icon = "empty",
  isLoading = false,
  title,
}: {
  action?: ReactNode;
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
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  onTicketSelect,
  runSummaryByTicket,
  status,
  tickets,
  dragDisabled,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onTicketSelect: (ticketId: string) => void;
  runSummaryByTicket: Map<string, CodexRunSummary>;
  status: TicketStatus;
  tickets: TicketItem[];
  dragDisabled: boolean;
  isDragOver: boolean;
  onDragStart: (event: DragEvent<HTMLElement>, ticketId: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
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
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            onSelect={() => onTicketSelect(ticket.id)}
            runSummary={runSummaryByTicket.get(ticket.id)}
            ticket={ticket}
            draggable={!dragDisabled}
            onDragStart={(event) => onDragStart(event, ticket.id)}
            onDragEnd={onDragEnd}
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
  draggable,
  onDragStart,
  onDragEnd,
}: {
  onSelect: () => void;
  runSummary?: CodexRunSummary;
  ticket: TicketItem;
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      data-tour="board-card"
      className="ak-card transition-colors hover:border-border hover:bg-muted"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <button
        aria-label={t("Open {{id}}", { id: ticket.id })}
        className="block w-full cursor-grab p-3 text-left active:cursor-grabbing"
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
          <PropertyRow label={t("Progress")} value={`${ticket.progress}%`} />
          <PropertyRow
            label={t("Repo")}
            value={ticket.repository.length > 0 ? ticket.repository.join(", ") : "-"}
          />
          <PropertyRow
            label={t("Depends")}
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
  const { t } = useTranslation();
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
      ? t("Run handoff")
      : intent === "spec_grilling"
        ? t("Ask")
        : t("Send");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="ak-workspace-chat-dialog">
        <DialogHeader className="border-b border-[var(--ak-hairline)] px-5 py-4 pr-12">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>{t("Workspace Chat")}</DialogTitle>
              <DialogDescription className="mt-1 truncate">
                {selectedWorkspace?.root ?? t("Select a project")}
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
                  {t("Running")}
                </Badge>
              ) : run ? (
                <Badge variant="muted">{runLabel(run.status)}</Badge>
              ) : null}
              <Badge variant="outline">{t("{{count}} documents", { count: documentCount })}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="ak-scroll-area min-h-0 overflow-y-auto bg-[var(--ak-canvas-soft)]">
          <div className="ak-workspace-chat-thread grid gap-4">
            {error ? (
              <div className="rounded-[var(--ak-radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {formatClientError(error)}
              </div>
            ) : null}

            {!canUseWorkspaceChat ? (
              <div className="ak-panel-muted px-3 py-2 text-sm text-[var(--ak-ink-muted)]">
                {t("Select an available project before opening workspace chat.")}
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
              label={t("Workspace message")}
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
                        {t("Purpose")}
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
                        {t("Access")}
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
                          {t("Locked by")}{workspaceIntentLabel(intent)}.
                        </p>
                      ) : null}
                    </section>
                    <section className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ak-ink-faint)]">
                        {t("Model")}
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
                        {t("Advanced")}
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
                      {t("Preview")}
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
                        {t("Preparing prompt")}
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
                    {t("Running")}
                  </span>
                ) : run ? (
                  <span className="text-xs text-[var(--ak-ink-faint)]">
                    {t("Last run: {{status}}", { status: runLabel(run.status) })}
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
                {isWorkspaceRunActive ? t("Running") : sendLabel}
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function TicketDetailDrawer({
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
  isLoadingCodexRunDefaults = false,
  presentation,
  onCodexRunDefaultsChange = async () => { throw new Error("Embedded chat is unavailable in this view."); },
  onClose,
  onAppendInstruction,
  onExternalFileReload,
  onPatchTicket,
  onReload,
  onRunDocumentChange = onReload,
  onRunRead = onReload,
  onRunStatusChange = onReload,
  onOpenInWorkspace,
  ticket,
  ticketRunSummary,
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
  isLoadingCodexRunDefaults?: boolean;
  presentation: TicketDetailPresentation;
  onCodexRunDefaultsChange?: (defaults: {
    model?: string | null;
    reasoningEffort?: string | null;
    speedTier?: string | null;
  }) => Promise<unknown>;
  onClose: () => void;
  onAppendInstruction: (
    ticketId: string,
    kind: TicketInstructionKind,
    text: string,
  ) => Promise<void>;
  onExternalFileReload: () => Promise<unknown>;
  onPatchTicket: (
    ticketId: string,
    status: TicketStatus,
    progress: TicketProgress,
    reason: string,
  ) => Promise<void>;
  onReload: () => Promise<unknown>;
  onRunDocumentChange?: () => Promise<unknown>;
  onRunRead?: () => Promise<unknown>;
  onRunStatusChange?: () => Promise<unknown>;
  onOpenInWorkspace?: () => void;
  ticket: TicketItem;
  ticketRunSummary?: CodexRunSummary;
  workspaceId?: string;
}) {
  const { t } = useTranslation();
  const [statusDraft, setStatusDraft] = useState<TicketStatus>(ticket.status);
  const [progressDraft, setProgressDraft] = useState<TicketProgress>(ticket.progress);
  const [changeReason, setChangeReason] = useState("");
  const [instructionText, setInstructionText] = useState("");
  const [isAppendingInstruction, setIsAppendingInstruction] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
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
    enabled: Boolean(IN_APP_CHAT_ENABLED && workspaceId && fileId && ticket.id),
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
    if (!IN_APP_CHAT_ENABLED || !ticketRunSummary?.id) {
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
    if (isSaving || isAppendingInstruction || externalFileChange || !canSaveStatus || !TICKET_PROGRESS_BY_STATUS[statusDraft].includes(progressDraft)) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setSavedMessage("");
    try {
      await onPatchTicket(ticket.id, statusDraft, progressDraft, changeReason.trim());
      setChangeReason("");
      setSavedMessage("상태와 변경 사유를 문서에 저장했습니다.");
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveInstruction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!instructionText.trim() || isAppendingInstruction || isSaving || externalFileChange) {
      return;
    }
    setIsAppendingInstruction(true);
    setError(null);
    setSavedMessage("");
    try {
      await onAppendInstruction(ticket.id, "manual", instructionText.trim());
      setInstructionText("");
      setSavedMessage("사용자 지시를 문서에 추가했습니다.");
    } catch (nextError) {
      setError(normalizeClientError(nextError));
    } finally {
      setIsAppendingInstruction(false);
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
      t("Delete this failed chat message? The raw run log will be kept."),
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
  const canUseCodex = IN_APP_CHAT_ENABLED && !codexDisabledReason;
  const canStartCodexRun =
    canUseCodex &&
    !externalFileChange &&
    (documentRunSummary?.canStartRun ?? true) &&
    isScopeAllowed;
  const ticketChatMessageCount = ticketChatQuery.data?.messages.length ?? 0;
  const ticketSendLabel = runMode === "read_only" ? t("Ask") : t("Run");

  return (
    <TicketDetailFrame ticketId={ticket.id} presentation={presentation} onClose={onClose}
      onOpenInWorkspace={onOpenInWorkspace}
      isBusy={isSaving || isAppendingInstruction}
      hasDraft={canSaveStatus || Boolean(changeReason.trim() || instructionText.trim() || runDraft.trim())}>
        <header className="ak-drawer-header">
            <DialogTitle className="ak-title break-words text-2xl">{ticket.title}</DialogTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
              <span className="ak-body-muted text-sm">{ticket.type}</span>
            </div>
        </header>

        <div className="ak-drawer-body">
          {externalFileChange ? (
            <ExternalFileChangeBanner
              event={externalFileChange}
              hasLocalDraft={canSaveStatus || Boolean(changeReason.trim() || instructionText.trim() || runDraft.trim())}
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
          {savedMessage ? (
            <p className="mb-3 text-sm text-[var(--ak-ink-muted)]" role="status">{t(savedMessage)}</p>
          ) : null}

          <section data-tour="ticket-status" className="grid gap-3 border-b border-[var(--ak-hairline)] pb-5">
            <h3 className="ak-title text-sm">{t("Properties")}</h3>
            <TicketStatusFields
              currentStatus={ticket.status}
              currentProgress={ticket.progress}
              draft={{ status: statusDraft, progress: progressDraft, reason: changeReason }}
              disabled={isSaving || isAppendingInstruction}
              onChange={(draft) => {
                setStatusDraft(draft.status);
                setProgressDraft(draft.progress);
                setChangeReason(draft.reason);
                setSavedMessage("");
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canSaveStatus || !TICKET_PROGRESS_BY_STATUS[statusDraft].includes(progressDraft) || isSaving || isAppendingInstruction || Boolean(externalFileChange)}
                onClick={saveStatus}
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-3" aria-hidden="true" />
                )}
                {t("Save status")}
              </Button>
            </div>
          </section>

          <div className="grid gap-6 py-5">
            <CanonicalSection title={t("Repository")} items={ticket.repository} />
            <CanonicalSection title={t("Depends on")} items={ticket.dependsOn} />
            <CanonicalSection tourAnchor="ticket-scope" title={t("목표")} items={ticket.goal} />
            <CanonicalSection title={t("현재 문제")} items={ticket.currentProblem} />
            <CanonicalSection title={t("구현 범위")} items={ticket.implementationScope} />
            <CanonicalSection title={t("제외 범위")} items={ticket.outOfScope} />
            <CanonicalSection
              tourAnchor="ticket-criteria"
              title={t("완료 기준")}
              items={ticket.completionCriteria}
              checklistItems={ticket.completionCriteriaItems}
            />
            <CanonicalSection
              title={t("검증")}
              items={ticket.validation}
              checklistItems={ticket.validationItems}
            />

            <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="ak-title text-sm">{t("사용자 지시")}</h3>
                <Badge variant="muted">{ticket.userInstructions.length}</Badge>
              </div>
              <LogTimeline emptyLabel={t("No user instructions")} entries={ticket.userInstructions} />
              <form data-tour="ticket-instructions" className="grid gap-3" onSubmit={(event) => void saveInstruction(event)}>
                <label className="grid gap-2 text-xs font-medium text-[var(--ak-ink-muted)]">
                  {t("수동 지시")}<Textarea
                    disabled={isSaving || isAppendingInstruction}
                    onChange={(event) => {
                      setInstructionText(event.target.value);
                      setSavedMessage("");
                    }}
                    rows={3}
                    value={instructionText}
                  />
                </label>
                <div className="flex justify-end">
                  <Button disabled={!instructionText.trim() || isSaving || isAppendingInstruction || Boolean(externalFileChange)} size="sm" type="submit">
                    {isAppendingInstruction ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Save className="size-3" aria-hidden="true" />}
                    {t("문서에 추가")}
                  </Button>
                </div>
              </form>
            </section>

            <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div data-tour="ticket-notes" className="flex items-center justify-between gap-3">
                <h3 className="ak-title text-sm">{t("진행 메모")}</h3>
                <Badge variant="muted">{ticket.progressNotes.length}</Badge>
              </div>
              <LogTimeline emptyLabel={t("No progress notes")} entries={ticket.progressNotes} />
            </section>

            {IN_APP_CHAT_ENABLED ? <section className="grid gap-3 border-t border-[var(--ak-hairline)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-[var(--ak-ink-muted)]" aria-hidden="true" />
                  <h3 className="ak-title text-sm">{t("Ticket chat")}</h3>
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
                  <span className="font-medium">{t("Active run on")}{activeRun.ticketId}</span>
                </div>
              ) : null}
              {ticketRunSummary?.isUnread ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  <div className="flex min-w-0 items-center gap-2">
                    <RunSignalBadge compact run={ticketRunSummary} />
                    <span className="truncate font-medium">{t("Unread run result")}</span>
                  </div>
                  <Button disabled={isMarkingRead} onClick={markRunRead} size="sm" variant="outline">
                    {isMarkingRead ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="size-3" aria-hidden="true" />
                    )}
                    {t("Mark as read")}
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
                  label={t("Ticket message")}
                  onChange={(nextValue) => {
                    setRunDraft(nextValue);
                    setPreview(null);
                    setIsPreviewOpen(false);
                  }}
                  placeholder={
                    runMode === "read_only"
                      ? t("답변받을 질문을 입력")
                      : t("이번 Codex 실행에서 처리할 지시를 입력")
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
                            {t("Access")}
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
                            {t("Model")}
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
                            {t("Advanced")}
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
                          {t("Preview")}
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
                            {t("Preparing prompt")}
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
                        {t("Running")}
                      </span>
                    ) : run ? (
                      <span className="text-xs text-[var(--ak-ink-faint)]">
                        {t("Last run: {{status}}", { status: runLabel(run.status) })}
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
                        {t("Cancel")}
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
                      {run?.status === "running" ? t("Running") : ticketSendLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </section> : null}
          </div>
        </div>
    </TicketDetailFrame>
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
  const { t } = useTranslation();
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
          <p className="font-medium">{isStale ? t("Markdown changed on disk") : t("Request failed")}</p>
          <p className="mt-1 text-red-700">{errorSummary(error)}</p>
          <details className="mt-1 text-xs"><summary>{t("Technical details")}</summary><p className="break-words">{errorDetails(error)}</p></details>
        </div>
        {isStale ? (
          <Button disabled={isReloading} onClick={reload} size="sm" variant="outline">
            {isReloading ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="size-3" aria-hidden="true" />
            )}
            {t("Reload")}
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
  const { t } = useTranslation();
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
            {event.eventType === "removed" ? t("Markdown file was removed") : t("File changed externally")}
          </p>
          <p className="mt-1 break-words text-xs text-amber-800">
            {event.workspaceRelativePath} · {formatDateTime(event.observedAt)}
          </p>
          {hasLocalDraft ? (
            <p className="mt-1 text-xs text-amber-800">
              {t("Reload before saving so the draft does not use stale Markdown.")}
            </p>
          ) : null}
        </div>
        <Button disabled={isReloading} onClick={reload} size="sm" variant="outline">
          {isReloading ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="size-3" aria-hidden="true" />
          )}
          {t("Reload")}
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
  const { t } = useTranslation();
  const [activeMention, setActiveMention] = useState<ActiveMentionQuery | undefined>();
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const suggestions = useMemo(
    () => buildScopeSuggestions(availableTickets, activeMention?.query ?? ""),
    [activeMention?.query, availableTickets, t],
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
            aria-label={t("Scope suggestions")}
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
        ? t("Ticket {{id}}", { id: input.targetTicketId })
        : scopeMentionLabel(input.kind, input.token),
    targetTicketId: input.targetTicketId,
    token: input.token,
  };
}

function scopeMentionLabel(kind: CodexChatScopeMentionKind, token: string): string {
  if (kind === "workspace") {
    return t("Workspace");
  }
  if (kind === "ticket") {
    return token.includes(":") ? t("Ticket {{id}}", { id: token.slice(token.indexOf(":") + 1).toUpperCase() }) : t("Ticket");
  }
  return t(token.toLowerCase() === "@tickets" ? "Tickets" : "Document");
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
      description: t("Selected workspace"),
      id: "workspace",
      kind: "workspace",
      label: t("Workspace"),
      token: "@workspace",
    },
    {
      description: t("Current ticket document"),
      id: "tickets",
      kind: "document",
      label: t("Tickets"),
      token: "@tickets",
    },
    {
      description: t("Current document"),
      id: "document",
      kind: "document",
      label: t("Document"),
      token: "@document",
    },
  ];
  const ticketSuggestions = availableTickets.map((ticket): ScopeSuggestion => ({
    description: ticket.title,
    id: ticket.id,
    kind: "ticket",
    label: t("Ticket {{id}}", { id: ticket.id }),
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
  const { t } = useTranslation();
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-medium text-[var(--ak-ink-muted)]">{t("Mode")}</legend>
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
              {t(option.label)}
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
  const { t } = useTranslation();
  return (
    <fieldset className="flex min-h-8 items-center gap-1 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-1">
      <legend className="sr-only">{t("Mode")}</legend>
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
            {option.mode === "edit" ? t("Edit") : t("Read-only")}
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
  const { t } = useTranslation();
  return (
    <fieldset className="flex min-h-8 items-center gap-1 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] p-1">
      <legend className="sr-only">{t("Workspace chat purpose")}</legend>
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
            {t(option.label)}
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
  const { t } = useTranslation();
  return (
    <label
      className={[
        "ak-focus-ring grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-[var(--ak-radius-md)] border border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-3 py-2 text-xs transition-colors hover:bg-[var(--ak-surface-hover)]",
        checked ? "border-amber-200 bg-amber-50 text-amber-950" : "text-[var(--ak-ink-secondary)]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      title={t("Pass --dangerously-bypass-approvals-and-sandbox to Codex CLI for this run only")}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5 size-3.5"
        disabled={disabled}
        onCheckedChange={(nextChecked) => onChange(nextChecked === true)}
      />
      <span className="grid gap-0.5">
        <span className="font-semibold">{t("Bypass approvals and sandbox")}</span>
        <span className="font-normal text-[var(--ak-ink-muted)]">
          {t("This run only. Allows operations such as Git metadata creation, installs, and scripts.")}
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
  const { t } = useTranslation();
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
          <span className="text-[var(--ak-ink-faint)]">{t(emptyMentionsLabel)}</span>
        )}
      </div>
      {warnings.length > 0 ? (
        <div className="grid gap-1 text-amber-800">
          {warnings.map((warning) => (
            <p className="break-words" key={warning}>
              {t(warning)}
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
  tourAnchor,
}: {
  checklistItems?: TicketChecklistItem[];
  items: string[];
  title: string;
  tourAnchor?: string;
}) {
  if (checklistItems && checklistItems.length > 0) {
    return (
      <section className="grid gap-2">
        <h3 data-tour={tourAnchor} className="ak-title text-sm">{title}</h3>
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
      <h3 data-tour={tourAnchor} className="ak-title text-sm">{title}</h3>
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
  const { t } = useTranslation();
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
          aria-label={t("Codex model")}
          className="h-8 w-auto min-w-[8.5rem] max-w-52 rounded-full px-2.5 text-xs"
        >
          <Zap className="size-3.5 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
          <SelectValue placeholder={t("CLI model")} />
        </SelectTrigger>
        <SelectContent className="min-w-56">
          <SelectItem value={CLI_DEFAULT_SELECT_VALUE}>{t("CLI default")}</SelectItem>
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
          aria-label={t("Codex reasoning effort")}
          className="h-8 w-auto min-w-[6.75rem] rounded-full px-2.5 text-xs"
        >
          <SelectValue placeholder={t("Model default")} />
        </SelectTrigger>
        <SelectContent className="min-w-44">
          <SelectItem value={MODEL_DEFAULT_SELECT_VALUE}>{t("Model default")}</SelectItem>
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
        title={canUseFast ? t("Use Codex fast service tier") : t("Selected model does not expose fast tier")}
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
        {t("Fast")}
      </label>

      {isSaving ? (
        <span className="flex items-center gap-1 text-xs text-[var(--ak-ink-faint)]">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {t("saving")}
        </span>
      ) : null}
      {error ? (
        <span className="max-w-72 truncate text-xs text-red-700" title={error.message}>
          {errorSummary(error)}
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
  const { t } = useTranslation();
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
        <p className="text-sm text-[var(--ak-ink-faint)]">{t("Loading chat history")}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700">{t("Could not load ticket chat:")} {formatClientError(error)}</p>
      ) : null}
      {!isLoading && !error && messages.length === 0 ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">
          {t("Run with Codex messages will appear here.")}
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
  const { t } = useTranslation();
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
          <h4 className="ak-title text-sm">{t("Workspace chat")}</h4>
        </div>
        <Badge variant="muted">{messages.length}</Badge>
      </div>
      {isLoading ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">{t("Loading workspace chat")}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700">{t("Could not load workspace chat:")} {formatClientError(error)}</p>
      ) : null}
      {!isLoading && !error && messages.length === 0 ? (
        <p className="text-sm text-[var(--ak-ink-faint)]">
          {t("Project-wide messages will appear here.")}
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
  const { t } = useTranslation();
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
            <span className="text-sm font-semibold text-[var(--ak-ink)]">{t("Activity")}</span>
            <Badge variant="muted">{runQuery.isError ? t("unavailable") : t("loading")}</Badge>
          </div>
          <span className="truncate text-xs text-[var(--ak-ink-faint)]">{runId.slice(0, 8)}</span>
        </div>
        {runQuery.isError ? (
          <p className="text-xs text-red-700">
            {t("Could not load run activity:")} {formatClientError(normalizeClientError(runQuery.error))}
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
  const { t } = useTranslation();
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
          <span className="text-sm font-semibold text-[var(--ak-ink)]">{t("Activity")}</span>
          <Badge variant={run.status === "running" ? "warning" : "muted"}>{runLabel(run.status)}</Badge>
          {isBypassSandboxArgs(run.args) ? <Badge variant="warning">{t("bypass sandbox")}</Badge> : null}
          <RunDefaultsBadges defaults={run.runDefaults} compact />
        </div>
        <span className="text-xs text-[var(--ak-ink-faint)]">
          {t("{{steps}} steps · {{events}} events", { steps: activityItems.length, events: events.length })}
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
                      {t(item.label)}
                    </p>
                    <p className="ak-workspace-run-activity-detail text-xs text-[var(--ak-ink-faint)]">
                      {item.detail}
                    </p>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-xs text-[var(--ak-ink-faint)]">{t("Waiting for Codex activity.")}</li>
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
  const { t } = useTranslation();
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
            {isAssistant ? t("Assistant") : t("User")}
          </Badge>
          {intent ? <Badge variant="warning">{workspaceIntentLabel(intent)}</Badge> : null}
          {message.runId ? <Badge variant="muted">{message.runId.slice(0, 8)}</Badge> : null}
          {canRetry ? (
            <Badge variant={run ? "warning" : "muted"}>
              {run ? runLabel(run.rawStatus) : t("Run status unknown")}
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
              title={canStartRun ? t("Retry this chat message") : t("Another Codex run is active")}
              variant="outline"
            >
              {isRetrying ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="size-3" aria-hidden="true" />
              )}
              {t("Retry")}
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              disabled={isDeleting || isRetrying}
              onClick={() => onDelete?.(message)}
              size="xs"
              title={t("Delete this chat message")}
              variant="ghost"
            >
              {isDeleting ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3" aria-hidden="true" />
              )}
              {t("Delete")}
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
  file,
}: {
  content: string;
  headingIdsByLine?: Record<number, string>;
  file?: MarkdownFileSummary;
}) {
  const remarkPlugins = headingIdsByLine
    ? [remarkGfm, remarkHeadingIds(headingIdsByLine)]
    : [remarkGfm];

  return (
    <div className="ak-markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={IS_BROWSER_LOCAL ? {
        img: ({ src, alt }) => <BrowserMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} file={file} />,
        a: ({ href, children }) => <BrowserMarkdownLink href={href} file={file}>{children}</BrowserMarkdownLink>,
      } : undefined}>{content}</ReactMarkdown>
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
  const { t } = useTranslation();
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
          {preview.resumeSessionId ? t("resume session") : t("new session")}
        </Badge>
        {isBypassSandboxArgs(preview.args) ? (
          <Badge variant="warning">{t("bypass sandbox")}</Badge>
        ) : null}
        <RunDefaultsBadges defaults={preview.runDefaults} />
      </div>
      {codexChatScopeRunWarnings(preview.scopeResolution, preview.mode).length > 0 ? (
        <div className="grid gap-1 text-xs text-amber-800">
          {codexChatScopeRunWarnings(preview.scopeResolution, preview.mode).map((warning) => (
            <p className="break-words" key={warning}>
              {t(warning)}
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
  const { t } = useTranslation();
  const hasAnyDefault = Boolean(
    defaults.model || defaults.reasoningEffort || defaults.speedTier,
  );

  if (!hasAnyDefault) {
    return <Badge variant="muted">{t("CLI defaults")}</Badge>;
  }

  return (
    <>
      {defaults.model ? (
        <Badge variant="outline">{compact ? defaults.model : t("model {{model}}", { model: defaults.model })}</Badge>
      ) : null}
      {defaults.reasoningEffort ? (
        <Badge variant="outline">
          {compact ? reasoningEffortLabel(defaults.reasoningEffort) : t("reasoning {{effort}}", { effort: reasoningEffortLabel(defaults.reasoningEffort) })}
        </Badge>
      ) : null}
      {defaults.speedTier ? (
        <Badge variant={defaults.speedTierApplied ? "warning" : "muted"}>
          {defaults.speedTierApplied
            ? t("{{tier}} tier", { tier: t(defaults.speedTier) })
            : t("{{tier}} saved, not applied", { tier: t(defaults.speedTier) })}
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
    : t("CLI default");
  const reasoning = defaults?.reasoningEffort
    ? reasoningEffortLabel(defaults.reasoningEffort)
    : t("model default");
  const speed = defaults?.speedTier === "fast" ? t("fast tier") : t("standard");
  const access = isRunModeLocked ? t("{{mode}} locked", { mode: runModeLabel(mode) }) : runModeLabel(mode);
  const scope = mentions.length > 0 ? mentions.join(", ") : t("default scope");
  const sandbox = bypassSandbox ? t("bypass sandbox") : undefined;

  return [compactModelLabel(model, defaults?.model ?? model), reasoning, speed, access, scope, sandbox]
    .filter(Boolean)
    .join(" · ");
}

function confirmBypassSandboxRun(): boolean {
  return window.confirm(
    t("This run will bypass Codex approvals and sandbox restrictions. Continue only if you trust the target workspace and command scope."),
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
  const exit = typeof exitCode === "number" ? t("exit {{code}}", { code: exitCode }) : running ? t("Running") : status;
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
  const scopeName = scopeLabel === "workspace" ? t("Workspace") : scopeLabel === "document" ? t("Document") : t("Ticket");
  return [scopeLabel ? t("{{scope}} scope", { scope: scopeName }) : undefined, mode === "edit" || mode === "read_only" ? runModeLabel(mode) : mode, instruction]
    .filter(Boolean)
    .join(" · ");
}

function summarizeUsage(usage: Record<string, unknown> | undefined): string {
  const inputTokens = getNumberValue(usage, "input_tokens");
  const outputTokens = getNumberValue(usage, "output_tokens");
  const reasoningTokens = getNumberValue(usage, "reasoning_output_tokens");
  return [
    typeof inputTokens === "number" ? t("{{count}} input tokens", { count: inputTokens.toLocaleString(locale()) }) : undefined,
    typeof outputTokens === "number" ? t("{{count}} output tokens", { count: outputTokens.toLocaleString(locale()) }) : undefined,
    typeof reasoningTokens === "number" ? t("{{count}} reasoning tokens", { count: reasoningTokens.toLocaleString(locale()) }) : undefined,
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
  const { t } = useTranslation();
  const isActive = run.status === "queued" || run.status === "running";
  const label = runSignalLabel(run.status);

  return (
    <span
      className={[
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border px-1.5 text-xs font-medium",
        runSignalClassName(run.status),
      ].join(" ")}
      title={t("{{status}} · {{mode}} · {{id}}", { status: label, mode: runModeLabel(run.mode), id: run.ticketId })}
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
  return new Intl.DateTimeFormat(locale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DocumentTypeBadge({ type }: { type: MarkdownFileType }) {
  useTranslation();
  return (
    <Badge variant={type === "tickets" ? "default" : "outline"}>
      {documentTypeLabel(type)}
    </Badge>
  );
}

function documentTypeLabel(type: MarkdownFileType): string {
  return {
    inventory: t("Inventory"),
    markdown: t("Markdown"),
    plan: t("Plan"),
    tickets: t("Tickets"),
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

function runSignalLabel(status: CodexRunSignalStatus): string {
  return {
    cancelled: t("Cancelled"),
    failed: t("Failed"),
    idle: t("Idle"),
    needs_auth: t("Needs auth"),
    queued: t("Queued"),
    running: t("Running"),
    succeeded: t("Succeeded"),
    unknown: t("Unknown"),
  }[status];
}

function runLabel(status: CodexRunSummary["rawStatus"]): string {
  return {
    cancelled: t("Cancelled"),
    failed: t("Failed"),
    queued: t("Queued"),
    running: t("Running"),
    succeeded: t("Succeeded"),
  }[status];
}

function runModeLabel(mode: CodexRunMode): string {
  return {
    edit: t("Edit files"),
    read_only: t("Read-only"),
  }[mode];
}

function compactModelLabel(displayName: string, slug: string): string {
  return displayName.trim() || slug;
}

function reasoningEffortLabel(effort: string): string {
  const labels: Record<string, string> = {
    high: t("높음"),
    low: t("낮음"),
    medium: t("중간"),
    minimal: t("최소"),
    none: t("없음"),
    xhigh: t("매우 높음"),
  };

  return labels[effort] ?? effort;
}

function workspaceIntentLabel(intent: CodexWorkspaceChatIntent): string {
  return {
    general: t("Workspace chat"),
    plan_ticketing_handoff: t("Plan/Ticket handoff"),
    spec_grilling: t("Spec grilling"),
  }[intent];
}

function workspaceIntentPlaceholder(intent: CodexWorkspaceChatIntent): string {
  return {
    general: t("프로젝트 전체 기준 질문이나 논의를 입력"),
    plan_ticketing_handoff: t("정리된 논의를 plan/ticket 문서로 생성 또는 갱신하도록 지시"),
    spec_grilling: t("구현 전 요구사항을 질문으로 좁히고 싶은 내용을 입력"),
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
    return t("Workspace scope");
  }
  if (resolution.scope === "document") {
    return t("Document scope");
  }
  return resolution.targetTicketId ? t("Ticket {{id}}", { id: resolution.targetTicketId }) : t("Ticket scope");
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

export function priorityVariant(priority: string) {
  if (priority === "P0") {
    return "warning";
  }
  if (priority === "P1") {
    return "default";
  }
  return "muted";
}

export function normalizeClientError(error: unknown): ClientApiError | Error {
  return error instanceof ClientApiError
    ? error
    : error instanceof Error
      ? error
      : new Error(String(error));
}

export function formatClientError(error: ClientApiError | Error): string {
  if (IS_BROWSER_LOCAL) return t(error.message);
  return `${errorSummary(error)} (${errorDetails(error)})`;
}

function upsertEvent(events: CodexRunEvent[], event: CodexRunEvent): CodexRunEvent[] {
  if (events.some((item) => item.id === event.id)) {
    return events.map((item) => (item.id === event.id ? event : item));
  }
  return [...events, event].sort((a, b) => a.id - b.id);
}
