import content from "./content.json";
import type { Language } from "../i18n";

export type Translation = Record<Language, string>;
export type PublicSection = { id: string; title: Translation; body: Translation; channels?: ("stable" | "canary")[] };
export type PublicDocument = { id: string; group: number; title: Translation; lead: Translation; sections: PublicSection[] };
export const groups: Translation[] = content.groups;
// Explicitly authored public content. Never discover or import repository/workspace Markdown.
// Both builds currently expose the same document features; channel-only sections opt in below.
export function publicDocuments(channel: "stable" | "canary"): PublicDocument[] {
  return (content.documents as PublicDocument[]).map(doc => ({ ...doc, sections: doc.sections.filter(section => !section.channels || section.channels.includes(channel)) }));
}
export function docHref(id = "start", section?: string) {
  return `/docs${id === "start" ? "" : `/${encodeURIComponent(id)}`}${section ? `#${encodeURIComponent(section)}` : ""}`;
}
export function documentId(pathname: string) {
  if (pathname === "/docs" || pathname === "/docs/") return "start";
  try { return decodeURIComponent(pathname.slice("/docs/".length)); } catch { return ""; }
}
export function plainText(markdown: string) {
  return markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`#*|>]/g, "").replace(/\s+/g, " ").trim();
}
export function searchDocs(documents: PublicDocument[], query: string, language: Language) {
  const terms = query.trim().toLocaleLowerCase(language).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return documents.flatMap(doc => doc.sections.map(section => {
    const title = `${doc.title[language]} · ${section.title[language]}`;
    const body = plainText(section.body[language]);
    const haystack = `${title} ${body}`.toLocaleLowerCase(language);
    if (!terms.every(term => haystack.includes(term))) return [];
    const at = Math.max(0, body.toLocaleLowerCase(language).indexOf(terms[0]!));
    const start = Math.max(0, at - 36);
    return [{ id: `${doc.id}-${section.id}`, href: docHref(doc.id, section.id), title, group: groups[doc.group]![language],
      excerpt: `${start ? "…" : ""}${body.slice(start, start + 160)}${body.length > start + 160 ? "…" : ""}`,
      rank: terms.filter(term => title.toLocaleLowerCase(language).includes(term)).length }];
  }).flat()).sort((a, b) => b.rank - a.rank).slice(0, 40);
}
