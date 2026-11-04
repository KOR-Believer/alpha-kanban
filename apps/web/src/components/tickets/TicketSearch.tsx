import type { TicketItem } from "@alpha-kanban/shared";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { normalizeTicketQuery, ticketSearchExcerpt } from "../../ticketSearch";

export function TicketSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return <div className="relative w-64 max-w-full shrink-0">
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input data-tour="ticket-search" type="text" aria-label={t("Search tickets")} placeholder={t("ID, title or body")} className="pl-9 pr-9"
      value={value} onChange={(event) => onChange(event.target.value)} />
    {value ? <Button variant="ghost" size="iconSm" className="absolute right-1 top-1/2 -translate-y-1/2"
      aria-label={t("Clear ticket search")} onClick={() => onChange("")}><X aria-hidden="true" /></Button> : null}
  </div>;
}

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const needle = normalizeTicketQuery(query), offset = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (offset < 0) return <>{text}</>;
  return <>{text.slice(0, offset)}<mark className="rounded-sm bg-primary/20 text-foreground">{text.slice(offset, offset + needle.length)}</mark>{text.slice(offset + needle.length)}</>;
}

export function TicketSearchExcerpt({ ticket, query = "", detail = false }: { ticket: TicketItem; query?: string; detail?: boolean }) {
  const { t } = useTranslation();
  const excerpt = ticketSearchExcerpt(ticket, query);
  if (!excerpt) return null;
  return <div className={detail ? "rounded-md border border-border bg-muted p-3 text-sm" : "mt-2 line-clamp-3 break-words text-xs text-muted-foreground"}>
    {detail ? <p className="mb-1 font-medium">{t("Match in ticket body")}</p> : null}
    <SearchHighlight text={excerpt} query={query} />
  </div>;
}
