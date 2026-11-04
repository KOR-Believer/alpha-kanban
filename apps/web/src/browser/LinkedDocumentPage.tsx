import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { inferMarkdownFileType, inferSequenceNumber, inferSlug, parseMarkdownOutline } from "@alpha-kanban/shared/documents";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { browserLinkMappings } from "./repository";
import { downloadLinkedResource } from "./MarkdownResources";
import { MarkdownDocumentReader } from "../components/MarkdownDocumentReader";
import { linkedRoute, useLinkedNavigation } from "./linkedNavigation";
import { LocalLinkDialog } from "./LocalLinkDialog";
import type { LinkedResource, LinkedDocumentRecord, LinkAttempt, LinkContext } from "./linkMappings";

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
  }, [markdown, id, fragment]);

  const outline = parseMarkdownOutline(markdown ?? "");
  return <section className="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("Linked document")}>
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
      <Button size="sm" variant="ghost" onClick={() => void navigate({ href: sourceHref, resetScroll: false })}><ArrowLeft />{t("Back to source document")}</Button>
      <Badge variant="muted">{t("Read-only")}</Badge>
      {resource ? <Button size="sm" variant="ghost" className="ml-auto" onClick={() => downloadLinkedResource(resource)}><Download />{t("Download file")}</Button> : null}
      {record ? <p className="basis-full break-all text-xs text-muted-foreground">{record.context.label} / {record.context.path}</p> : null}
    </header>
    <div className="ak-scroll-area min-h-0 min-w-0 flex-1 overflow-auto p-5">
        {error ? <div className="grid justify-items-start gap-3"><p role="alert" className="break-words text-sm text-destructive">{t(error)}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setRetry((value) => value + 1)}><RefreshCw />{t("Retry")}</Button>
            {record && !unreadable ? <Button size="sm" disabled={busy} onClick={() => {
              setBusy(true); void browserLinkMappings.reconnectDocument(record).then(setConnecting).catch((failure) => setError(browserLinkMappings.error(failure).message)).finally(() => setBusy(false));
            }}>{t("Reconnect linked document")}</Button> : null}</div>
        </div> : markdown === undefined || !resource ? <p role="status" className="text-sm text-muted-foreground">{t("Loading linked document…")}</p> :
          <div data-linked-document={id} className="h-full min-h-0"><MarkdownDocumentReader document={{ markdown, outline }}
            file={{ id: resource.context.documentId, workspaceId: resource.context.scopeId, filename: resource.file.name, type: inferMarkdownFileType(resource.path),
              slug: inferSlug(resource.path), sequenceNumber: inferSequenceNumber(resource.path), workspaceRelativePath: resource.path, relativePath: resource.path }}
            linkContext={resource.context} headingPrefix={"linked-" + id} bodyRef={body} titleRef={title} /></div>}
    </div>
    {connecting ? <LocalLinkDialog {...connecting} onClose={() => setConnecting(undefined)} onOpen={(opened) => { setConnecting(undefined); void navigate({ href: linkedRoute(href, opened.context.documentId, fragment), resetScroll: false }); setRetry((value) => value + 1); }} /> : null}
  </section>;
}
