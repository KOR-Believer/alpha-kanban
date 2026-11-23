import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSmokeDocument, smokeFileKind } from "@alpha-kanban/shared/smokeMarkdown";
import { useNavigate } from "@tanstack/react-router";
import { inferMarkdownFileType, inferSequenceNumber, inferSlug, parseMarkdownOutline } from "@alpha-kanban/shared/documents";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useTranslation } from "../i18n";
import { NavigationLink } from "../components/NavigationLink";
import { Button, buttonVariants } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { browserLinkMappings } from "./repository";
import { downloadLinkedResource } from "./MarkdownResources";
import { MarkdownDocumentReader } from "../components/MarkdownDocumentReader";
import { SmokeSheetReader } from "../components/smoke/SmokeSheetReader";
import { linkedRoute, useLinkedNavigation } from "./linkedNavigation";
import { LocalLinkDialog } from "./LocalLinkDialog";
import type { LinkedResource, LinkedDocumentRecord, LinkAttempt, LinkContext } from "./linkMappings";
import { LazyFilePreview } from "./ProjectFilePage";
import { relativeFilePath } from "./projectFiles";
import { readLinkedFile } from "./linkPaths";

const scrollPositions = new Map<string, number>();

export function LinkedDocumentPage() {
  const { id, fragment, href, sourceHref } = useLinkedNavigation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [record, setRecord] = useState<LinkedDocumentRecord>();
  const [resource, setResource] = useState<LinkedResource>();
  const [markdown, setMarkdown] = useState<string>();
  const [error, setError] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [connecting, setConnecting] = useState<{ context: LinkContext; attempt: LinkAttempt }>();
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(Boolean(fragment));
  const body = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setRecord(undefined); setResource(undefined); setMarkdown(undefined); setError(""); setUnreadable(false); setConnecting(undefined);
    void (async () => {
      const saved = id && await browserLinkMappings.document(id);
      if (!saved) throw new Error("This linked document is not saved in this browser. Open its source link to connect it again.");
      if (!active) return;
      setRecord(saved);
      const opened = await browserLinkMappings.openDocument(saved);
      if (!active) return;
      setResource(opened);
      if (!/\.md$/i.test(opened.path)) return;
      try {
        if (opened.file.size > 10 * 1024 * 1024) throw new Error("too large");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await opened.file.arrayBuffer());
        if (active) setMarkdown(text);
      } catch { if (active) { setUnreadable(true); setError("This file cannot be displayed as Markdown. Download it to open with another app."); } }
    })().catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : browserLinkMappings.error(failure).message); });
    return () => { active = false; };
  }, [id, retry]);

  useEffect(() => {
    if (markdown === undefined || !body.current) return;
    title.current?.focus({ preventScroll: true });
    const element = body.current;
    const key = id + ":" + fragment;
    const anchor = fragment && [...element.querySelectorAll<HTMLElement>("[id]")].find((item) => item.id.endsWith("-" + fragment));
    if (scrollPositions.has(key)) element.scrollTop = scrollPositions.get(key)!;
    else if (anchor) anchor.scrollIntoView({ block: "start" });
    else element.scrollTop = 0;
    const save = () => { scrollPositions.set(key, element.scrollTop); if (scrollPositions.size > 100) scrollPositions.delete(scrollPositions.keys().next().value!); };
    element.addEventListener("scroll", save);
    return () => { save(); element.removeEventListener("scroll", save); };
  }, [markdown, id, fragment, raw]);

  const outline = parseMarkdownOutline(markdown ?? "");
  const readResource = useCallback(async (path: string, href: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!resource) throw new Error("Reconnect the file first.");
    // Revalidate the saved connection before every dependency, including removal.
    if (record) await browserLinkMappings.openDocument(record);
    const next = relativeFilePath(path, href);
    const value = await readLinkedFile(resource.context.root, next); signal.throwIfAborted(); return { file: value.file, path: next };
  }, [resource, record]);
  const generic = resource && !/\.md$/i.test(resource.path);
  const smoke = useMemo(() => {
    const kind = resource && smokeFileKind(resource.path);
    return kind && markdown !== undefined ? parseSmokeDocument(markdown, kind) : undefined;
  }, [resource, markdown]);
  const readerFile = resource ? { id: resource.context.documentId, workspaceId: resource.context.scopeId, filename: resource.file.name, type: inferMarkdownFileType(resource.path),
    slug: inferSlug(resource.path), sequenceNumber: inferSequenceNumber(resource.path), workspaceRelativePath: resource.path, relativePath: resource.path } : undefined;
  return <section className="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("Linked document")}>
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
      <NavigationLink data-tour="linked-source" href={sourceHref} className={buttonVariants({ size: "sm", variant: "ghost" })} onNavigate={() => void navigate({ href: sourceHref, resetScroll: false })}><ArrowLeft />{t("Back to source document")}</NavigationLink>
      <Badge data-tour="linked-readonly" variant="muted">{t("Read-only")}</Badge>
      {smoke ? <div role="group" aria-label={t("Document view")} className="flex gap-1"><Button size="sm" variant={!raw ? "secondary" : "ghost"} aria-pressed={!raw} onClick={() => setRaw(false)}>{t("Sheet")}</Button><Button size="sm" variant={raw ? "secondary" : "ghost"} aria-pressed={raw} onClick={() => setRaw(true)}>{t("Markdown")}</Button></div> : null}
      {resource ? <Button size="sm" variant="ghost" className="ml-auto" onClick={() => downloadLinkedResource(resource)}><Download />{t("Download file")}</Button> : null}
      {record ? <p className="basis-full break-all text-xs text-muted-foreground">{record.context.label} / {record.context.path}</p> : null}
    </header>
    <div className={`ak-scroll-area min-h-0 min-w-0 flex-1 ${generic || (smoke && !raw) ? "overflow-hidden" : "ak-document-reader-viewport"}`}>
        {error ? <div className="grid justify-items-start gap-3"><p role="alert" className="break-words text-sm text-destructive">{t(error)}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setRetry((value) => value + 1)}><RefreshCw />{t("Retry")}</Button>
            {record && !unreadable ? <Button size="sm" disabled={busy} onClick={() => {
              setBusy(true); void browserLinkMappings.reconnectDocument(record).then(setConnecting).catch((failure) => setError(browserLinkMappings.error(failure).message)).finally(() => setBusy(false));
            }}>{t("Reconnect linked document")}</Button> : null}</div>
        </div> : generic ? <Suspense fallback={<p role="status">{t("Loading file…")}</p>}><LazyFilePreview file={resource.file} path={resource.path} readResource={readResource} /></Suspense> : markdown === undefined || !resource ? <p role="status" className="text-sm text-muted-foreground">{t("Loading linked document…")}</p> :
          <div data-linked-document={id} className="h-full min-h-0">{smoke && !raw ? <SmokeSheetReader document={smoke} file={readerFile!} linkContext={resource.context} /> : <MarkdownDocumentReader document={{ markdown, outline }}
            file={readerFile!} linkContext={resource.context} headingPrefix={"linked-" + id} bodyRef={body} titleRef={title} />}</div>}
    </div>
    {connecting ? <LocalLinkDialog {...connecting} onClose={() => setConnecting(undefined)} onOpen={(opened) => { setConnecting(undefined); void navigate({ href: linkedRoute(href, opened.context.documentId, fragment), resetScroll: false }); setRetry((value) => value + 1); }} /> : null}
  </section>;
}
