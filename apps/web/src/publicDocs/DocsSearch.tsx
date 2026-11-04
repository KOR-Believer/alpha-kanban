import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation, type Language } from "../i18n";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { NavigationLink } from "../components/NavigationLink";
import { searchDocs, type PublicDocument } from "./catalog";

export function DocsSearch({ open, onOpenChange, documents, onNavigate, returnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; documents: PublicDocument[]; onNavigate: (href: string) => void; returnFocus: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigating = useRef(false);
  const results = useMemo(() => searchDocs(documents, query, i18n.language as Language), [documents, query, i18n.language]);
  useEffect(() => { setSelected(0); }, [query, i18n.language]);
  useEffect(() => { if (open) document.getElementById(`public-search-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, open]);
  function choose(href: string) { navigating.current = true; onNavigate(href); }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="ak-docs-search-dialog" onOpenAutoFocus={event => { event.preventDefault(); navigating.current = false; input.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); if (!navigating.current) returnFocus(); }}>
      <DialogHeader><DialogTitle>{t("Search documentation")}</DialogTitle>
        <DialogDescription>{t("Search guide titles and contents.")}</DialogDescription></DialogHeader>
      <DialogBody className="pb-5">
        <label className="sr-only" htmlFor="public-docs-query">{t("Search documentation")}</label>
        <div className="ak-docs-search-input"><Search aria-hidden="true" /><Input id="public-docs-query" ref={input} value={query}
          role="combobox" aria-autocomplete="list" aria-expanded={Boolean(results.length)} aria-controls="public-docs-results"
          aria-activedescendant={results.length ? `public-search-${Math.min(selected, results.length - 1)}` : undefined}
          autoComplete="off" onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || !results.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(current => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length); }
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); choose(results[Math.min(selected, results.length - 1)]!.href); }
          }} /></div>
        <p role="status" className="ak-docs-search-status">{!query.trim() ? t("Search by feature, setting, or question.") : results.length ? t("{{count}} guide sections found", { count: results.length }) : t("No matching guide. Try another word.")}</p>
        <ul id="public-docs-results" className="ak-docs-search-results" role="listbox" aria-label={t("Documentation search results")}>
          {results.map((result, index) => <li key={result.id} role="presentation"><NavigationLink id={`public-search-${index}`} href={result.href} role="option" aria-selected={index === selected}
            className="ak-focus-ring" data-selected={index === selected || undefined} onFocus={() => setSelected(index)} onNavigate={() => choose(result.href)}>
            <small>{result.group}</small><strong>{result.title}</strong><span>{result.excerpt}</span>
          </NavigationLink></li>)}
        </ul>
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
