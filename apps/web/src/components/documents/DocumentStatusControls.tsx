import { useLayoutEffect, useRef, useState } from "react";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { Check, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { NavigationLink } from "../NavigationLink";
import { documentTypeIcon, documentTypeLabel } from "../MarkdownDocumentReader";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function DocumentSetSwitcher({ file, documents, href, onSelect, disabled = false }: {
  file: MarkdownFileSummary;
  documents: MarkdownFileSummary[];
  href: (file: MarkdownFileSummary) => string;
  onSelect: (file: MarkdownFileSummary) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = documentTypeLabel(file.type);
  if (documents.length < 2) return <span className="ak-document-current-type">{label}</span>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" className="ak-document-current-type" data-tour="document-set-switcher"
        disabled={disabled} aria-label={t("Switch document in this set")} title={t("Switch document in this set")}>
        {label}<ChevronUp aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent data-document-panel-overlay="" side="top" align="start" className="ak-document-switcher-popover ak-scroll-area"
      aria-label={t("Documents in this set")}>
      <div className="ak-document-switcher-heading">{t("Documents in this set")}</div>
      {documents.map((document) => {
        const Icon = documentTypeIcon(document.type), selected = document.id === file.id;
        return <NavigationLink key={document.id} href={href(document)} disabled={disabled}
          aria-current={selected ? "page" : undefined} title={document.workspaceRelativePath}
          className={buttonVariants({ variant: selected ? "secondary" : "ghost", className: "ak-document-switcher-link" })}
          onNavigate={() => { setOpen(false); onSelect(document); }}>
          <Icon aria-hidden="true" />
          <span className="ak-document-switcher-label"><span>{documentTypeLabel(document.type)}</span><span className="truncate">{document.filename}</span></span>
          {selected ? <Check aria-hidden="true" /> : null}
        </NavigationLink>;
      })}
    </PopoverContent>
  </Popover>;
}

export type DocumentStatusSearchProps = { value: string; onChange: (value: string) => void; disabled?: boolean };
export function DocumentStatusSearch({ value, onChange, onReveal, disabled }: DocumentStatusSearchProps & { onReveal: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const expanded = editing || value.length > 0;
  useLayoutEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  return <div className="ak-document-status-search" data-expanded={expanded} data-tour="document-status-search"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false); }}>
    <Button ref={button} variant="ghost" size="iconSm" disabled={disabled} aria-label={t("Search documents and tickets")}
      title={t("Search documents and tickets")} aria-expanded={expanded} onClick={() => { setEditing(true); input.current?.focus(); onReveal(); }}>
      <Search aria-hidden="true" />
    </Button>
    {expanded ? <>
      <Input ref={input} type="search" role="searchbox" aria-label={t("Search documents and tickets")}
        placeholder={t("Search documents and tickets")} autoComplete="off" spellCheck={false} disabled={disabled} value={value}
        onFocus={() => { setEditing(true); onReveal(); }} onChange={(event) => { onChange(event.target.value); onReveal(); }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
          event.preventDefault(); event.stopPropagation(); setEditing(false); button.current?.focus();
        }} />
      {value ? <Button variant="ghost" size="iconSm" disabled={disabled} aria-label={t("Clear search")} title={t("Clear search")}
        onClick={() => { onChange(""); input.current?.focus(); }}><X aria-hidden="true" /></Button> : null}
    </> : null}
  </div>;
}
