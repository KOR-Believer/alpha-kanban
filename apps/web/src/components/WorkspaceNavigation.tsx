import { NavigationLink } from "./NavigationLink";
import { buildAppRoute } from "../appRoute";
import type { ReactNode } from "react";
import type { WorkspaceSummary } from "@alpha-kanban/shared";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslation } from "../i18n";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { browserRepository } from "../browser/repository";

export function WorkspaceSwitcherTrigger({ workspace, isLoading, onClick }: {
  workspace?: WorkspaceSummary;
  isLoading?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return <button
    data-tour="project-switcher"
    className="ak-row ak-focus-ring flex h-10 w-full min-w-0 items-center gap-3 px-3 text-left transition-colors hover:bg-[var(--ak-surface-hover)]"
    aria-label={t("Switch project")}
    aria-haspopup="dialog"
    onClick={onClick}
    title={workspace?.root ?? t("Select a project")}
    type="button"
  >
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="truncate text-sm font-semibold text-[var(--ak-ink)]">{workspace?.label ?? t("Select project")}</span>
      <span className="ak-body-muted truncate text-xs">{workspace?.root ?? t("Open recent or browse a workspace")}</span>
    </span>
    <span className="flex shrink-0 items-center gap-2">
      {workspace ? <WorkspaceDocumentCount workspace={workspace} /> : null}
      {isLoading ? <Loader2 className="size-3 animate-spin text-[var(--ak-ink-muted)]" aria-hidden="true" /> : <ChevronDown className="size-3 text-[var(--ak-ink-muted)]" aria-hidden="true" />}
    </span>
  </button>;
}

export function WorkspaceStatusBadge({ count, pending = false, isAvailable = true }: {
  count?: number;
  pending?: boolean;
  isAvailable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return <Badge variant={!isAvailable ? "warning" : count ? "default" : "muted"}
    title={isAvailable && count === undefined ? t(pending ? "Counting documents…" : "Document count is unavailable. Refresh to try again.") : undefined}>
    {!isAvailable ? t("Reconnect needed") : count === undefined ? t(pending ? "Documents …" : "Documents —") : t("Documents {{countLabel}}", { countLabel: new Intl.NumberFormat(i18n.language).format(count) })}
  </Badge>;
}

function WorkspaceDocumentCount({ workspace }: { workspace: WorkspaceSummary }) {
  const query = useQuery({ queryKey: ["document-count", workspace.id], queryFn: () => browserRepository.documentCount(workspace.id),
    enabled: workspace.isAvailable, retry: false, staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  return <WorkspaceStatusBadge count={query.isError ? undefined : query.data} pending={query.isPending} isAvailable={workspace.isAvailable} />;
}

export function WorkspaceButton({ isSelected, onSelect, workspace, disabled }: {
  isSelected: boolean;
  onSelect: () => Promise<void>;
  workspace: WorkspaceSummary;
  disabled?: boolean;
}) {
  return <NavigationLink href={buildAppRoute({ workspaceId: workspace.id })}
    className={[
      "ak-row ak-focus-ring grid min-h-14 min-w-0 gap-1 px-3 py-2 text-left transition-colors",
      isSelected ? "ak-row-active" : "",
      workspace.isAvailable ? "" : "opacity-70",
    ].join(" ")}
    disabled={disabled || !workspace.isAvailable}
    onNavigate={() => void onSelect()}
    title={workspace.root}
  >
    <span className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-sm font-medium text-[var(--ak-ink)]">{workspace.label}</span>
      <WorkspaceDocumentCount workspace={workspace} />
    </span>
    <span className="ak-body-muted break-all text-xs leading-4">{workspace.root}</span>
  </NavigationLink>;
}

export function StartPageHeader({ autoOpen, onAutoOpen, children }: {
  autoOpen: boolean;
  onAutoOpen: (value: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return <header className="ak-start-heading">
    <div className="ak-start-heading-row">
      <div>
        <h1 className="ak-title text-2xl">{t("Projects")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Open a project and pick up where your documents left off.")}</p>
      </div>
      <div className="ak-start-commands">{children}</div>
    </div>
      <label data-tour="auto-open" className="ak-start-auto flex flex-wrap items-center gap-2 text-sm text-[var(--ak-ink-secondary)]">
        <Checkbox checked={autoOpen} onCheckedChange={(checked) => onAutoOpen(checked === true)} />
        <span>{t("Open last project automatically")}</span>
        <span className="text-xs text-[var(--ak-ink-muted)]">{t("Applies on next root URL load.")}</span>
      </label>
  </header>;
}
