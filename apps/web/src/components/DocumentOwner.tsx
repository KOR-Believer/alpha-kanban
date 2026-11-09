import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { documentPathOwner } from "@alpha-kanban/shared/documents";
import { Check, Users, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import type { OwnerFilter } from "../ownerFilters";
import type { BoardOwnerSelection } from "../allBoardOwnerFilters";

export function DocumentOwnerBadge({ file, tourAnchor }: { file?: MarkdownFileSummary; tourAnchor?: string }) {
  const { t } = useTranslation();
  const owner = file && documentPathOwner(file).value;
  if (!owner) return null;
  return <Badge variant="muted" className="min-w-0 max-w-full" title={t("Document owner: {{owner}}", { owner })}>
    <span data-tour={tourAnchor} data-document-owner={owner} className="truncate">{owner}</span>
  </Badge>;
}

export function OwnerFilterSelect({ owners, value, onChange, label, disabled }: {
  owners: string[]; value: OwnerFilter; onChange: (value: OwnerFilter) => void; label?: string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  // A saved selection remains resettable even after its folder disappears.
  const options = [...new Set([...owners, ...(value.startsWith("@") ? [value] : [])])].sort();
  return <div className="grid min-w-0 gap-1.5">
    <label htmlFor={id} className="text-sm text-foreground">{label ?? t("Document owner")}</label>
    <Select value={value} onValueChange={(next) => onChange(next as OwnerFilter)} disabled={disabled}>
      <SelectTrigger id={id} size="sm" className="w-full min-w-0 text-sm" aria-label={label ?? t("Document owner")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("All")}</SelectItem>
        <SelectItem value="unassigned">{t("Unassigned")}</SelectItem>
        {options.map((owner) => <SelectItem value={owner} key={owner}>{owner}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export function OwnerFilterChoices({ owners, value, onChange }: { owners: string[]; value: OwnerFilter; onChange: (value: OwnerFilter) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const names = [...new Set([...owners, ...(value.startsWith("@") ? [value] : [])])].sort() as OwnerFilter[];
  const label = (owner: OwnerFilter) => owner === "all" ? t("All") : owner === "unassigned" ? t("Unassigned") : owner;
  const query = search.trim().normalize("NFC").toLocaleLowerCase();
  const choices: OwnerFilter[] = ["all", "unassigned", ...names];
  const matches = choices.filter((owner) => label(owner).normalize("NFC").toLocaleLowerCase().includes(query));
  return <div className="grid min-h-0 gap-2">
    <Input aria-label={t("Search owners")} placeholder={t("Search owners")} value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="ak-scroll-area grid max-h-60 overflow-y-auto" role="group" aria-label={t("Document owner")}>
      {matches.map((owner) => <Button key={owner} size="sm" variant={owner === value ? "secondary" : "ghost"} className="min-w-0 justify-start" aria-pressed={owner === value} onClick={() => onChange(owner)}>
        <Check aria-hidden="true" className={owner === value ? "shrink-0" : "invisible shrink-0"} /><span className="truncate">{label(owner)}</span>
      </Button>)}
      {!matches.length ? <p role="status" className="py-2 text-sm text-muted-foreground">{t("No matching owners")}</p> : null}
    </div>
  </div>;
}

export function ProjectOwnerFilter({ owners, value, onChange }: { owners: string[]; value: OwnerFilter; onChange: (value: OwnerFilter) => void }) {
  const { t } = useTranslation();
  if (!owners.length && value === "all") return null;
  return <Popover>
    <PopoverTrigger asChild><Button data-tour="project-owner-filter" size="sm" variant={value === "all" ? "ghost" : "secondary"} title={t("Document owner")}
      aria-label={value === "all" ? t("Document owner") : `${t("Document owner")}: ${value === "unassigned" ? t("Unassigned") : value}`}>
      <Users aria-hidden="true" /><span className="truncate">{value === "all" ? t("Document owner") : value === "unassigned" ? t("Unassigned") : value}</span>
    </Button></PopoverTrigger>
    <PopoverContent data-document-panel-overlay="" side="top" align="start" className="w-64 p-3" aria-label={t("Document owner")}>
      <h3 className="mb-2 text-sm font-semibold">{t("Document owner")}</h3>
      <OwnerFilterChoices owners={owners} value={value} onChange={onChange} />
    </PopoverContent>
  </Popover>;
}

export function BoardOwnerFilter({ owners, selected, onChange }: {
  owners: string[]; selected: BoardOwnerSelection[]; onChange: (value: BoardOwnerSelection[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const label = (owner: BoardOwnerSelection) => owner === "unassigned" ? t("Unassigned") : owner;
  // Keep selected names available even when a project disconnects or a folder disappears.
  const names = [...new Set([...owners, ...selected.filter((owner) => owner !== "unassigned")])].sort() as BoardOwnerSelection[];
  const query = search.trim().normalize("NFC").toLocaleLowerCase();
  const options: BoardOwnerSelection[] = ["unassigned", ...names];
  const matches = options.filter((owner) => label(owner).toLocaleLowerCase().includes(query));
  if (!owners.length && !selected.length) return null;
  return <Popover onOpenChange={(open) => { if (!open) setSearch(""); }}>
    <PopoverTrigger asChild>
      <Button data-tour="board-owners" size="sm" variant={selected.length ? "secondary" : "outline"} aria-label={t("Owner filters ({{count}} selected)", { count: selected.length })}>
        <Users aria-hidden="true" />{t("Document owner")}{selected.length ? <span className="tabular-nums">{selected.length}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col gap-3 p-3" aria-label={t("Owner filters")}
      onOpenAutoFocus={(event) => { event.preventDefault(); searchInput.current?.focus(); }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Owner filters")}</h3>
        <Button size="xs" variant="ghost" disabled={!selected.length} onClick={() => onChange([])}>{t("All")}</Button>
      </div>
      <Input ref={searchInput} aria-label={t("Search owners")} placeholder={t("Search owners")} value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="ak-scroll-area min-h-0 max-h-72 overflow-y-auto">
        {selected.length ? <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((owner) => <Button key={owner} size="xs" variant="secondary" className="min-w-0 max-w-full"
            aria-label={t("Remove owner {{owner}}", { owner: label(owner) })} onClick={() => onChange(selected.filter((value) => value !== owner))}>
            <span className="truncate">{label(owner)}</span><X className="size-3" aria-hidden="true" />
          </Button>)}
        </div> : null}
        {matches.map((owner) => <label key={owner} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
          <Checkbox checked={selected.includes(owner)} onCheckedChange={(checked) => onChange(checked ? [...selected, owner] : selected.filter((value) => value !== owner))} />
          <span className="min-w-0 break-all">{label(owner)}</span>
        </label>)}
        {!matches.length ? <p role="status" className="py-2 text-sm text-muted-foreground">{t("No matching owners")}</p> : null}
      </div>
    </PopoverContent>
  </Popover>;
}
