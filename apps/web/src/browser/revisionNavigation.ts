import { createContext } from "react";
import { formatRevisionLink, parseRevisionLink, type RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { normalizeLink } from "./linkPaths";

export type RevisionRoute = { target?: RevisionTarget; web: boolean; current: boolean; compare?: true };
const base = "https://local.invalid";

export function parseRevisionRoute(href: string): RevisionRoute | undefined {
  const hash = new URL(href, base).hash;
  if (!hash.startsWith("#revision=")) return;
  const fields = new URLSearchParams(hash.slice(1));
  const value = fields.get("revision") ?? "";
  return { target: /^web\+akgit:/i.test(value) ? parseRevisionLink(value) : undefined,
    web: fields.get("web") === "1", current: fields.get("current") === "1",
    ...(fields.get("current") !== "1" && fields.get("view") === "compare" ? { compare: true as const } : {}) };
}

export function revisionRoute(href: string, target: RevisionTarget, web: boolean, view: boolean | "compare" = false) {
  const url = new URL(revisionSource(href), base);
  const params = new URLSearchParams({ revision: formatRevisionLink(target) });
  if (web) params.set("web", "1");
  if (view === true) params.set("current", "1");
  if (view === "compare") params.set("view", "compare");
  // Ticket details use the source hash. Keep their state while the preview
  // suspends the dialog, including the exact hash to restore on return.
  if (url.hash) {
    params.set("source", url.hash.slice(1));
    const source = new URLSearchParams(url.hash.slice(1));
    for (const key of ["ticket", "detail"]) if (source.has(key)) params.set(key, source.get(key)!);
  }
  return url.pathname + url.search + "#" + params;
}

export function revisionSource(href: string) {
  const url = new URL(href, base);
  const original = new URLSearchParams(url.hash.slice(1)).get("source");
  return url.pathname + url.search + (parseRevisionRoute(href) ? original ? "#" + original : "" : url.hash);
}

export function relativeRevisionTarget(parent: RevisionTarget, href: string): RevisionTarget | undefined {
  try {
    if (!href || href !== href.trim() || /^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(href) || href.includes("\\") || href.split("#")[0]!.includes("?")) return;
    const location = href.startsWith("#") ? { path: "./" + parent.path, fragment: decodeURIComponent(href.slice(1)) } : normalizeLink(href, parent.path);
    const child = { commit: parent.commit, repo: parent.repo, path: location.path.slice(2), anchor: location.fragment || undefined };
    formatRevisionLink(child);
    return child;
  } catch { return; }
}

export const RevisionFileContext = createContext<{ target: RevisionTarget; current: boolean; web: boolean;
  read: (path: string, signal: AbortSignal) => Promise<File> } | undefined>(undefined);
