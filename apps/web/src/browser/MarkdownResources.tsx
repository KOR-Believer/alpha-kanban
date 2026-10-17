import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { ExternalLink, Image } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { buildAppRoute } from "../appRoute";
import { browserRepository } from "./repository";

const rasterMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
export function isExternalImage(source: string): boolean { return /^https:\/\//i.test(source); }
export function isLocalResource(source: string): boolean {
  return Boolean(source) && !/^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(source);
}

export function BrowserMarkdownImage({ src, alt, file }: { src?: string; alt?: string; file?: MarkdownFileSummary }) {
  const { t } = useTranslation();
  const [allowedSource, setAllowedSource] = useState<string>();
  const [localUrl, setLocalUrl] = useState<string>();
  const [error, setError] = useState("");
  const external = isExternalImage(src ?? "");
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setLocalUrl(undefined); setAllowedSource(undefined); setError("");
    if (!external && src && file && isLocalResource(src)) {
      void browserRepository.localResource(file.workspaceId, file.id, src).then((resource) => {
        if (!rasterMimeTypes.has(resource.file.type) || resource.file.size > 10 * 1024 * 1024) throw new Error("This local image format is not supported.");
        if (!active) return;
        url = URL.createObjectURL(resource.file); setLocalUrl(url);
      }).catch(() => { if (active) setError("The local image is unavailable. Check the folder connection."); });
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [src, file?.id, file?.workspaceId, external]);
  if (localUrl || (external && allowedSource === src)) return <img src={localUrl ?? src} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" />;
  return <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <Image aria-hidden="true" className="size-4" /><span>{alt}</span>
    {external ? <Button variant="outline" size="xs" onClick={() => setAllowedSource(src)}>{t("Load external image")}</Button> : <span>{t(error || "Local image")}</span>}
  </span>;
}

export function BrowserMarkdownLink({ href = "", children, file }: { href?: string; children?: ReactNode; file?: MarkdownFileSummary }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  if (/^(https?:|mailto:)/i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}<ExternalLink className="ml-1 inline size-3" aria-hidden="true" /></a>;
  return <span><a href={href.startsWith("#") ? href : "#"} onClick={(event) => {
    event.preventDefault(); setError("");
    if (href.startsWith("#")) {
      const slug = decodeURIComponent(href.slice(1));
      const target = document.getElementById(slug) ?? [...document.querySelectorAll<HTMLElement>("[id^='md-heading-']")].find((element) => element.id.endsWith("-" + slug));
      target?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!file || !isLocalResource(href)) { setError("This link is outside the connected project."); return; }
    void browserRepository.localResource(file.workspaceId, file.id, href).then(async (resource) => {
      if (resource.documentId) {
        await navigate({ href: buildAppRoute({ workspaceId: file.workspaceId, filePath: resource.documentId, ticketViewMode: "markdown" }) });
      } else {
        const url = URL.createObjectURL(resource.file);
        const link = document.createElement("a"); link.href = url; link.download = resource.file.name; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    }).catch(() => setError("This link is outside the connected project."));
  }}>{children}</a>{error ? <span role="alert" className="ml-2 text-xs text-destructive">{t(error)}</span> : null}</span>;
}
