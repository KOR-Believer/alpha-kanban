import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { Check, FolderOpen, RefreshCw } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { locale, useTranslation } from "../i18n";
import { REPO_SCAN_LIMITS, type RepoCandidate, type RepoScan } from "./gitDiscovery";
import type { LinkTarget } from "./linkMappings";

export function RepositoryPickerDialog({ title, description, headerAction, footer, children, onClose, lockDismiss, contentRef, onCloseAutoFocus }: {
  title: string; description: string; headerAction?: ReactNode; footer: ReactNode; children: ReactNode;
  onClose: () => void; lockDismiss?: boolean; contentRef?: Ref<HTMLDivElement>;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
  return <Dialog open onOpenChange={open => { if (!open && !lockDismiss) onClose(); }}>
    <DialogContent ref={contentRef} onCloseAutoFocus={onCloseAutoFocus}
      className="flex max-h-[min(760px,calc(100dvh-2rem))] w-[min(680px,calc(100vw-2rem))] flex-col [&>div:first-child]:shrink-0"
      onEscapeKeyDown={event => { if (lockDismiss) event.preventDefault(); }} onPointerDownOutside={event => { if (lockDismiss) event.preventDefault(); }}>
      <DialogHeader className="pr-12"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>{headerAction}</DialogHeader>
      <DialogBody className="flex-auto overscroll-contain"><div className="grid min-w-0 gap-4 text-sm">{children}</div></DialogBody>
      <DialogFooter className="shrink-0 flex-wrap">{footer}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function FolderIdentity({ target }: { target: LinkTarget }) {
  const { t } = useTranslation();
  return <span className="grid min-w-0 gap-1 text-sm">
    <span className="flex flex-wrap items-center gap-2 font-medium"><FolderOpen className="size-4 shrink-0" />{target.handle.name}
      {target.repo?.kind === "worktree" ? <Badge variant="muted">{t("Worktree")}</Badge> : null}</span>
    <span className="break-all text-xs font-normal text-muted-foreground">{target.repo ? target.label : t("Directly selected folder")}</span>
    {target.repo ? <span className="break-all text-xs font-normal text-muted-foreground">{target.repo.remotes.length ? target.repo.remotes.join(" · ") : t("Repository identity unavailable; check the folder location.")}</span> : null}
  </span>;
}

export function useRepositoryFilters() {
  const [search, setSearch] = useState("");
  const [rootFilter, setRootFilter] = useState("all");
  return { search, setSearch, rootFilter, setRootFilter };
}

export function RepositoryFolderPicker({ scan, filters, scanning, busy, discover, selectedId, touch = () => {},
  onRefresh, onStop, onPick, onSelect, candidateLabel, repositoryHint }: {
  scan?: RepoScan;
  filters: ReturnType<typeof useRepositoryFilters>;
  scanning: boolean;
  busy: boolean;
  discover: boolean;
  selectedId?: string;
  touch?: () => void;
  onRefresh: () => void;
  onStop: () => void;
  onPick: () => void;
  onSelect: (repo: RepoCandidate) => void;
  candidateLabel?: (repo: RepoCandidate) => string;
  repositoryHint?: string;
}) {
  const { t } = useTranslation();
  const canPick = typeof window.showDirectoryPicker === "function";
  const { search, setSearch, rootFilter, setRootFilter } = filters;
  const roots = [...new Map(scan?.repos.map((repo) => [repo.rootId, repo.rootName ?? repo.label.split("/")[0]!])).entries()];
  const activeRoot = roots.some(([id]) => id === rootFilter) ? rootFilter : "all";
  const matches = (scan?.repos ?? []).filter(repo =>
    (activeRoot === "all" || repo.rootId === activeRoot) && (repo.label + " " + repo.remotes.join(" ")).toLowerCase().includes(search.toLowerCase()));
  const scanMessages: Record<string, () => string> = {
    depth: () => t("Folders deeper than {{depth}} levels were skipped.", { depth: REPO_SCAN_LIMITS.depth }),
    directories: () => t("Search stopped after checking {{total}} folders.", { total: REPO_SCAN_LIMITS.directories.toLocaleString(locale()) }),
    entries: () => t("Search stopped after listing {{total}} files and folders.", { total: REPO_SCAN_LIMITS.entries.toLocaleString(locale()) }),
    time: () => t("Search stopped after {{seconds}} seconds.", { seconds: REPO_SCAN_LIMITS.milliseconds / 1000 }),
    cancelled: () => t("Search stopped. Folders found so far are listed below."),
  };
  const reasons = scan?.reasons.map(reason => scanMessages[reason]?.()).filter(Boolean) ?? [];
  return <>
    <div data-tour="link-folders" className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{t("Folder on this computer")}</h3>
      <Button variant="outline" size="sm" disabled={busy || !canPick} onClick={onPick}><FolderOpen />{t("Choose folder directly")}</Button>
    </div>
    {discover && <>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Input className="min-w-0 flex-1" aria-label={t("Search discovered repositories")} placeholder={t("Search discovered repositories")}
          value={search} onChange={event => { touch(); setSearch(event.target.value); }} />
        {roots.length > 1 && <Select value={activeRoot} onValueChange={id => { touch(); setRootFilter(id); }}>
          <SelectTrigger size="field" className="max-w-full" aria-label={t("Connected root")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("All connected roots")}</SelectItem>
            {roots.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
        </Select>}
        <Button variant="outline" size="icon" aria-label={t("Refresh repositories")} disabled={busy || scanning}
          onClick={() => { touch(); onRefresh(); }}><RefreshCw /></Button>
      </div>
      {scanning && <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span role="status">{t("Looking for repositories in connected folders…")}</span>
          {Boolean(scan?.visited) && <span>{t("Folders checked: {{total}}", { total: scan!.visited.toLocaleString(locale()) })}</span>}
        </div>
        <Button size="xs" variant="ghost" onClick={() => { touch(); onStop(); }}>{t("Stop search")}</Button>
      </div>}
      {!scanning && scan && !scan.complete && <p className="text-xs text-muted-foreground">{reasons.length ? reasons.join(" ") :
        t("Some folders could not be searched. You can choose a folder directly or search again.")}</p>}
      {repositoryHint && (scan?.repos.length ?? 0) > 1 && <p className="text-sm">
        {t("Multiple folders match this repository. Choose the clone to use for this project.")}</p>}
      <div className="grid gap-1">
        {matches.slice(0, 30).map(repo => <Button key={repo.id} variant={selectedId === repo.id ? "secondary" : "ghost"}
          className="h-auto justify-start whitespace-normal py-3 text-left" aria-pressed={candidateLabel ? undefined : selectedId === repo.id}
          disabled={busy} aria-label={candidateLabel?.(repo)} onClick={() => onSelect(repo)}>
          <span className="min-w-0 flex-1"><FolderIdentity target={{ handle: repo.handle, label: repo.label, repo }} /></span>
          {candidateLabel && <span className="shrink-0 text-xs">{t("Use this folder")}</span>}
          {selectedId === repo.id && <Check className="shrink-0" />}
        </Button>)}
      </div>
      {matches.length > 30 && <p className="text-xs text-muted-foreground">{t("Narrow the search to see more repositories.")}</p>}
      {!scanning && scan && !matches.length && <p className="text-sm text-muted-foreground">{repositoryHint && !scan.repos.length
        ? t("Select a local clone of {{repository}} using Choose folder directly.", { repository: repositoryHint })
        : t("No matching repositories. Choose a folder directly.")}</p>}
    </>}
    {!canPick && <p className="text-sm text-muted-foreground">{t("Use a browser with local folder access to read this file.")}</p>}
  </>;
}
