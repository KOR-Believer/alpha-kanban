import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, ExternalLink, FolderOpen } from "lucide-react";
import { formatRevisionLink, revisionLines, revisionWebUrl, type RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { NavigationLink } from "../components/NavigationLink";
import { Button, buttonVariants } from "../components/ui/button";
import { useTranslation } from "../i18n";
import { useLinkedNavigation } from "./linkedNavigation";
import { downloadLinkedResource } from "./MarkdownResources";
import { LazyFilePreview } from "./ProjectFilePage";
import { RevisionRepositoryRequest } from "./RevisionRepositoryRequest";
import { RevisionMarkdown } from "./RevisionMarkdown";
import { revisionContents, type OpenRevisionFile, type RevisionReadResult } from "./revisionRepository";
import { relativeRevisionTarget, revisionRoute, RevisionFileContext } from "./revisionNavigation";
import "../components/files/file-preview.css";
import { RevisionHeader } from "../components/RevisionHeader";

const RevisionComparison = lazy(() => import("./RevisionComparison"));

export function GitRevisionPage() {
  const { t } = useTranslation(), { revision, href, sourceHref } = useLinkedNavigation(), navigate = useNavigate();
  const target = revision?.target;
  if (!target) return <section className="p-5">
    <NavigationLink href={sourceHref} className={buttonVariants({ size: "sm", variant: "ghost" })} onNavigate={() => void navigate({ href: sourceHref, resetScroll: false })}>
      <ArrowLeft />{t(sourceHref === "/" ? "Workspaces" : "Back to source document")}</NavigationLink>
    <p role="alert">{t("This Git revision link is invalid.")}</p></section>;
  const scope = new URL(href, "https://local.invalid").pathname;
  const identity = scope + ":" + formatRevisionLink({ ...target, anchor: undefined }) + ":" + revision.current + ":" + revision.web;
  return <RevisionPage key={identity} target={target} scope={scope} current={revision.current} web={revision.web} compare={Boolean(revision.compare)} />;
}

type PageProps = { target: RevisionTarget; scope: string; current: boolean; web: boolean };

function RevisionPage({ target, scope, current, web, compare }: PageProps & { compare: boolean }) {
  const { t } = useTranslation(), navigate = useNavigate();
  const { href, sourceHref, preparedRevision, confirmingExit } = useLinkedNavigation();
  const [result, setResult] = useState<RevisionReadResult | undefined>(() => preparedRevision?.(href));
  const [request, setRequest] = useState<"open" | "choose" | undefined>(() => result ? undefined : "open");
  const online = web && revisionWebUrl(target);
  const repo = result?.document?.repo ?? result?.limitedFile?.repo;
  const folder = repo?.handle.name;
  const chooseLabel = folder ? t("Change repository folder") : t("Choose repository folder");
  const go = (destination: string) => () => void navigate({ href: destination, resetScroll: false });
  const cited = revisionRoute(href, target, web), working = revisionRoute(href, target, web, true), diff = revisionRoute(href, target, web, "compare");
  const links = { cited, current: working, compare: diff };
  return <section className="ak-revision-page" aria-label={t("Git revision")}>
    <RevisionHeader view={compare ? "compare" : current ? "current" : "cited"} commit={target.commit} path={target.path} anchor={target.anchor}
      links={links} onSelect={view => void navigate({ href: links[view], resetScroll: false })}>
        <NavigationLink href={sourceHref} className={buttonVariants({ size: "xs", variant: "ghost" })} onNavigate={go(sourceHref)}>
          <ArrowLeft />{t(sourceHref === "/" ? "Workspaces" : "Back to source document")}</NavigationLink>
        <div className="ak-revision-tools">
          {online && <a className={buttonVariants({ size: "xs", variant: "ghost" })} href={online} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink />{t("Web original")}</a>}
          <Button size="xs" variant="ghost" title={chooseLabel} aria-label={chooseLabel} onClick={() => setRequest("choose")}><FolderOpen /><span className="truncate">{folder ?? chooseLabel}</span></Button>
        </div>
    </RevisionHeader>
    {result?.message && <p role="status" className="px-5 pt-3 text-sm">{t(result.message)}</p>}
    {compare && repo ? <Suspense fallback={<p className="p-5" role="status">{t("Reading files to compare…")}</p>}>
      <RevisionComparison repo={repo} target={target} file={result?.document?.file} fileError={result?.limitedFile?.message} onReconnect={() => setRequest("choose")} />
    </Suspense> : result?.document ? <RevisionDocument opened={result.document} target={target} scope={scope} current={current} web={web} /> :
      result?.limitedFile ? <p role="status" className="p-5 text-sm">{t(result.limitedFile.message)}</p> :
      request ? <p role="status" className="p-5 text-sm text-muted-foreground">{t("Reading Git revision…")}</p> :
        !result?.message && <p className="p-5 text-sm text-muted-foreground">{t("Choose the repository that contains this revision.")}</p>}
    {request && !confirmingExit && <RevisionRepositoryRequest target={target} scope={scope} current={current} web={web} choose={request === "choose"}
      onCancel={() => setRequest(undefined)} onFinish={loaded => { setResult(loaded); setRequest(undefined); }} />}
  </section>;
}

function RevisionDocument({ opened, target, scope, current, web }: PageProps & { opened: OpenRevisionFile }) {
  const { t } = useTranslation();
  const read = useCallback((path: string, signal: AbortSignal) =>
    revisionContents(opened.repo, { ...target, path, anchor: undefined }, current, signal), [opened.repo, target, current]);
  const context = useMemo(() => ({ target, current, web, read }), [target, current, web, read]);
  const readResource = useCallback(async (source: string, href: string, signal: AbortSignal) => {
    const child = relativeRevisionTarget({ ...target, path: source }, href);
    if (!child) throw new Error("This link is outside the cited repository.");
    return { path: child.path, file: await read(child.path, signal) };
  }, [read, target]);
  return <RevisionFileContext.Provider value={context}>
    {opened.markdownError ? <div className="p-5"><p role="status">{t(opened.markdownError)}</p>
      <Button variant="outline" size="sm" onClick={() => downloadLinkedResource({ file: opened.file })}><Download />{t("Download file")}</Button></div>
      : opened.markdown !== undefined ? <RevisionMarkdown key={target.anchor ?? ""} markdown={opened.markdown} target={target} scope={scope} current={current} web={web} />
        : <div className="min-h-0 min-w-0 flex-1 overflow-hidden" data-linked-document><Suspense fallback={<p role="status">{t("Loading file…")}</p>}>
          <LazyFilePreview path={target.path} file={opened.file} range={revisionLines(target.anchor)} readResource={readResource} /></Suspense></div>}
  </RevisionFileContext.Provider>;
}
