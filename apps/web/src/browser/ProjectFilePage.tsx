import { lazy, Suspense, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { browserRepository } from "./repository";
import { useLinkedNavigation } from "./linkedNavigation";
import { useTranslation } from "../i18n";
import { NavigationLink } from "../components/NavigationLink";
import { Button, buttonVariants } from "../components/ui/button";
import { BrowserReconnect } from "./BrowserConnections";

export const LazyFilePreview = lazy(() => import("../components/files/FilePreview"));
export function ProjectFilePage({ projectId, id, onLoaded }: { projectId: string; id: string; onLoaded?: (value: { id: string; path: string }) => void }) {
  const { t } = useTranslation(), navigate = useNavigate(), navigation = useLinkedNavigation();
  const query = useQuery({ queryKey: ["project-file-preview", projectId, id], queryFn: () => browserRepository.projectFiles.open(projectId, id), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, retry: false });
  const missing = query.error?.name === "NotFoundError";
  useEffect(() => { if (query.data) onLoaded?.({ id, path: query.data.path }); }, [id, query.data?.path, onLoaded]);
  const readResource = useCallback(async (path: string, href: string, signal: AbortSignal) => {
    signal.throwIfAborted(); const value = await browserRepository.projectFiles.resource(projectId, path, href); signal.throwIfAborted(); return value;
  }, [projectId]);
  return <section className="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("File preview")}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
      <NavigationLink href={navigation.sourceHref} data-tour="linked-source" className={buttonVariants({ size: "sm", variant: "ghost" })} onNavigate={() => void navigate({ href: navigation.sourceHref, resetScroll: false })}><ArrowLeft />{t("Back to source document")}</NavigationLink>
      <span className="truncate text-xs text-muted-foreground" title={query.data?.path}>{query.data?.path}</span>
      <Button size="iconSm" variant="ghost" title={t("Reload file")} aria-label={t("Reload file")} onClick={() => void query.refetch()}><RefreshCw /></Button>
    </header>
    {query.error ? <div className="grid gap-3 p-4"><p role="alert">{t(missing ? "This file moved or was removed. Select it again in the file explorer." : query.error.message)}</p>{!missing && <BrowserReconnect workspaceId={projectId} mode="read" />}</div> : query.data ?
      <Suspense fallback={<p className="p-4" role="status">{t("Loading file…")}</p>}><LazyFilePreview key={id} file={query.data.file} path={query.data.path} readResource={readResource} /></Suspense>
      : <p className="p-4" role="status">{t("Loading file…")}</p>}
  </section>;
}
