import { useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { WorkspaceSummary } from "@alpha-kanban/shared";
import { FolderKanban, LayoutGrid, Search } from "lucide-react";
import { useTranslation } from "../i18n";
import { LanguageSelector } from "./LanguageSelector";
import { PwaMenu } from "../pwa/PwaMenu";
import { WorkspaceButton } from "./WorkspaceNavigation";
import { Button, buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function StartPageNavigation({ help }: { help?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="ak-start-navigation">
    <Link to="/" className="ak-public-brand ak-focus-ring"><FolderKanban aria-hidden="true" />{t("Alpha Kanban")}</Link>
    <nav aria-label={t("Start navigation")}>
      <LanguageSelector />
      <PwaMenu />
      {help}
      <Link to="/all" className={buttonVariants({ size: "sm", variant: "ghost" })}><LayoutGrid aria-hidden="true" />{t("All tickets")}</Link>
    </nav>
  </div>;
}

export function partitionProjects(workspaces: WorkspaceSummary[]) {
  const unique = [...new Map(workspaces.map((workspace) => [workspace.id, workspace])).values()];
  const recent = unique.filter((workspace) => workspace.lastOpenedAt)
    .sort((left, right) => right.lastOpenedAt!.localeCompare(left.lastOpenedAt!)).slice(0, 5);
  const ids = new Set(recent.map((workspace) => workspace.id));
  return { recent, other: unique.filter((workspace) => !ids.has(workspace.id)) };
}

export function ProjectLists({ workspaces, onSelect, reconnect, isLoading = false }: {
  workspaces: WorkspaceSummary[];
  onSelect: (id: string) => Promise<void>;
  reconnect?: (workspace: WorkspaceSummary) => ReactNode;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [tab, setTab] = useState("recent");
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const groups = useMemo(() => partitionProjects(workspaces), [workspaces]);
  async function select(id: string) {
    setError(""); setSelecting(true);
    try { await onSelect(id); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSelecting(false); }
  }
  return <div>
    <div className="ak-project-list-tabs" role="tablist" aria-label={t("Projects")}>
      {(["recent", "other"] as const).map((key) => <Button key={key} variant="ghost" role="tab" aria-controls={`${id}-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); setTab(key === "recent" ? "other" : "recent");
          const next = key === "recent" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
          (next as HTMLElement)?.focus();
        }
      }}>{t(key === "recent" ? "Recent projects" : "Other projects")}<Badge variant="muted">{groups[key].length}</Badge></Button>)}
    </div>
    {error ? <p role="alert" className="py-2 text-sm text-destructive">{t(error)}</p> : null}
    <div className="ak-project-lists">
      {(["recent", "other"] as const).map((key) => <ProjectListPanel key={key} id={`${id}-${key}`} kind={key} workspaces={groups[key]} onSelect={select} reconnect={reconnect} selecting={selecting} isLoading={isLoading} mobileActive={tab === key} />)}
    </div>
  </div>;
}

function ProjectListPanel({ id, kind, workspaces, onSelect, reconnect, selecting, isLoading, mobileActive }: {
  id: string; kind: "recent" | "other"; workspaces: WorkspaceSummary[]; onSelect: (id: string) => Promise<void>;
  reconnect?: (workspace: WorkspaceSummary) => ReactNode; selecting: boolean; isLoading: boolean; mobileActive: boolean;
}) {
  const { t, i18n } = useTranslation();
  const heading = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const title = kind === "recent" ? "Recent projects" : "Other projects";
  const normalized = query.trim().toLocaleLowerCase(i18n.language);
  const visible = workspaces.filter((workspace) => `${workspace.label} ${workspace.root}`.toLocaleLowerCase(i18n.language).includes(normalized));
  if (sort === "name") visible.sort((left, right) => left.label.localeCompare(right.label, i18n.language));
  return <section id={id} className="ak-project-list-panel" data-mobile-active={mobileActive} aria-label={t(title)}>
    <div className="ak-start-section-heading"><h2 id={heading}>{t(title)} <Badge variant="muted">{visible.length}</Badge></h2><span>{t(kind === "recent" ? "Last opened" : "Connected projects")}</span></div>
    <div data-tour="project-list-tools" className="ak-project-list-tools">
      <div className="ak-project-search"><Search aria-hidden="true" /><Input className="pl-8" type="search" aria-label={t("Search {{list}}", { list: t(title) })} placeholder={t("Search name or path")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <Select value={sort} onValueChange={setSort}><SelectTrigger size="field" aria-label={t("Sort {{list}}", { list: t(title) })}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">{t("Default order")}</SelectItem><SelectItem value="name">{t("Name order")}</SelectItem></SelectContent></Select>
    </div>
    <div className="ak-project-list-scroll ak-scroll-area" role="region" aria-labelledby={heading} tabIndex={0} aria-busy={isLoading}>
      {visible.map((workspace) => <div className="ak-project-list-row" key={workspace.id}>
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <WorkspaceButton workspace={workspace} isSelected={false} disabled={selecting} onSelect={() => onSelect(workspace.id)} />
        {!workspace.isAvailable ? reconnect?.(workspace) : null}
      </div>)}
      {!visible.length ? <div className="ak-project-list-empty"><Search className="size-5" aria-hidden="true" /><p>{t(isLoading ? "Loading projects" : query ? "No matching projects" : kind === "recent" ? "No recent projects yet." : "No connected projects")}</p><span>{t(query ? "Try another name or path." : kind === "recent" ? "Projects you open will appear here." : "Open a project or register a workspace.")}</span></div> : null}
    </div>
  </section>;
}
