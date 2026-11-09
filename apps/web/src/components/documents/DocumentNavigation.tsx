import type { ReactNode } from "react";
import type { DocumentSetSummary, MarkdownFileSummary, MarkdownFileType } from "@alpha-kanban/shared";
import { documentPathOwner } from "@alpha-kanban/shared/documents";
import { ArrowDown, ArrowUp, FileText, Filter, Search, X } from "lucide-react";
import { t, useTranslation } from "@/i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { NavigationLink } from "../NavigationLink";
import { DocumentOwnerBadge, OwnerFilterChoices, OwnerFilterSelect } from "../DocumentOwner";
import { SearchHighlight } from "../tickets/TicketSearch";
import { documentTypeLabel, documentTypeIcon } from "../MarkdownDocumentReader";
import type { DocumentSearchMatch } from "../../documentSearch";
import { DEFAULT_COLUMN_FILTERS, DEFAULT_DOCUMENT_FILTERS, type DocumentColumnFilters, type DocumentFilters, type VisibleDocumentSet } from "../../documentSetFiltering";
import { DOCUMENT_SET_SORT_OPTIONS, defaultDirectionForDocumentSetSortMode, isDocumentSetSortMode, type DocumentSetSortMode, type DocumentSetSortPreference } from "../../documentSetSorting";
import type { OwnerFilter } from "../../ownerFilters";
import type { PanelView } from "./documentPanelState";

export type DocumentNavigationSettings = {
  disabled: boolean; filters: DocumentFilters; onFiltersChange: (filters: DocumentFilters) => void;
  columns: DocumentColumnFilters; onColumnsChange: (filters: DocumentColumnFilters) => void;
  owners: string[]; ownerFilter: OwnerFilter; onOwnerFilterChange: (owner: OwnerFilter) => void;
  preference: DocumentSetSortPreference; onPreferenceChange: (value: DocumentSetSortPreference) => void;
};
const TYPES: MarkdownFileType[] = ["plan", "tickets", "inventory", "markdown"];
type Column = "name" | "owner" | "completion" | "directory" | "types";
const COLUMN_LABELS: Record<Column, string> = { name: "Document name", owner: "Document owner", completion: "Completion", directory: "Directory", types: "Document types" };
const COLUMN_SORTS: Record<Column, DocumentSetSortMode> = { name: "name", owner: "owner", completion: "progress", directory: "directory", types: "type" };
function activeColumn(column: Column, settings: DocumentNavigationSettings) {
  if (column === "owner") return settings.ownerFilter !== "all";
  if (column === "completion") return settings.filters.hideCompletedSets || settings.columns.completion !== "all";
  if (column === "types") return settings.columns.types.length > 0;
  return !!settings.columns[column].trim();
}
function resetColumn(column: Column, settings: DocumentNavigationSettings) {
  if (column === "owner") settings.onOwnerFilterChange("all");
  else {
    settings.onColumnsChange({ ...settings.columns, [column]: DEFAULT_COLUMN_FILTERS[column] });
    if (column === "completion") settings.onFiltersChange({ ...settings.filters, hideCompletedSets: false });
  }
}
function ColumnFilter({ column, settings }: { column: Column; settings: DocumentNavigationSettings }) {
  const { t } = useTranslation();
  const { columns, onColumnsChange, filters, onFiltersChange } = settings;
  if (column === "owner") return <OwnerFilterChoices owners={settings.owners} value={settings.ownerFilter} onChange={settings.onOwnerFilterChange} />;
  if (column === "name" || column === "directory") return <Input aria-label={t(column === "name" ? "Filter document names" : "Filter paths")}
    placeholder={t("Contains text…")} value={columns[column]} onChange={(event) => onColumnsChange({ ...columns, [column]: event.target.value })} />;
  if (column === "completion") {
    const value = filters.hideCompletedSets ? "incomplete" : columns.completion;
    return <div role="group" aria-label={t("Completion")} className="grid">
      {([['all', 'All'], ['incomplete', 'Hide completed sets (100%)'], ['complete', 'Completed only'], ['without-tickets', 'No tickets']] as const).map(([option, label]) =>
        <Button key={option} size="sm" variant={value === option ? "secondary" : "ghost"} className="justify-start" aria-pressed={value === option} onClick={() => {
          onFiltersChange({ ...filters, hideCompletedSets: option === "incomplete" });
          onColumnsChange({ ...columns, completion: option === "incomplete" ? "all" : option });
        }}>{t(label)}</Button>)}
    </div>;
  }
  return <div className="grid gap-1" role="group" aria-label={t("Document types")}>
    {TYPES.map((type) => <label key={type} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
      <Checkbox checked={columns.types.includes(type)} onCheckedChange={(checked) => onColumnsChange({ ...columns, types: checked ? [...columns.types, type] : columns.types.filter((value) => value !== type) })} />{documentTypeLabel(type)}
    </label>)}
  </div>;
}

export function DocumentListHeader({ settings, search, onSearchChange, controls, guide, count }: {
  settings: DocumentNavigationSettings; search: string; onSearchChange: (value: string) => void; controls: ReactNode; guide: ReactNode; count: number;
}) {
  const { t } = useTranslation();
  const { disabled, filters, onFiltersChange, preference, onPreferenceChange, ownerFilter, owners, onOwnerFilterChange, columns, onColumnsChange } = settings;
  const activeFilters = Number(filters.hidePlainMarkdown) + (Object.keys(COLUMN_LABELS) as Column[]).filter((column) => activeColumn(column, settings)).length;
  const Direction = preference.direction === "asc" ? ArrowUp : ArrowDown;
  return <div className="ak-document-tools">
    <div className="ak-document-tools-title">{t("Documents")}<span className="ak-document-count">{count}</span></div>
    <div className="ak-document-tools-search relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input data-tour="documents" role="searchbox" aria-label={t("Search documents and tickets")} placeholder={t("Search documents and tickets")}
        disabled={disabled} value={search} onChange={(event) => onSearchChange(event.target.value)} className="pl-9 pr-9" />
      {search ? <Button className="absolute right-1 top-1" size="iconSm" variant="ghost" aria-label={t("Clear search")} onClick={() => onSearchChange("")}><X aria-hidden="true" /></Button> : null}
    </div>
    <div className="ak-document-tools-filter">
      <Popover>
        <PopoverTrigger asChild><Button data-tour="document-filters" size="iconSm" variant={activeFilters ? "secondary" : "outline"} disabled={disabled}
          aria-label={t("Document filters")} title={t("Document filters ({{count}} active)", { count: activeFilters })} className="relative">
          <Filter aria-hidden="true" />{activeFilters ? <span className="ak-document-filter-count">{activeFilters}</span> : null}
        </Button></PopoverTrigger>
        <PopoverContent data-document-panel-overlay="" align="start" className="ak-scroll-area max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto p-3" aria-label={t("Document filters")}>
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("Document filters")}</h3>
            <Button size="xs" variant="ghost" disabled={!activeFilters} onClick={() => { onFiltersChange(DEFAULT_DOCUMENT_FILTERS); onColumnsChange(DEFAULT_COLUMN_FILTERS); onOwnerFilterChange("all"); }}>{t("Reset")}</Button></div>
          <label className="flex cursor-pointer items-center gap-2 py-2 text-sm"><Checkbox checked={filters.hideCompletedSets} onCheckedChange={(checked) => { onFiltersChange({ ...filters, hideCompletedSets: checked === true }); onColumnsChange({ ...columns, completion: "all" }); }} />{t("Hide completed sets (100%)")}</label>
          <label className="flex cursor-pointer items-center gap-2 py-2 text-sm"><Checkbox checked={filters.hidePlainMarkdown} onCheckedChange={(checked) => onFiltersChange({ ...filters, hidePlainMarkdown: checked === true })} />{t("Hide plain Markdown")}</label>
          {owners.length || ownerFilter !== "all" ? <div className="mt-2 border-t border-border pt-3"><OwnerFilterSelect owners={owners} value={ownerFilter} onChange={onOwnerFilterChange} /></div> : null}
          {(Object.keys(COLUMN_LABELS) as Column[]).filter((column) => column !== "owner" && activeColumn(column, settings)).map((column) =>
            <div key={column} className="mt-3 border-t border-border pt-2">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-semibold">{t(COLUMN_LABELS[column])}</span><Button variant="ghost" size="xs" onClick={() => resetColumn(column, settings)}>{t("Reset")}</Button></div>
              <ColumnFilter column={column} settings={settings} />
            </div>)}
        </PopoverContent>
      </Popover>
      {owners.length || ownerFilter !== "all" ? <Select value={ownerFilter} disabled={disabled} onValueChange={(value) => onOwnerFilterChange(value as OwnerFilter)}>
        <SelectTrigger size="sm" className="ak-document-owner-select" aria-label={t("Document owner")}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{t("All")}</SelectItem><SelectItem value="unassigned">{t("Unassigned")}</SelectItem>
          {[...new Set([...owners, ...(ownerFilter.startsWith("@") ? [ownerFilter] : [])])].sort().map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}
        </SelectContent>
      </Select> : null}
    </div>
    <div data-tour="document-sort" className="ak-document-tools-sort">
      <Select disabled={disabled} value={preference.mode} onValueChange={(mode) => { if (isDocumentSetSortMode(mode)) onPreferenceChange({ mode, direction: defaultDirectionForDocumentSetSortMode(mode) }); }}>
        <SelectTrigger size="sm" aria-label={t("Document sort")}><SelectValue /></SelectTrigger>
        <SelectContent>{DOCUMENT_SET_SORT_OPTIONS.map((option) => <SelectItem value={option.mode} key={option.mode} title={t(option.title)}>{t(option.label)}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="iconSm" variant="outline" disabled={disabled} aria-label={t("Sort {{direction}}", { direction: t(preference.direction === "asc" ? "Ascending" : "Descending") })}
        onClick={() => onPreferenceChange({ ...preference, direction: preference.direction === "asc" ? "desc" : "asc" })}><Direction aria-hidden="true" /></Button>
    </div>
    <div className="ak-document-tools-layout">{guide}{controls}</div>
  </div>;
}

function ColumnHeading({ column, settings }: { column: Column; settings: DocumentNavigationSettings }) {
  const { t } = useTranslation();
  const sortMode = COLUMN_SORTS[column], selected = settings.preference.mode === sortMode;
  const Direction = settings.preference.direction === "asc" ? ArrowUp : ArrowDown;
  return <div className={`ak-document-column ak-document-column-${column}`} role="columnheader" aria-sort={selected ? settings.preference.direction === "asc" ? "ascending" : "descending" : "none"}>
    <Button variant="ghost" size="xs" className="ak-document-column-sort" disabled={settings.disabled} title={t(COLUMN_LABELS[column])}
      onClick={() => settings.onPreferenceChange({ mode: sortMode, direction: selected && settings.preference.direction === "asc" ? "desc" : "asc" })}>
      <span className="truncate">{t(COLUMN_LABELS[column])}</span>{selected ? <Direction className="size-3" aria-hidden="true" /> : null}
    </Button>
    <Popover>
      <PopoverTrigger asChild><Button size="iconSm" variant={activeColumn(column, settings) ? "secondary" : "ghost"} disabled={settings.disabled} className="ak-document-column-filter"
        aria-label={t("Filter {{column}}", { column: t(COLUMN_LABELS[column]) })} title={t("Filter {{column}}", { column: t(COLUMN_LABELS[column]) })}><Filter className="size-3" aria-hidden="true" /></Button></PopoverTrigger>
      <PopoverContent data-document-panel-overlay="" align="start" className="w-64 p-3" aria-label={t("Filter {{column}}", { column: t(COLUMN_LABELS[column]) })}>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{t(COLUMN_LABELS[column])}</h3><Button size="xs" variant="ghost" onClick={() => resetColumn(column, settings)}>{t("Reset")}</Button></div>
        <div className="mb-3 flex gap-1 border-b border-border pb-3">{(["asc", "desc"] as const).map((direction) => <Button size="sm" key={direction}
          variant={selected && settings.preference.direction === direction ? "secondary" : "ghost"} aria-pressed={selected && settings.preference.direction === direction}
          onClick={() => settings.onPreferenceChange({ mode: sortMode, direction })}>{direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}{t(direction === "asc" ? "Ascending" : "Descending")}</Button>)}</div>
        <ColumnFilter column={column} settings={settings} />
      </PopoverContent>
    </Popover>
  </div>;
}

export function DocumentSetNavigator({ documentSets, onSelectFile, fileHref, selectedFileId, matches, search, busy, view, settings }: {
  documentSets: VisibleDocumentSet[]; onSelectFile: (file: MarkdownFileSummary) => void; fileHref: (file: MarkdownFileSummary) => string;
  selectedFileId?: string; matches: Map<string, DocumentSearchMatch>; search: string; busy: boolean; view: PanelView; settings: DocumentNavigationSettings;
}) {
  const { t } = useTranslation();
  return <nav data-tour={search && documentSets.length ? "document-results" : undefined} className={view === "details" ? "ak-document-details" : "ak-document-cards"} aria-label={t("Documents")} aria-busy={busy} data-project-search={search}>
    {view === "details" ? <div role="table" aria-label={t("Documents")}>
      <div className="ak-document-details-header" role="row">{(Object.keys(COLUMN_LABELS) as Column[]).map((column) => <ColumnHeading key={column} column={column} settings={settings} />)}</div>
      {documentSets.map(({ documentSet: set, documents }) => <div key={set.id} role="row" className={`ak-document-details-row ${set.documents.some((file) => file.id === selectedFileId) ? "ak-row-active" : ""}`}>
        <div role="cell" className="ak-document-detail-name" title={set.label}><FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <NavigationLink href={fileHref(documents.find((file) => file.id === set.primaryFile.id) ?? documents[0]!)} onNavigate={() => onSelectFile(documents.find((file) => file.id === set.primaryFile.id) ?? documents[0]!)} className="ak-focus-ring truncate rounded-sm"><SearchHighlight text={set.label} query={search} /></NavigationLink>
        </div>
        <div role="cell" className="ak-document-column-owner truncate">{documentPathOwner(set.primaryFile).value ? <DocumentOwnerBadge file={set.primaryFile} /> : <span className="text-muted-foreground">{t("Unassigned")}</span>}</div>
        <div role="cell" className="ak-document-column-completion">{set.ticketProgress?.totalTickets !== undefined ? <Badge variant="muted">{set.ticketProgress.doneTickets ?? 0}/{set.ticketProgress.totalTickets}</Badge> : <span className="text-muted-foreground">—</span>}</div>
        <div role="cell" className="ak-document-column-directory truncate text-muted-foreground" title={set.directory}>{set.directory || t("docs root")}</div>
        <div role="cell" className="ak-document-detail-links ak-scroll-area">{documents.map((file) => <DocumentTypeButton key={file.id} file={file} href={fileHref(file)} isSelected={file.id === selectedFileId} onSelect={() => onSelectFile(file)} matches={matches.get(file.id)?.ticketIds.length} />)}</div>
      </div>)}
    </div> : documentSets.map(({ documentSet, documents }) => <DocumentSetRow key={documentSet.id} documentSet={documentSet} visibleDocuments={documents} onSelectFile={onSelectFile} fileHref={fileHref} selectedFileId={selectedFileId} matches={matches} search={search} />)}
  </nav>;
}

function DocumentSetRow({
  documentSet,
  visibleDocuments,
  onSelectFile,
  fileHref,
  selectedFileId,
  matches,
  search,
}: {
  documentSet: DocumentSetSummary;
  visibleDocuments: MarkdownFileSummary[];
  onSelectFile: (file: MarkdownFileSummary) => void;
  fileHref: (file: MarkdownFileSummary) => string;
  selectedFileId?: string;
  matches: Map<string, DocumentSearchMatch>;
  search: string;
}) {
  const { t } = useTranslation();
  const isSelected = documentSet.documents.some((file) => file.id === selectedFileId);

  return (
    <section
      className={[
        "ak-row grid min-w-0 gap-2 px-3 py-2 transition-colors",
        isSelected ? "ak-row-active" : "",
      ].join(" ")}
      title={documentSet.documents.map((file) => file.relativePath).join("\n")}
    >
      <div className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-[var(--ak-ink)]">
              <SearchHighlight text={documentSet.label} query={search} />
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {documentSet.documents.length === 1 ? (
                <Badge variant="outline">{t("standalone")}</Badge>
              ) : null}
              {documentSet.ticketProgress?.totalTickets !== undefined ? (
                <Badge variant="muted">
                  {documentSet.ticketProgress.doneTickets ?? 0}/
                  {documentSet.ticketProgress.totalTickets}
                </Badge>
              ) : null}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <DocumentOwnerBadge file={documentSet.primaryFile} />
            <span className="ak-body-muted min-w-0 truncate text-xs">{documentSet.directory || t("docs root")}</span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1 pl-6">
        {visibleDocuments.map((file) => (
          <DocumentTypeButton
            file={file}
            href={fileHref(file)}
            isSelected={file.id === selectedFileId}
            key={file.id}
            onSelect={() => onSelectFile(file)}
            matches={matches.get(file.id)?.ticketIds.length}
          />
        ))}
      </div>
      {search.trim() ? visibleDocuments.flatMap((file) => {
        const match = matches.get(file.id);
        return match ? [<NavigationLink href={fileHref(file)} key={file.id} onNavigate={() => onSelectFile(file)}
          className="ak-focus-ring ml-6 min-w-0 rounded-sm text-left text-xs text-muted-foreground" title={file.relativePath}>
          <span className="font-medium">{documentTypeLabel(file.type)} · {t("Line {{line}}", { line: match.line })}</span>
          <span className="mt-1 line-clamp-2 break-words"><SearchHighlight text={match.excerpt} query={search} /></span>
        </NavigationLink>] : [];
      }) : null}
    </section>
  );
}

function DocumentTypeButton({
  file,
  href,
  isSelected,
  onSelect,
  matches,
}: {
  file: MarkdownFileSummary;
  href: string;
  isSelected: boolean;
  onSelect: () => void;
  matches?: number;
}) {
  useTranslation();
  const Icon = documentTypeIcon(file.type);

  return (
    <NavigationLink href={href}
      aria-current={isSelected ? "page" : undefined}
      className={[
        "ak-focus-ring inline-flex h-7 min-w-0 items-center gap-1 rounded-[var(--ak-radius-sm)] border px-1.5 text-[11px] font-medium transition-colors",
        isSelected
          ? "border-[var(--ak-primary)] bg-[var(--ak-primary-soft)] text-foreground"
          : "border-[var(--ak-hairline)] bg-[var(--ak-surface)] text-[var(--ak-ink-muted)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
      ].join(" ")}
      onNavigate={onSelect}
      title={file.relativePath}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{documentTypeLabel(file.type)}</span>
      {matches ? <span>{t("{{count}} matches", { count: matches })}</span> : null}
    </NavigationLink>
  );
}

