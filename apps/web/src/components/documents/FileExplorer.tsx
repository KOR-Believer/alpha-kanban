import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Code, File, FileImage, FileText, Folder, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { browserRepository } from "../../browser/repository";
import { previewKind, type FileSearchResult, type ProjectFileEntry } from "../../browser/projectFiles";
import type { DocumentSearchMatch } from "../../documentSearch";
import { useTranslation } from "../../i18n";
import { NavigationLink } from "../NavigationLink";
import { SearchHighlight } from "../tickets/TicketSearch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { ExplorerMode } from "./explorerState";
import "./file-explorer.css";

export function ExplorerModeSwitch({ mode, onChange }: { mode: ExplorerMode; onChange: (mode: ExplorerMode) => void }) {
  const { t } = useTranslation();
  return <div className="ak-explorer-mode" data-tour="explorer-mode" role="group" aria-label={t("Navigation view")}>
    {(["work", "files"] as const).map(value => <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} aria-pressed={mode === value} onClick={() => onChange(value)}>
      {value === "work" ? <FileText aria-hidden="true" /> : <Folder aria-hidden="true" />}{t(value === "work" ? "Work documents" : "File explorer")}
    </Button>)}
  </div>;
}
export function FileExplorerTools({ query, onQuery, controls, moveHandle, onRefresh, disabled }: {
  query: string; onQuery: (value: string) => void; controls: React.ReactNode; moveHandle: React.ReactNode; onRefresh: () => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  return <div className="ak-explorer-tools">
    <div className="ak-document-tools-title">{moveHandle}<span>{t("Files")}</span></div>
    <div className="ak-explorer-search-tools">
      <div className="ak-explorer-search"><Search aria-hidden="true" />
        <Input role="searchbox" data-tour="file-search" aria-label={t("Search project files")} placeholder={t("Search project files")} value={query} disabled={disabled} onChange={e => onQuery(e.target.value)} />
        {query ? <Button variant="ghost" size="iconSm" aria-label={t("Clear search")} onClick={() => onQuery("")}><X /></Button> : null}
      </div>
      <Button size="iconSm" variant="ghost" disabled={disabled} onClick={onRefresh} title={t("Refresh files")} aria-label={t("Refresh files")}><RefreshCw /></Button>
    </div>
    <div className="ak-document-tools-layout">{controls}</div>
  </div>;
}
const emptySearch: FileSearchResult = { entries: [], visited: 0, directories: 0, errors: [], limited: false, complete: false };
export function FileExplorer({ projectId, enabled, expanded, onExpanded, query, revision, selectedId, href, onSelect, documents, matches, bodyBusy, bodyMissing, cancelBody, retryBody }: {
  projectId: string; enabled: boolean; expanded: string[]; onExpanded: (paths: string[]) => void; query: string; revision: number;
  selectedId?: string; href: (entry: ProjectFileEntry) => string; onSelect: (entry: ProjectFileEntry) => void;
  documents: MarkdownFileSummary[]; matches: Map<string, DocumentSearchMatch>; bodyBusy: boolean; bodyMissing: number; cancelBody: () => void; retryBody: () => void;
}) {
  const { t } = useTranslation();
  const [directories, setDirectories] = useState<Record<string, { entries?: ProjectFileEntry[]; error?: string }>>({});
  const [result, setResult] = useState<FileSearchResult>(emptySearch);
  const [busy, setBusy] = useState(false), [cancelled, setCancelled] = useState(false);
  const [revealed, setRevealed] = useState(false), [focused, setFocused] = useState("");
  const search = useRef<AbortController | null>(null), generation = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const revealPath = useRef<string | undefined>(undefined);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [retry, setRetry] = useState(0);
  const expandedKey = expanded.join("\n");
  useEffect(() => { setDirectories({}); }, [projectId, revision, retry]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(), current = ++generation.current;
    void (async () => {
      for (const path of ["", ...expanded.filter(Boolean)].sort((a, b) => a.split("/").length - b.split("/").length)) {
        if (controller.signal.aborted) return;
        try {
          const entries = await browserRepository.projectFiles.list(projectId, path, controller.signal);
          if (!controller.signal.aborted && current === generation.current) setDirectories(previous => ({ ...previous, [path]: { entries } }));
        } catch (error) {
          if (!controller.signal.aborted) setDirectories(previous => ({ ...previous, [path]: { error: error instanceof Error ? error.message : "Could not read this folder." } }));
        }
      }
    })();
    return () => controller.abort();
  }, [projectId, enabled, expandedKey, revision, retry]);
  useEffect(() => {
    setRevealed(false); setCancelled(false); setResult(emptySearch);
    if (!enabled || !query.trim()) { setBusy(false); return; }
    const controller = new AbortController(); search.current = controller; setBusy(true);
    const timer = setTimeout(() => {
      void browserRepository.projectFiles.search(projectId, query, controller.signal, value => { if (!controller.signal.aborted) setResult(value); })
        .then(value => { if (!controller.signal.aborted) setResult(value); })
        .catch(error => { if (!controller.signal.aborted) setResult({ ...emptySearch, errors: [error instanceof Error ? error.message : "Could not read this folder."] }); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, enabled, query, revision, retry]);
  const searching = !!query.trim() && !revealed;
  const rows = useMemo(() => {
    if (searching) {
      const merged = new Map(result.entries.map(entry => [entry.id, entry]));
      for (const file of documents) if (matches.has(file.id) && !merged.has(file.id)) merged.set(file.id, { id: file.id, name: file.filename, path: file.workspaceRelativePath, kind: "file", preview: "markdown" });
      return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path)).map(entry => ({ ...entry, depth: 0 }));
    }
    const rows: (ProjectFileEntry & { depth: number })[] = [];
    const walk = (path: string, depth: number) => {
      for (const entry of directories[path]?.entries ?? []) {
        rows.push({ ...entry, depth });
        if (entry.kind === "directory" && expanded.includes(entry.path)) walk(entry.path, depth + 1);
      }
    };
    walk("", 0); return rows;
  }, [searching, result.entries, documents, matches, directories, expandedKey]);
  const toggle = useCallback((path: string) => onExpanded(expanded.includes(path) ? expanded.filter(value => value !== path) : [...expanded, path]), [expandedKey, onExpanded]);
  useLayoutEffect(() => {
    const scroll = list.current?.closest(".ak-document-panel-scroll");
    if (list.current && scroll) setScrollMargin(list.current.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
  });
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => list.current?.closest(".ak-document-panel-scroll") as HTMLElement | null,
    estimateSize: () => searching ? 56 : 32, overscan: 8, getItemKey: index => rows[index]!.path,
    scrollMargin });
  useEffect(() => {
    if (!revealed || !revealPath.current) return;
    const index = rows.findIndex(row => row.path === revealPath.current);
    if (index < 0) return;
    revealPath.current = undefined; focusRow(index);
  }, [revealed, rows]);
  const tabStop = rows.some(row => row.path === focused) ? focused : rows[0]?.path;
  function focusRow(index: number) {
    const row = rows[Math.max(0, Math.min(index, rows.length - 1))]; if (!row) return;
    setFocused(row.path); virtual.scrollToIndex(Math.max(0, index), { align: "auto" });
    requestAnimationFrame(() => { [...list.current?.querySelectorAll<HTMLElement>("[data-file-path]") ?? []].find(element => element.dataset.filePath === row.path)?.focus(); });
  }
  function keyboard(event: KeyboardEvent, index: number) {
    const entry = rows[index]; if (!entry || event.altKey || event.metaKey || event.ctrlKey) return;
    const actions: Record<string, () => void> = {
      ArrowDown: () => focusRow(index + 1), ArrowUp: () => focusRow(index - 1), Home: () => focusRow(0), End: () => focusRow(rows.length - 1),
      ArrowRight: () => { if (entry.kind === "directory" && !expanded.includes(entry.path)) toggle(entry.path); else if (entry.kind === "directory") focusRow(index + 1); },
      ArrowLeft: () => { if (entry.kind === "directory" && expanded.includes(entry.path)) toggle(entry.path); else { const parent = rows.findIndex(row => row.path === entry.path.split("/").slice(0, -1).join("/")); if (parent >= 0) focusRow(parent); } },
      " ": () => entry.kind === "directory" ? toggle(entry.path) : onSelect(entry),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key]!(); }
  }
  function reveal(entry: ProjectFileEntry) {
    const parts = entry.path.split("/").slice(0, -1);
    onExpanded([...new Set([...expanded, ...parts.map((_, index) => parts.slice(0, index + 1).join("/"))])]);
    revealPath.current = entry.path;
    setRevealed(true); setFocused(entry.path);
  }
  return <div className="ak-file-explorer" data-tour="file-tree">
    <div className="ak-explorer-scope">{t(searching ? "Project files · names, paths and Markdown contents" : "Connected project")}
      {revealed ? <Button size="xs" variant="link" onClick={() => setRevealed(false)}>{t("Back to search results")}</Button> : null}
    </div>
    {searching && (busy || bodyBusy) ? <div className="ak-explorer-state" role="status"><Loader2 className="size-3 animate-spin" />{t("Searching files · {{count}} folders", { count: result.directories })}
      <Button size="xs" variant="ghost" onClick={() => { search.current?.abort(); cancelBody(); setBusy(false); setCancelled(true); }}>{t("Cancel")}</Button></div> : null}
    {searching && (cancelled || result.errors.length > 0 || result.limited || bodyMissing > 0) ? <div className="ak-explorer-state" role="status">{t(cancelled ? "Search stopped. Results are incomplete." : bodyMissing ? "{{count}} documents could not be searched. Results are incomplete." : "Some folders could not be searched. Results are incomplete.", { count: bodyMissing })}
      <Button size="xs" variant="link" onClick={() => { retryBody(); setRetry(value => value + 1); }}>{t("Retry")}</Button></div> : null}
    {!searching && Object.entries(directories).filter(([, value]) => value.error).map(([path, value]) => <div className="ak-explorer-state" role="alert" key={path}><span>{path || "/"}: {t(value.error!)}</span><Button size="xs" variant="link" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</Button></div>)}
    {!searching && !directories[""] ? <p className="ak-explorer-state" role="status">{t("Loading files…")}</p> : null}
    {rows.length === 0 && !busy && !bodyBusy && (searching ? result.complete : directories[""]?.entries) ? <p className="ak-explorer-state">{t(searching ? "No matching files" : "This folder is empty")}</p> : null}
    <div ref={list} role={searching ? "list" : "tree"} aria-label={t("Project files")} className="ak-file-tree" aria-busy={busy} style={{ height: virtual.getTotalSize(), position: "relative" }}>
      {virtual.getVirtualItems().map(item => {
        const entry = rows[item.index]!, folder = entry.kind === "directory", open = expanded.includes(entry.path);
        const Icon = folder ? Folder : entry.preview === "image" ? FileImage : ["text", "html"].includes(entry.preview ?? "") ? Code : entry.preview === "markdown" ? FileText : File;
        const rowProps = { "data-file-path": entry.path, role: searching ? "listitem" : "treeitem", "aria-level": searching ? undefined : entry.depth + 1,
          "aria-expanded": folder ? open : undefined, "aria-selected": entry.id ? entry.id === selectedId : undefined,
          tabIndex: tabStop === entry.path ? 0 : -1, title: entry.path,
          onFocus: () => setFocused(entry.path), onKeyDown: (event: KeyboardEvent<HTMLElement>) => keyboard(event, item.index),
          className: "ak-file-tree-row" + (entry.id === selectedId ? " ak-row-active" : ""),
          style: { paddingLeft: 12 + entry.depth * 16, transform: `translateY(${item.start - virtual.options.scrollMargin}px)`, height: item.size } };
        const label = <>{folder ? open && !directories[entry.path] ? <Loader2 className="ak-tree-chevron animate-spin" /> : open ? <ChevronDown className="ak-tree-chevron" /> : <ChevronRight className="ak-tree-chevron" /> : <span className="ak-tree-chevron" />}<Icon aria-hidden="true" />
          <span className="ak-file-tree-label"><SearchHighlight text={entry.name} query={query} />{searching ? <small>{entry.path}</small> : null}</span></>;
        return folder ? <button key={entry.path} {...rowProps} onClick={() => toggle(entry.path)}>{label}</button> :
          <div key={entry.path} className="ak-file-tree-item" style={{ transform: rowProps.style.transform, height: item.size }}>
            <NavigationLink {...rowProps} style={{ paddingLeft: rowProps.style.paddingLeft, height: item.size }} href={href(entry)} onNavigate={() => onSelect(entry)}>{label}</NavigationLink>
            {searching ? <Button size="iconSm" variant="ghost" aria-label={t("Show in file tree")} title={t("Show in file tree")} onClick={() => reveal(entry)}><Folder /></Button> : null}
          </div>;
      })}
    </div>
  </div>;
}
