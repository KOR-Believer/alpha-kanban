import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { documentPathOwner } from "@alpha-kanban/shared/documents";
import { Users } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "@/i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ownerFilterFor, type OwnerFilter, type OwnerFilters } from "../ownerFilters";

export function DocumentOwnerBadge({ file }: { file?: MarkdownFileSummary }) {
  const { t } = useTranslation();
  const owner = file && documentPathOwner(file).value;
  if (!owner) return null;
  return <Badge variant="muted" className="min-w-0 max-w-full" title={t("Document owner: {{owner}}", { owner })}>
    <span data-document-owner={owner} className="truncate">{owner}</span>
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
    <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label ?? t("Document owner")}</label>
    <Select value={value} onValueChange={(next) => onChange(next as OwnerFilter)} disabled={disabled}>
      <SelectTrigger id={id} size="sm" className="w-full min-w-0" aria-label={label ?? t("Document owner")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("All owners")}</SelectItem>
        <SelectItem value="unassigned">{t("Unassigned owner")}</SelectItem>
        {options.map((owner) => <SelectItem value={owner} key={owner}>{owner}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export type OwnerFilterProject = { id: string; label: string; root: string; owners: string[] };

export function ProjectOwnerFilters({ projects, filters, onChange }: {
  projects: OwnerFilterProject[]; filters: OwnerFilters; onChange: (changes: OwnerFilters) => void;
}) {
  const { t } = useTranslation();
  const eligible = projects.filter((project) => project.owners.length > 0 || ownerFilterFor(filters, project.id) !== "all");
  if (!eligible.length) return null;
  const active = eligible.filter((project) => ownerFilterFor(filters, project.id) !== "all").length;
  return <Popover>
    <PopoverTrigger asChild>
      <Button size="sm" variant={active ? "secondary" : "outline"} aria-label={t("Owner filters ({{count}} active)", { count: active })}>
        <Users aria-hidden="true" />{t("Document owner")}{active ? <span className="tabular-nums">{active}</span> : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 p-3" aria-label={t("Owner filters")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("Owner filters")}</h3>
        <Button size="xs" variant="ghost" disabled={!active}
          onClick={() => onChange(Object.fromEntries(eligible.map((project) => [project.id, "all"])))}>{t("Reset")}</Button>
      </div>
      <div className="ak-scroll-area grid max-h-72 gap-3 overflow-y-auto">
        {eligible.map((project) => <OwnerFilterSelect key={project.id} owners={project.owners}
          label={eligible.some((other) => other.id !== project.id && other.label === project.label) ? project.root : project.label}
          value={ownerFilterFor(filters, project.id)} onChange={(value) => onChange({ [project.id]: value })} />)}
      </div>
    </PopoverContent>
  </Popover>;
}
