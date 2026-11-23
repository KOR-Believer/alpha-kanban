import type { ReactNode } from "react";
import { Columns2, FileText, GitCommitHorizontal, History } from "lucide-react";
import { useTranslation } from "../i18n";
import { NavigationLink } from "./NavigationLink";
import { Button, buttonVariants } from "./ui/button";
import "../browser/revision-view.css";

export type RevisionView = "cited" | "current" | "compare";

const views = [
  { id: "cited", title: "Cited revision", action: "View cited revision", icon: History, variant: "outline" },
  { id: "current", title: "Current working file", action: "View current file", icon: FileText, variant: "ghost" },
  { id: "compare", title: "Comparing with current file", action: "Compare with current", icon: Columns2, variant: "outline" },
] as const;

export function RevisionHeader({ view, commit, path, anchor, links, onSelect, children }: {
  view: RevisionView; commit: string; path: string; anchor?: string; links?: Record<RevisionView, string>;
  onSelect: (view: RevisionView) => void; children: ReactNode;
}) {
  const { t } = useTranslation();
  const active = views.find(item => item.id === view)!;
  return <header className="ak-revision-header" data-mode={view}>
    <div className="ak-revision-context">{children}</div>
    <div className="ak-revision-identity">
      <span className="ak-revision-icon"><active.icon aria-hidden="true" /></span>
      <div className="ak-revision-title"><div><strong>{t(active.title)}</strong>
        {view !== "current" && <code title={commit}><GitCommitHorizontal aria-hidden="true" />{commit.slice(0, 8)}</code>}</div>
        <span title={path}>{path}{anchor && "#" + anchor}</span></div>
      <div className="ak-revision-views" role="group" aria-label={t("Revision view")}>
        {views.filter(item => item.id !== view).map(({ id, icon: Icon, action, variant }) => {
          const label = <>{id !== "current" && <Icon />}{t(action)}</>;
          return links
            ? <NavigationLink key={id} className={buttonVariants({ size: "sm", variant })} href={links[id]} onNavigate={() => onSelect(id)}>{label}</NavigationLink>
            : <Button key={id} size="sm" variant={variant} onClick={() => onSelect(id)}>{label}</Button>;
        })}
      </div>
    </div>
  </header>;
}
