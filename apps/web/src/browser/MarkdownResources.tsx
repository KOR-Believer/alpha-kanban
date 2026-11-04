import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { ExternalLink, Image } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { buildAppRoute } from "../appRoute";
import { browserRepository, browserLinkMappings } from "./repository";
import { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import { LocalLinkDialog } from "./LocalLinkDialog";
import { normalizeLink, readLinkedFile } from "./linkPaths";
import type { LinkAttempt, LinkContext, LinkedResource } from "./linkMappings";
import { linkedRoute, useLinkedNavigation } from "./linkedNavigation";

const rasterMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
type FileReference = Pick<MarkdownFileSummary, "id" | "workspaceId">;
export function isExternalImage(source: string): boolean { return /^https:\/\//i.test(source); }
export function isLocalResource(source: string): boolean {
  return Boolean(source) && !/^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(source);
}

// Only anchors handled by BrowserMarkdownLink may retain local file schemes.
// Images keep react-markdown's default policy and their separate consent flow.
export const localLinkUrlTransform: UrlTransform = (url, key, node) => key === "href" && node.tagName === "a" && /^(?:file:|[a-z]:[\\/])/i.test(url) ? url : defaultUrlTransform(url);

export function useBrowserMarkdownComponents(file?: FileReference, context?: LinkContext): Components {
  const fileId = file?.id; const workspaceId = file?.workspaceId;
  // Stable component types keep an open connection draft/reader alive when a parent
  // rerenders for language, theme or unchanged background document metadata.
  return useMemo(() => {
    const reference = fileId && workspaceId ? { id: fileId, workspaceId } : undefined;
    return {
      a: ({ href, children }) => <BrowserMarkdownLink href={href} file={reference} context={context}>{children}</BrowserMarkdownLink>,
      img: ({ src, alt }) => <BrowserMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} file={reference} context={context} />,
    };
  }, [fileId, workspaceId, context]);
}

export function downloadLinkedResource(resource: { file: File }) {
  const url = URL.createObjectURL(resource.file);
  const link = document.createElement("a"); link.href = url; link.download = resource.file.name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function BrowserMarkdownImage({ src, alt, file, context }: { src?: string; alt?: string; file?: FileReference; context?: LinkContext }) {
  const { t } = useTranslation();
  const [allowedSource, setAllowedSource] = useState<string>();
  const [localUrl, setLocalUrl] = useState<string>();
  const [error, setError] = useState("");
  const external = isExternalImage(src ?? "");
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setLocalUrl(undefined); setAllowedSource(undefined); setError("");
    if (!external && src && (file || context) && isLocalResource(src)) {
      const resource = context ? Promise.resolve().then(() => {
        const path = normalizeLink(src, context.path);
        if (path.absolute || path.path.startsWith("./../")) throw new Error("Outside image folder");
        return readLinkedFile(context.root, path.path.slice(2));
      }) : browserRepository.localResource(file!.workspaceId, file!.id, src);
      void resource.then((resource) => {
        if (!rasterMimeTypes.has(resource.file.type) || resource.file.size > 10 * 1024 * 1024) throw new Error("This local image format is not supported.");
        if (!active) return;
        url = URL.createObjectURL(resource.file); setLocalUrl(url);
      }).catch(() => { if (active) setError("The local image is unavailable. Check the folder connection."); });
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [src, file?.id, file?.workspaceId, context, external]);
  if (localUrl || (external && allowedSource === src)) return <img src={localUrl ?? src} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" />;
  return <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <Image aria-hidden="true" className="size-4" /><span>{alt}</span>
    {external ? <Button variant="outline" size="xs" onClick={() => setAllowedSource(src)}>{t("Load external image")}</Button> : <span>{t(error || "Local image")}</span>}
  </span>;
}

export function BrowserMarkdownLink({ href = "", children, file, context }: { href?: string; children?: ReactNode; file?: FileReference; context?: LinkContext }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navigation = useLinkedNavigation();
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<{ context: LinkContext; attempt: LinkAttempt }>();
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const open = (resource: LinkedResource) => {
    setConnecting(undefined);
    if (/\.md$/i.test(resource.file.name)) void navigate({ href: linkedRoute(navigation.href, resource.context.documentId, resource.fragment, file?.id), resetScroll: false });
    else downloadLinkedResource(resource);
  };
  if (/^(https?:|mailto:)/i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}<ExternalLink className="ml-1 inline size-3" aria-hidden="true" /></a>;
  return <span><a href={href.startsWith("#") ? href : "#"} onClick={(event) => {
    event.preventDefault(); setError("");
    if (href.startsWith("#")) {
      let slug: string; try { slug = decodeURIComponent(href.slice(1)); } catch { setError("This local link has an unsupported or invalid path."); return; }
      const scope = event.currentTarget.closest("[data-linked-document]") ?? document;
      const target = [...scope.querySelectorAll<HTMLElement>("[id]")].find((element) => element.id === slug || element.id.endsWith("-" + slug));
      target?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if ((!file && !context) || pending.current) return;
    if (!navigation.id) navigation.rememberSource(event.currentTarget);
    pending.current = true;
    void (async () => {
      if (file && isLocalResource(href)) {
        try {
          const resource = await browserRepository.localResource(file.workspaceId, file.id, href);
          if (!active.current) return;
          if (resource.documentId) await navigate({ href: buildAppRoute({ workspaceId: file.workspaceId, filePath: resource.documentId, ticketViewMode: "markdown" }) });
          else downloadLinkedResource(resource);
          return;
        } catch { /* Missing and out-of-project links can be connected explicitly. */ }
      }
      const source = context ?? await browserRepository.linkContext(file!.workspaceId, file!.id);
      const attempt = await browserLinkMappings.attempt(source, href, Boolean(context));
      if (!active.current) return;
      if (attempt.resource) open(attempt.resource);
      else setConnecting({ context: source, attempt });
    })().catch((failure) => { if (active.current) setError(browserLinkMappings.error(failure).message); }).finally(() => { pending.current = false; });
  }}>{children}</a>{error ? <span role="alert" className="ml-2 text-xs text-destructive">{t(error)}</span> : null}
    {connecting ? <LocalLinkDialog {...connecting} onClose={() => setConnecting(undefined)} onOpen={open} /> : null}
  </span>;
}
