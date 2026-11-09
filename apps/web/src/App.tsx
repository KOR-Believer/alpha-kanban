import { DocumentPanelShell } from "./components/documents/DocumentPanelShell";
import { DocumentListHeader, DocumentSetNavigator, type DocumentNavigationSettings } from "./components/documents/DocumentNavigation";
import { useDocumentColumnFilters } from "./components/documents/documentPanelState";
import { DocumentSetSwitcher } from "./components/documents/DocumentStatusControls";
import { VirtualTicketList } from "./components/tickets/VirtualTicketList";
import { TicketSearchExcerpt, SearchHighlight } from "./components/tickets/TicketSearch";
import { useProjectSearch } from "./useProjectSearch";
import { matchesTicketSearch, normalizeTicketQuery } from "./ticketSearch";
import { MarkdownDocumentReader as SharedMarkdownDocumentReader, DocumentTypeBadge, documentTypeLabel } from "./components/MarkdownDocumentReader";
import { useLinkedNavigation } from "./browser/linkedNavigation";
import { LinkedDocumentPage } from "./browser/LinkedDocumentPage";
import { DocumentMaintenance } from "./browser/DocumentMaintenance";
import { browserRepository, BrowserFileError } from "./browser/repository";
import { subscribeFileEvents } from "./browser/fileEvents";
import { BrowserStartPage, BrowserProjectSwitcher, BrowserFilesMenu, BrowserReconnect } from "./browser/BrowserConnections";
import { documentRouteId } from "./appRoute";
import { t, locale, useTranslation } from "@/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandIcon, ChannelBadge } from "@/components/AppBrand";
import { PwaMenu } from "./pwa/PwaMenu";
import { SkillUpdatesButton } from "./skills/SkillUpdates";
import { ProjectGuide } from "@/components/ProjectGuide";
import { TourHelp, useScreenTour } from "./onboarding/ScreenTour";
import { errorSummary, errorDetails } from "@/i18n/errors";
import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
  type DragEvent, type FormEvent, type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  APP_NAME, TICKET_PROGRESS_BY_STATUS, markdownFileChangeEventSchema,
  type DocumentSetSummary, type MarkdownDocumentResponse, type MarkdownFileChangeEvent,
  type MarkdownFileSummary, type MarkdownFileType, type TicketChecklistItem,
  type TicketDocumentResponse, type TicketItem, type TicketInstructionKind,
  type TicketProgress, type TicketStatus, type WorkspaceSummary,
} from "@alpha-kanban/shared";
import {
  AlertCircle, Archive, BookOpen, Check, CircleDot, FileText,
  LayoutGrid, ListChecks, Loader2, RefreshCcw, Save, Search, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { NavigationLink } from "./components/NavigationLink";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogTitle } from "@/components/ui/dialog";
import {
  buildAppRoute,
  parseAppRouteState,
  type AppRouteState,
  type TicketDocumentViewMode,
} from "./appRoute";
import {
  DEFAULT_DOCUMENT_SET_SORT_PREFERENCE,
  isDocumentSetSortDirection,
  isDocumentSetSortMode,
  sortDocumentSets,
  type DocumentSetSortPreference,
} from "./documentSetSorting";
import { DEFAULT_DOCUMENT_FILTERS, filterDocumentSets, type DocumentFilters, DEFAULT_COLUMN_FILTERS } from "./documentSetFiltering";
import { TicketStatusFields, type SaveTicketStatus, type TicketWriteGuard } from "@/components/tickets/TicketStatusFields";
import { TicketMoveDialog, prepareTicketMove, type TicketMove } from "@/components/tickets/TicketMoveDialog";
import {
  useTicketDetailPresentation, type TicketDetailPresentation,
} from "./components/tickets/useTicketDetailPresentation";
import { TicketDetailFrame } from "./components/tickets/TicketDetailFrame";
import { TicketProgressBar } from "./components/tickets/TicketProgressBar";
import { DocumentOwnerBadge, ProjectOwnerFilter } from "./components/DocumentOwner";
import { matchesOwnerFilter, ownerFilterFor, ownersInFiles, useOwnerFilters, type OwnerFilter } from "./ownerFilters";

export const BOARD_STATUSES: TicketStatus[] = [
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
];
const DOCUMENT_SET_SORT_STORAGE_KEY = "alpha-kanban.documentSetSort";
const DOCUMENT_FILTERS_STORAGE_KEY = "alpha-kanban.documentFilters";
const AUTO_OPEN_LAST_WORKSPACE_STORAGE_KEY = "alpha-kanban.autoOpenLastWorkspace";
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

export async function fetchWorkspaces() {
  return browserRepository.workspaces();
}

async function selectWorkspaceById(workspaceId: string) {
  return browserRepository.select(workspaceId);
}

async function fetchDocumentSets(workspaceId: string) {
  return browserRepository.documentSets(workspaceId);
}

async function fetchMarkdownDocument(workspaceId: string, fileId: string) {
  return browserRepository.markdown(workspaceId, fileId);
}

export async function fetchTicketDocument(workspaceId: string, fileId: string) {
  return browserRepository.tickets(workspaceId, fileId);
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
  return browserRepository.patch(workspaceId, fileId, ticketId, body);
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
  return browserRepository.append(workspaceId, fileId, ticketId, body);
}

export function App({ allowStartupAutoOpen = true }: { allowStartupAutoOpen?: boolean }) {
  const linked = useLinkedNavigation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
  const selectedWorkspaceId = routeState.workspaceId;
  const preferredFilePath = routeState.filePath;
  const selectedTicketId = routeState.ticketId;
  const ticketViewMode = routeState.ticketViewMode ?? "board";
  const isProjectGuideOpen = routeState.showGuide === true;
  const [defaultDocument, setDefaultDocument] = useState<{ workspaceId: string; fileId: string }>();
  const [pendingBoardTour, setPendingBoardTour] = useState<string>();
  const lastBoardFile = useRef<MarkdownFileSummary | undefined>(undefined);
  const ticketPresentation = useTicketDetailPresentation(routeState.detailMode, (detailMode) => {
    void navigateTo({ ...routeState, filePath: resolvedSelectedFileId, detailMode });
  });
  const [externalFileChange, setExternalFileChange] =
    useState<MarkdownFileChangeEvent | null>(null);
  const [documentSetSortPreferences, setDocumentSetSortPreferences] = useState(
    readStoredDocumentSetSortPreferences,
  );
  const [documentSearch, setDocumentSearchValue] = useState(routeState.documentSearch ?? "");
  const deferredDocumentSearch = useDeferredValue(documentSearch);
  const [documentFilters, setDocumentFilters] = useState(readStoredDocumentFilters);
  const [columnFilters, setColumnFilters] = useDocumentColumnFilters(selectedWorkspaceId);
  const ownerPreferences = useOwnerFilters();
  const ownerFilter = ownerFilterFor(ownerPreferences.filters, selectedWorkspaceId);
  const setOwnerFilter = (value: OwnerFilter) => { if (selectedWorkspaceId) ownerPreferences.update({ [selectedWorkspaceId]: value }); };
  const [initialAutoOpenLastWorkspace] = useState(readStoredAutoOpenLastWorkspace);
  const shouldAutoOpenLastWorkspaceOnLoadRef = useRef(
    allowStartupAutoOpen && !initialRouteRef.current.workspaceId && initialAutoOpenLastWorkspace,
  );
  const [autoOpenLastWorkspace, setAutoOpenLastWorkspace] = useState(
    initialAutoOpenLastWorkspace,
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
    refetchInterval: 15_000,
  });
  const documentSets = documentSetsQuery.data?.sets ?? [];
  const documentOwners = useMemo(() => ownersInFiles(documentSets.flatMap((set) => set.documents)), [documentSets]);
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
  const projectSearch = useProjectSearch(allFiles, deferredDocumentSearch, canLoadWorkspace && !documentSetsQuery.isError);
  const visibleDocumentSets = useMemo(() => {
    const filtered = filterDocumentSets(sortedDocumentSets, "", documentFilters, ownerFilter, columnFilters);
    if (!deferredDocumentSearch.trim()) return filtered;
    const names = new Set(filterDocumentSets(sortedDocumentSets, deferredDocumentSearch, documentFilters, ownerFilter, columnFilters).map((set) => set.documentSet.id));
    return filtered.flatMap((set) => {
      const documents = names.has(set.documentSet.id) ? set.documents : set.documents.filter((file) => projectSearch.matches.has(file.id));
      return documents.length ? [{ ...set, documents }] : [];
    });
  }, [sortedDocumentSets, deferredDocumentSearch, documentFilters, ownerFilter, columnFilters, projectSearch.matches]);
  const boardScroll = useRef<HTMLDivElement>(null);
  const deferredTicketSearch = routeState.appliedSearch ?? "";
  useEffect(() => { boardScroll.current?.scrollTo({ top: 0 }); }, [deferredTicketSearch]);
  const firstPlanningFile = allFiles.find((file) => file.type !== "markdown");
  const defaultFile = (defaultDocument?.workspaceId === selectedWorkspaceId
    ? allFiles.find((file) => file.id === defaultDocument?.fileId)
    : undefined) ?? firstPlanningFile;
  const preferredFile = preferredFilePath
    ? allFiles.find((file) => file.id === preferredFilePath)
    : undefined;
  const listedSelectedFile = isProjectGuideOpen ? undefined : preferredFilePath ? preferredFile : defaultFile;
  const savedFileId = defaultDocument?.workspaceId === selectedWorkspaceId ? defaultDocument?.fileId : undefined;
  const resolvedSelectedFileId = isProjectGuideOpen ? undefined : preferredFilePath ?? listedSelectedFile?.id ?? (!documentSetsQuery.isSuccess ? savedFileId : undefined);
  const isProjectGuideVisible = isProjectGuideOpen ||
    (canLoadWorkspace && documentSetsQuery.isSuccess && !resolvedSelectedFileId && !firstPlanningFile);
  const selectedFileQuery = useQuery({
    enabled: Boolean(canLoadWorkspace && resolvedSelectedFileId && !listedSelectedFile),
    queryKey: ["browser-file", selectedWorkspaceId, resolvedSelectedFileId],
    queryFn: () => browserRepository.file(selectedWorkspaceId ?? "", resolvedSelectedFileId ?? ""),
  });
  const selectedFile = listedSelectedFile ?? selectedFileQuery.data;
  const currentSelectedFilePath = selectedFile ? documentRouteId(selectedFile) : preferredFilePath;
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
  // Keep an already-read ticket mounted if a move removes its old handle/listing.
  // This snapshot preserves drafts; it is never a substitute for the write guard.
  const selectedTicket =
    ticketViewMode === "board" && (!selectedFile || isTicketsDocument)
      ? ticketQuery.data?.document.tickets.find((ticket) => ticket.id === selectedTicketId)
      : undefined;
  const isTicketDetailOpen = Boolean(selectedTicket);
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
    if (selectedWorkspaceId || !allowStartupAutoOpen) {
      shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    }
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
      void navigate({ href: buildAppRoute({ workspaceId: lastWorkspace.id }), resetScroll: false });
    }
  }, [allowStartupAutoOpen, autoOpenLastWorkspace, navigate, selectedWorkspaceId, workspacesQuery.data]);

  useEffect(() => {
    // Keep the initial document stable when sorting, without adding an automatic history entry.
    if (isProjectGuideOpen || preferredFilePath || !selectedWorkspaceId || !defaultFile) return;
    if (defaultDocument?.workspaceId !== selectedWorkspaceId || defaultDocument.fileId !== defaultFile.id) {
      setDefaultDocument({ workspaceId: selectedWorkspaceId, fileId: defaultFile.id });
    }
  }, [defaultDocument, defaultFile, isProjectGuideOpen, preferredFilePath, selectedWorkspaceId]);

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

      if (isTicketDetailOpen) {
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
    isTicketDetailOpen,
    isTicketsDocument,
    markdownQuery.data?.file.hash,
    queryClient,
    resolvedSelectedFileId,
    selectedWorkspaceId,
    ticketQuery.data?.file.hash,
    ticketViewMode,
  ]);

  useEffect(() => {
    setDocumentSearchValue(routeState.documentSearch ?? "");
  }, [selectedWorkspaceId, routeState.documentSearch]);

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

  async function replaceDocument(data: TicketDocumentResponse): Promise<void> {
    await queryClient.cancelQueries({ queryKey: ticketDocumentKey(data.file.workspaceId, data.file.id) });
    await queryClient.cancelQueries({ queryKey: markdownDocumentKey(data.file.workspaceId, data.file.id) });
    queryClient.setQueryData(ticketDocumentKey(selectedWorkspaceId, resolvedSelectedFileId), data);
    await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
  }

  async function reloadExternalFileChange(): Promise<void> {
    if (!selectedWorkspaceId || !resolvedSelectedFileId) {
      setExternalFileChange(null);
      return;
    }

    const results = isTicketsDocument || ticketQuery.data
      ? await Promise.all([
        ticketQuery.refetch(),
        ...(ticketViewMode === "markdown" ? [markdownQuery.refetch()] : []),
      ])
      : [await markdownQuery.refetch()];
    await queryClient.invalidateQueries({ queryKey: documentSetsKey(selectedWorkspaceId) });
    if (results.some((result) => result.isError)) return;
    setExternalFileChange(null);
  }

  async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
    setPendingBoardTour(undefined);
    const response = await selectWorkspaceById(workspaceId);
    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    await navigateTo({ workspaceId: response.workspace.id });
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  function navigateTo(state: AppRouteState): Promise<void> | undefined {
    const href = buildAppRoute(state);
    if (href !== routeLocation.href) return navigate({ href, resetScroll: false });
  }

  function setDocumentSearch(value: string) {
    setDocumentSearchValue(value);
    // Replace only search state: typing keeps the current document, linked page and draft.
    const url = new URL(routeLocation.href, window.location.origin);
    if (value) url.searchParams.set("q", value); else url.searchParams.delete("q");
    if (!value.trim()) url.searchParams.delete("match");
    void navigate({ href: url.pathname + url.search + url.hash, replace: true, resetScroll: false });
  }

  function handleGoToStartPage(): void {
    setPendingBoardTour(undefined);
    shouldAutoOpenLastWorkspaceOnLoadRef.current = false;
    void navigateTo({});
  }

  function handleShowProjectGuide(): void {
    lastBoardFile.current = selectedFile?.type === "tickets" ? selectedFile : undefined;
    setPendingBoardTour(undefined);
    void navigateTo({ workspaceId: selectedWorkspaceId, showGuide: true });
  }

  function documentRoute(file: MarkdownFileSummary, view = ticketViewMode): AppRouteState {
    return { workspaceId: selectedWorkspaceId, filePath: documentRouteId(file), ticketViewMode: view, documentSearch };
  }
  function handleDocumentSelect(file: MarkdownFileSummary, view = ticketViewMode): Promise<void> | undefined {
    setPendingBoardTour(undefined);
    return navigateTo(documentRoute(file, view));
  }

  function searchResultRoute(file: MarkdownFileSummary): AppRouteState {
    const match = projectSearch.matches.get(file.id);
    const view = match ? file.type === "tickets" && match.ticketIds.length ? "board" : "markdown" : "board";
    return { workspaceId: selectedWorkspaceId, filePath: file.id, ticketViewMode: view,
      documentSearch, appliedSearch: match ? deferredDocumentSearch.trim() : undefined };
  }
  function handleSearchResultSelect(file: MarkdownFileSummary) {
    setPendingBoardTour(undefined);
    return navigateTo(searchResultRoute(file));
  }

  function handleTicketSelect(ticketId?: string): void {
    void navigateTo({ ...routeState, filePath: resolvedSelectedFileId, ticketId, detailMode: ticketPresentation.mode });
  }

  function handleTicketViewChange(view: TicketDocumentViewMode): void {
    void navigateTo({ ...routeState, filePath: resolvedSelectedFileId, ticketId: undefined, ticketViewMode: view });
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

  const boardTour = useScreenTour(linked.id ? "linked" : "project", {
    enabled: canLoadWorkspace && (!isTicketDetailOpen || Boolean(linked.id)),
    eligible: !linked.id && !isProjectGuideVisible && isTicketsDocument && ticketViewMode === "board" && ticketQuery.isSuccess && Boolean(ticketQuery.data?.document.tickets.length),
    scope: `${selectedWorkspaceId}:${resolvedSelectedFileId}:${ticketViewMode}:${isProjectGuideVisible}:${linked.id ?? ""}`,
  });
  const tourFile = allFiles.find((file) => file.id === lastBoardFile.current?.id && file.type === "tickets") ?? allFiles.find((file) => file.type === "tickets");
  useEffect(() => {
    if (!pendingBoardTour) return;
    if (resolvedSelectedFileId !== pendingBoardTour || isProjectGuideVisible || isTicketDetailOpen) { setPendingBoardTour(undefined); return; }
    if (boardTour.enabled && ticketQuery.isSuccess) { boardTour.start(); setPendingBoardTour(undefined); }
  }, [pendingBoardTour, resolvedSelectedFileId, isProjectGuideVisible, isTicketDetailOpen, boardTour.enabled, boardTour.start, ticketQuery.isSuccess]);

  const navigationSettings: DocumentNavigationSettings = {
    disabled: !canLoadWorkspace, filters: documentFilters, onFiltersChange: setDocumentFilters,
    columns: columnFilters, onColumnsChange: setColumnFilters,
    owners: documentOwners, ownerFilter, onOwnerFilterChange: setOwnerFilter,
    preference: documentSetSortPreference, onPreferenceChange: updateDocumentSetSortPreference,
  };

  if (!selectedWorkspaceId) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <BrowserStartPage autoOpen={autoOpenLastWorkspace} onAutoOpen={setAutoOpenLastWorkspace} onSelect={handleWorkspaceSelect} workspaces={workspacesQuery.data?.workspaces ?? []} error={workspacesQuery.error} isLoading={workspacesQuery.isPending} />
      </main>
    );
  }

  return (
    <>
      <main
        className="grid h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-secondary)]"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--ak-hairline)] bg-[var(--ak-header-surface)] px-4 py-2 max-[720px]:flex-wrap">
          <NavigationLink href="/"
            className="ak-row flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--ak-canvas-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-focus)]"
            onNavigate={handleGoToStartPage}
          >
            <BrandIcon className="size-5 shrink-0 text-[var(--ak-ink-muted)]" />
            <span className="ak-project-brand-name ak-title truncate text-sm">{APP_NAME}</span>
            <ChannelBadge icon={false} />
          </NavigationLink>

          <BrowserProjectSwitcher workspaces={workspacesQuery.data?.workspaces ?? []} selectedWorkspaceId={selectedWorkspaceId} onSelect={handleWorkspaceSelect} />

          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            <LanguageSelector />
            <ThemeToggle surface="--ak-surface" />
            <span aria-hidden="true" className="ak-toolbar-divider" />
            <SkillUpdatesButton placement="toolbar" />
            <TourHelp tour={boardTour} />
            <PwaMenu />
            <NavigationLink href="/all" data-tour="all-tickets" title={t("All tickets")} onNavigate={() => void navigate({ to: "/all" })} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <LayoutGrid aria-hidden="true" />
              <span className="ak-toolbar-label">{t("All tickets")}</span>
            </NavigationLink>
            <BrowserFilesMenu />
          </div>
        </header>

        <DocumentPanelShell contextKey={selectedWorkspaceId} count={visibleDocumentSets.length} total={sortedDocumentSets.length}
          ownerControl={<ProjectOwnerFilter owners={documentOwners} value={ownerFilter} onChange={setOwnerFilter} />}
          search={{ value: documentSearch, onChange: setDocumentSearch, disabled: !canLoadWorkspace }}
          currentDocument={selectedFile ? <>
            <span className="ak-document-current-title truncate">{ticketQuery.data?.document.title ?? markdownQuery.data?.outline[0]?.title ?? selectedDocumentSet?.label ?? selectedFile.filename}</span>
            <DocumentSetSwitcher key={selectedFile.id} file={selectedFile} documents={selectedDocumentSet?.documents ?? [selectedFile]}
              disabled={!canLoadWorkspace} href={(file) => buildAppRoute(documentRoute(file))} onSelect={(file) => { void handleDocumentSelect(file); }} />
            <span className="ak-document-current-path truncate" title={selectedFile.workspaceRelativePath}>{selectedFile.workspaceRelativePath}</span>
          </> : <span className="truncate">{isProjectGuideVisible ? t("Usage guide") : t("Document workspace")}</span>}
          toolbar={(controls, close) => <DocumentListHeader settings={navigationSettings} search={documentSearch} onSearchChange={setDocumentSearch} controls={controls} count={visibleDocumentSets.length}
            guide={<NavigationLink href={buildAppRoute({ workspaceId: selectedWorkspaceId, showGuide: true })} data-tour-help=""
              aria-current={isProjectGuideVisible ? "page" : undefined} title={t("Usage guide")} aria-label={t("Usage guide")}
              className={buttonVariants({ size: "sm", variant: isProjectGuideVisible ? "secondary" : "ghost", className: "ak-document-guide" })}
              onNavigate={() => { handleShowProjectGuide(); close(); }}><BookOpen aria-hidden="true" /><span>{t("Usage guide")}</span></NavigationLink>} />}
          navigation={(view, close) => <>
            <div className="ak-document-panel-notices">
                {selectedWorkspace && !selectedWorkspace.isAvailable ? (
                  <SidebarState label={t("Project unavailable")} tone="error" />
                ) : null}
                {!canLoadWorkspace ? <BrowserReconnect workspaceId={selectedWorkspaceId} /> : null}
                {preferredFilePath && !preferredFile && documentSetsQuery.isSuccess ? <SidebarState label={t("The original document is unavailable. Select it again from the document list.")} tone="error" /> : null}
                {documentSetsQuery.isLoading ? <SidebarState label={t("Loading documents")} /> : null}
                {documentSetsQuery.isError ? (
                  <SidebarState label={t("Could not load documents")} tone="error" />
                ) : null}
                {documentSetsQuery.isSuccess && sortedDocumentSets.length === 0 ? (
                  <SidebarState label={t("No documents")} />
                ) : null}
                {documentSearch.trim() && (projectSearch.busy || documentSearch !== deferredDocumentSearch) ? <SidebarState label={t("Searching document contents · {{checked}} / {{total}}", { checked: projectSearch.checked, total: allFiles.length })} /> : null}
                {documentSearch.trim() && projectSearch.missing ? <div className="grid gap-1 px-3 py-2 text-xs text-muted-foreground" role="status">
                  <p>{t("{{count}} documents could not be searched. Results are incomplete.", { count: projectSearch.missing })}</p>
                  <Button size="sm" variant="link" onClick={projectSearch.retry}>{t("Retry search preparation")}</Button>
                </div> : null}
                {sortedDocumentSets.length > 0 && visibleDocumentSets.length === 0 && !projectSearch.busy && !projectSearch.missing && documentSearch === deferredDocumentSearch ? (
                  <div className="grid justify-items-start gap-2 px-3 py-2 text-sm text-muted-foreground" role="status">
                    <p>{t("No matching documents")}</p>
                    <Button size="sm" variant="link" onClick={() => { setDocumentSearch(""); setDocumentFilters(DEFAULT_DOCUMENT_FILTERS); setColumnFilters(DEFAULT_COLUMN_FILTERS); setOwnerFilter("all"); }}>
                      {t("Clear filters")}
                    </Button>
                  </div>
                ) : null}
            </div>
            <DocumentSetNavigator documentSets={visibleDocumentSets} view={view} settings={navigationSettings}
              onSelectFile={async (file) => { await (documentSearch.trim() ? handleSearchResultSelect(file) : handleDocumentSelect(file)); close(); }}
              fileHref={(file) => buildAppRoute(documentSearch.trim() ? searchResultRoute(file) : documentRoute(file))}
              selectedFileId={resolvedSelectedFileId} matches={projectSearch.matches} search={deferredDocumentSearch}
              busy={projectSearch.busy || documentSearch !== deferredDocumentSearch} />
          </>}
        >
          <div className="min-h-0 min-w-0">
          <section
            className={`${linked.id ? "hidden" : "grid"} h-full min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden`}
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
                    <DocumentOwnerBadge file={selectedFile} tourAnchor="document-owner" />
                    <p className="ak-body-muted min-w-0 truncate text-xs">
                      {selectedFile.workspaceRelativePath}
                    </p>
                  </div>
                ) : null}
                {selectedFile && !matchesOwnerFilter(selectedFile, ownerFilter) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
                    <span>{t("The open document is outside the selected owner filter.")}</span>
                    <Button size="xs" variant="link" onClick={() => setOwnerFilter("all")}>{t("Clear owner filter")}</Button>
                  </div>
                ) : null}
              </div>
              {!isProjectGuideVisible ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 max-[720px]:w-full max-[720px]:justify-between">
                {selectedFile ? <DocumentMaintenance key={selectedFile.id} file={selectedFile} /> : null}
                {selectedFile?.type === "tickets" ? (
                  <TicketDocumentViewToggle
                    mode={ticketViewMode}
                    onChange={handleTicketViewChange}
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
                  selectedDocumentSet={selectedDocumentSet}
                  ticketCount={ticketQuery.data?.document.tickets.length ?? 0}
                />
              </div> : null}
            </header>

            <div>
              {deferredTicketSearch && !isProjectGuideVisible ? <div className="ak-all-board-toolbar" data-tour="applied-document-search">
                <span className="text-sm" role="status">{t("Results for “{{query}}”", { query: deferredTicketSearch })}</span>
                {isTicketsDocument && ticketViewMode === "board" ? <Badge variant="muted">{t("{{count}} tickets", { count: ticketQuery.data?.document.tickets.filter((ticket) => matchesTicketSearch(ticket, normalizeTicketQuery(deferredTicketSearch))).length ?? 0 })}</Badge> : null}
                <Button size="sm" variant="outline" onClick={() => void navigateTo({ ...routeState, appliedSearch: undefined })}>{t("View whole document")}</Button>
              </div> : null}
            </div>
            <div ref={boardScroll} data-board-scroll className={`ak-scroll-area min-h-0 overflow-auto ${isTicketsDocument && ticketViewMode === "board" ? "ak-project-board-scroll" : "p-5"}`}>
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
                onBoardTour={tourFile ? async () => {
                  await handleDocumentSelect(tourFile, "board");
                  setPendingBoardTour(tourFile.id);
                } : undefined}
                onFileSelect={handleDocumentSelect}
                fileHref={(file) => buildAppRoute(documentRoute(file))}
                ticketHref={(ticketId) => buildAppRoute({ ...routeState, filePath: resolvedSelectedFileId, ticketId, detailMode: ticketPresentation.mode })}
                onTicketSelect={handleTicketSelect}
                onTicketStatusChange={handlePatchTicket}
                ticketDocument={ticketQuery.data}
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
                searchQuery={deferredTicketSearch}
              />
            </div>
          </section>
          {linked.id ? <LinkedDocumentPage key={linked.id} /> : null}
          </div>
        </DocumentPanelShell>
      </main>

      {selectedTicket && resolvedSelectedFileId && ticketQuery.data ? (
        <TicketDetailDrawer
          key={`${selectedWorkspaceId}:${resolvedSelectedFileId}:${selectedTicket.id}`}
          searchQuery={deferredTicketSearch}
          presentation={ticketPresentation}
          onClose={() => handleTicketSelect()}
          onAppendInstruction={handleAppendTicketInstruction}
          onPatchTicket={handlePatchTicket}
          onReload={() => ticketQuery.refetch()}
          externalFileChange={externalFileChange}
          onExternalFileReload={reloadExternalFileChange}
          ticket={selectedTicket}
          file={selectedFile ?? ticketQuery.data.file}
        />
      ) : null}

    </>
  );
}

function SidebarState({ label, tone = "muted" }: { label: string; tone?: "error" | "muted" }) {
  return (
    <div
      className={[
        "m-2 rounded-[var(--ak-radius-md)] border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-[var(--ak-danger-soft)] text-foreground"
          : "border-[var(--ak-hairline)] bg-[var(--ak-canvas-soft)] text-[var(--ak-ink-muted)]",
      ].join(" ")}
    >
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
  selectedDocumentSet,
  ticketCount,
}: {
  fallbackFile?: MarkdownFileSummary;
  file?: MarkdownFileSummary;
  isLoading: boolean;
  markdownDocument?: MarkdownDocumentResponse;
  selectedDocumentSet?: DocumentSetSummary;
  ticketCount?: number;
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

      <DocumentTypeBadge type={displayFile.type} />
      {displayFile.type === "tickets" && ticketCount !== undefined ? (
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
  fileHref,
  ticketHref,
  onTicketSelect,
  onTicketStatusChange,
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
  searchQuery,
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
  fileHref: (file: MarkdownFileSummary) => string;
  ticketHref: (ticketId: string) => string;
  onTicketSelect: (ticketId: string) => void;
  onTicketStatusChange: SaveTicketStatus;
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
  searchQuery?: string;
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
        description={workspaceError ? formatClientError(workspaceError) : t("Could not read local files.")}
      />
    );
  }

  if (documentSetsIsError && !selectedFileId) {
    return (
      <BoardState
        icon="error"
        title={t("Could not load documents")}
        description={documentSetsError ? formatClientError(documentSetsError) : t("Could not read local files.")}
      />
    );
  }

  if (!selectedWorkspace?.isAvailable) {
    return (
      <BoardState
        icon="error"
        title={t("Project unavailable")}
        description={t("Select another available project from the project switcher.")}
        action={selectedWorkspace ? <BrowserReconnect workspaceId={selectedWorkspace.id} /> : undefined}
      />
    );
  }

  if (!selectedFileId) {
    if (!hasDocumentSets) {
      return (
        <BoardState
          title={t("No planning documents yet")}
          description={t("Create tickets with implementation-ledger in your AI tool, then review them here.")}
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
        fileHref={fileHref}
        searchQuery={searchQuery}
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
        description={ticketError ? formatClientError(ticketError) : t("Could not read local files.")}
      />
    );
  }

  if (!ticketDocument) return <BoardState title={t("Document unavailable")} />;

  return (
    <TicketBoard
      key={`${selectedWorkspace?.id}:${selectedFileId}`}
      document={ticketDocument}
      onTicketSelect={onTicketSelect}
      ticketHref={ticketHref}
      onSaveStatus={onTicketStatusChange}
      ticketsByStatus={ticketsByStatus}
      searchQuery={searchQuery}
    />
  );
}

export function TicketBoard({ document, onTicketSelect, onSaveStatus, ticketsByStatus, ticketHref, searchQuery = "" }: {
  searchQuery?: string;
  document: TicketDocumentResponse;
  ticketHref?: (ticketId: string) => string;
  onTicketSelect: (ticketId: string) => void;
  onSaveStatus: SaveTicketStatus;
  ticketsByStatus: Map<TicketStatus, TicketItem[]>;
}) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState<{ document: TicketDocumentResponse; ticketId: string }>();
  const [overStatus, setOverStatus] = useState<TicketStatus>();
  const [pendingMove, setPendingMove] = useState<TicketMove>();
  const filtered = useMemo(() => new Map([...ticketsByStatus].map(([status, tickets]) => [status, tickets.filter((ticket) => matchesTicketSearch(ticket, normalizeTicketQuery(searchQuery)))])), [ticketsByStatus, searchQuery]);

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
            file={document.file}
            ticketHref={ticketHref ?? ((ticketId) => buildAppRoute({ workspaceId: document.file.workspaceId, filePath: document.file.id, ticketId }))}
            onTicketSelect={onTicketSelect}
            status={status}
            tickets={filtered.get(status) ?? []}
            searchQuery={searchQuery}
            draggedKey={dragged?.ticketId}
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

function MarkdownDocumentReader({
  document,
  documentSet,
  error,
  file,
  isError,
  isLoading,
  onFileSelect,
  fileHref,
  searchQuery,
}: {
  document?: MarkdownDocumentResponse;
  documentSet?: DocumentSetSummary;
  error: Error | null;
  file: MarkdownFileSummary;
  isError: boolean;
  isLoading: boolean;
  onFileSelect: (file: MarkdownFileSummary) => void;
  fileHref: (file: MarkdownFileSummary) => string;
  searchQuery?: string;
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
        description={error ? formatClientError(error) : t("Could not read local files.")}
      />
    );
  }

  return <SharedMarkdownDocumentReader document={document} documentSet={documentSet} file={file} searchQuery={searchQuery}
    fileHref={(id) => fileHref(documentSet?.documents.find((entry) => entry.id === id) ?? file)}
    onFileSelect={(id) => onFileSelect(documentSet?.documents.find((entry) => entry.id === id) ?? file)} />;
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
  file,
  ticketHref,
  searchQuery = "",
  draggedKey,
  onTicketSelect,
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
  file: MarkdownFileSummary;
  ticketHref: (ticketId: string) => string;
  searchQuery?: string;
  draggedKey?: string;
  onTicketSelect: (ticketId: string) => void;
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
        <VirtualTicketList items={tickets} itemKey={(ticket) => ticket.id} pinnedKey={draggedKey}>{(ticket) => (
          <TicketCard
            key={ticket.id}
            file={file}
            href={ticketHref(ticket.id)}
            onSelect={() => onTicketSelect(ticket.id)}
            ticket={ticket}
            searchQuery={searchQuery}
            draggable={!dragDisabled}
            onDragStart={(event) => onDragStart(event, ticket.id)}
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
  file: MarkdownFileSummary;
  href: string;
  onSelect: () => void;
  searchQuery?: string;
  ticket: TicketItem;
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
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
        className="block w-full cursor-grab p-3 text-left active:cursor-grabbing"
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

export function TicketDetailDrawer({
  searchQuery = "",
  file,
  externalFileChange,
  presentation,
  onClose,
  onAppendInstruction,
  onExternalFileReload,
  onPatchTicket,
  onReload,
  onOpenInWorkspace,
  ticket,
}: {
  file?: MarkdownFileSummary;
  externalFileChange?: MarkdownFileChangeEvent | null;
  presentation: TicketDetailPresentation;
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
  onOpenInWorkspace?: () => void;
  searchQuery?: string;
  ticket: TicketItem;
}) {
  const { t } = useTranslation();
  const [statusDraft, setStatusDraft] = useState<TicketStatus>(ticket.status);
  const [progressDraft, setProgressDraft] = useState<TicketProgress>(ticket.progress);
  const [changeReason, setChangeReason] = useState("");
  const [instructionText, setInstructionText] = useState("");
  const [isAppendingInstruction, setIsAppendingInstruction] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<BrowserFileError | Error | null>(null);

  useEffect(() => {
    setStatusDraft(ticket.status);
    setProgressDraft(ticket.progress);
    setError(null);
  }, [ticket.id, ticket.progress, ticket.status]);

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

  const canSaveStatus = statusDraft !== ticket.status || progressDraft !== ticket.progress;
  const latestErrorCode = error instanceof BrowserFileError ? error.code : undefined;

  return (
    <TicketDetailFrame ticketId={ticket.id} presentation={presentation} onClose={onClose}
      onOpenInWorkspace={onOpenInWorkspace}
      workspaceHref={file ? buildAppRoute({ workspaceId: file.workspaceId, filePath: file.id, ticketId: ticket.id, detailMode: presentation.mode }) : undefined}
      isBusy={isSaving || isAppendingInstruction}
      hasDraft={canSaveStatus || Boolean(changeReason.trim() || instructionText.trim())}>
        <header className="ak-drawer-header">
            <DialogTitle className="ak-title break-words text-2xl">{ticket.title}</DialogTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
              <DocumentOwnerBadge file={file} />
              <span className="ak-body-muted text-sm">{ticket.type}</span>
            </div>
        </header>

        <div className="ak-drawer-body">
          {externalFileChange ? (
            <ExternalFileChangeBanner
              event={externalFileChange}
              hasLocalDraft={canSaveStatus || Boolean(changeReason.trim() || instructionText.trim())}
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
            <TicketSearchExcerpt ticket={ticket} query={searchQuery} detail />
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
    <div className="mb-5 rounded-[var(--ak-radius-md)] border border-destructive/30 bg-[var(--ak-danger-soft)] px-3 py-2 text-sm text-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-destructive">{isStale ? t("Markdown changed on disk") : t("Request failed")}</p>
          <p className="mt-1">{errorSummary(error)}</p>
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
    <div className="mb-5 rounded-[var(--ak-radius-md)] border border-[color-mix(in_oklch,var(--ak-warning),transparent_60%)] bg-[var(--ak-warning-soft)] px-3 py-2 text-sm text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {event.eventType === "removed" ? t("Markdown file was removed") : t("File changed externally")}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {event.workspaceRelativePath} · {formatDateTime(event.observedAt)}
          </p>
          {hasLocalDraft ? (
            <p className="mt-1 text-xs">
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


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function normalizeClientError(error: unknown): BrowserFileError | Error {
  return error instanceof BrowserFileError
    ? error
    : error instanceof Error
      ? error
      : new Error(String(error));
}

export function formatClientError(error: BrowserFileError | Error): string {
  return t(error.message);
}
