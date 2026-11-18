import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SmokeCase, SmokeDocument, SmokeLog, SmokeSection } from "@alpha-kanban/shared/smokeMarkdown";
import { SMOKE_RESULTS } from "@alpha-kanban/shared/smokeMarkdown";
import { normalizeDocumentOwner } from "@alpha-kanban/shared/documents";
import { ChevronDown, ChevronRight, Search, ListChecks, Pencil } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { MarkdownContent } from "../MarkdownContent";
import type { ReaderFile } from "../MarkdownDocumentReader";
import { NavigationLink } from "../NavigationLink";
import { localLinkUrlTransform, useBrowserMarkdownComponents } from "../../browser/MarkdownResources";
import type { LinkContext } from "../../browser/linkMappings";
import { resultLabel, resultVariant, type SmokeSheetTab } from "./smokeSheets";
import "./smoke-sheets.css";

type ReadingState = { top: number; left: number; query: string; filter: string; expanded: string[]; memo: boolean; common: boolean };
const positions = new Map<string, ReadingState>();
const emptyState = (): ReadingState => ({ top: 0, left: 0, query: "", filter: "all", expanded: [], memo: false, common: false });
type Props = {
  document: SmokeDocument; file: ReaderFile; tabs?: SmokeSheetTab[];
  fileHref?: (id: string) => string; onFileSelect?: (id: string) => void;
  linkContext?: LinkContext; snapshotContext?: LinkContext; notice?: ReactNode; runAction?: ReactNode;
  onEditCase?: (id: string) => void; onEditMemo?: () => void; onCloseRun?: () => void;
};

/** Both project and connected readers share this view. This component never writes Markdown. */
export function SmokeSheetReader(props: Props) {
  return <Sheet key={`${props.file.workspaceId}:${props.file.id}`} {...props} />;
}

function Sheet({ document: model, file, tabs, fileHref, onFileSelect, linkContext, snapshotContext, notice, runAction, onEditCase, onEditMemo, onCloseRun }: Props) {
  const { t } = useTranslation();
  const key = `${file.workspaceId}:${file.id}`;
  const [view, setView] = useState<ReadingState>(() => positions.get(key) ?? emptyState());
  const scroll = useRef<HTMLDivElement>(null);
  const latest = useRef(view); latest.current = view;
  useLayoutEffect(() => {
    const element = scroll.current!;
    element.scrollTop = latest.current.top; element.scrollLeft = latest.current.left;
    const save = () => {
      positions.delete(key);
      positions.set(key, { ...latest.current, top: element.scrollTop, left: element.scrollLeft });
      if (positions.size > 100) positions.delete(positions.keys().next().value!);
    };
    element.addEventListener("scroll", save);
    return () => { save(); element.removeEventListener("scroll", save); };
  }, [key]);
  const run = model.run;
  const frozen = model.kind === "smoke-run";
  const visible = useMemo(() => model.cases.filter(item => {
    const matches = frozen ? item.result === view.filter : item.lifecycle === view.filter;
    return (view.filter === "all" || matches) && model.source.slice(item.range.start, item.range.end).toLocaleLowerCase().includes(view.query.trim().toLocaleLowerCase());
  }), [model, frozen, view.query, view.filter]);
  const normal = { file: linkContext ? undefined : file, context: linkContext };
  const criteria = frozen ? { context: snapshotContext, unavailable: !snapshotContext } : normal;
  const sheetTabs = tabs?.length ? tabs : [{ id: file.id, title: model.title, number: run?.number ?? null, definition: !frozen, path: file.relativePath }];
  const rowKey = (item: SmokeCase) => model.valid ? item.id! : `${item.id}:${item.range.start}`;
  const toggle = (id: string) => setView(current => ({ ...current, expanded: current.expanded.includes(id) ? current.expanded.filter(value => value !== id) : [...current.expanded, id] }));
  return <section className="ak-smoke-sheet" aria-label={t(frozen ? "Smoke run sheet" : "Smoke definition sheet")}>
    <div className="ak-smoke-scroll ak-scroll-area" ref={scroll} tabIndex={0} aria-label={t("Test cases and notes")}>
      <div className="ak-smoke-overview">
        <div className="ak-smoke-heading" data-tour="smoke-overview"><h3>{frozen ? t("Run {{number}} · {{title}}", { number: run?.number ?? "?", title: model.title }) : t("Smoke definition")}</h3>
          {frozen ? <Badge variant={run?.state === "CLOSED" ? "outline" : "muted"}>{t(run?.state === "CLOSED" ? "Run closed" : run?.state === "OPEN" ? "Run open" : "Unknown run state")}</Badge> : <Badge variant="muted">{t("{{count}} test cases", { count: model.cases.length })}</Badge>}
          {frozen && model.cases.length > 0 && model.cases.every(item => item.result === "PASS") ? <Badge variant="success">{t("All cases passed")}</Badge> : null}
          {run?.state === "OPEN" && onCloseRun ? <Button variant="outline" size="sm" onClick={onCloseRun}>{t("Close run")}</Button> : null}
        </div>
        {run ? <dl className="ak-smoke-properties">
          <Property label={t("Test target")} value={run.target} /><Property label={t("Test environment")} value={run.environment} />
          <Property label={t("Created")} value={run.createdAt} />
          {run.closedAt ? <Property label={t("Run closed")} value={run.closedAt} /> : null}
          {run.closeReason ? <Property label={t("Closure note")} value={run.closeReason} /> : null}
        </dl> : null}
        {notice}
        {model.diagnostics.length ? <details className="ak-smoke-notice"><summary>{t("Some fields could not be read. Open Markdown to check the original.")}</summary>
          <ul>{model.diagnostics.map((issue, index) => <li key={index}><code>{issue.code}</code> · {t("Line {{line}}", { line: issue.range.startLine })}</li>)}</ul>
        </details> : null}
        {model.memo ? <div data-tour="smoke-notes"><Memo title={t(frozen ? "Run notes" : "Common notes")} section={model.memo} expanded={view.memo} onToggle={() => setView({ ...view, memo: !view.memo })} onEdit={onEditMemo} {...normal} /></div> : null}
        {frozen && model.common ? <Memo title={t("Common conditions at this run")} section={model.common} expanded={view.common} onToggle={() => setView({ ...view, common: !view.common })} {...criteria} /> : null}
      </div>
      <div className="ak-smoke-tools" data-tour="smoke-tools">
        <label className="ak-smoke-search"><Search aria-hidden="true" /><Input value={view.query} placeholder={t("Search test cases and records")} aria-label={t("Search test cases and records")} onChange={event => setView({ ...view, query: event.target.value })} /></label>
        <Select value={view.filter} onValueChange={filter => setView({ ...view, filter })}><SelectTrigger size="field" aria-label={t(frozen ? "Filter results" : "Filter test cases")}><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">{t("All")}</SelectItem>
          {frozen ? SMOKE_RESULTS.map(result => <SelectItem key={result} value={result}>{t(resultLabel[result])}</SelectItem>) : <><SelectItem value="ACTIVE">{t("Active test cases")}</SelectItem><SelectItem value="RETIRED">{t("Retired test cases")}</SelectItem></>}
        </SelectContent></Select>
        <span className="text-xs text-muted-foreground">{t("{{shown}} / {{total}} test cases", { shown: visible.length, total: model.cases.length })}</span>
        {model.counts ? <div className="ak-smoke-counts" aria-label={t("Run results")}>{SMOKE_RESULTS.map(result => <Badge key={result} variant={resultVariant[result]}>{t(resultLabel[result])} {model.counts![result]}</Badge>)}
          {model.counts.invalid ? <Badge variant="warning">{t("Unknown result")} {model.counts.invalid}</Badge> : null}</div> : null}
      </div>
      <table className={`ak-smoke-table ${frozen ? "ak-smoke-run-table" : ""}`}>
        <caption className="sr-only">{model.title}</caption>
        <thead data-tour="smoke-cases"><tr><th scope="col">{t("TC")}</th><th scope="col">{t("Title and revision")}</th><th scope="col">{t("Steps and expected result")}</th>{frozen ? <><th scope="col">{t("Result")}</th><th scope="col">{t("Test case notes")}</th></> : null}</tr></thead>
        <tbody>{visible.map(item => {
          const id = rowKey(item); const expanded = view.expanded.includes(id); const last = item.logs.at(-1);
          return <Fragment key={id}><tr data-smoke-case={item.id} className={expanded ? "ak-smoke-row-open" : ""}>
            <th scope="row"><Button size="sm" variant="ghost" aria-label={t("Details for {{id}}", { id: item.id ?? item.title })} aria-expanded={expanded} aria-controls={`smoke-case-${item.range.start}`} onClick={() => toggle(id)}>{expanded ? <ChevronDown /> : <ChevronRight />}{item.id ?? "—"}</Button></th>
            <td><button type="button" className="ak-smoke-case-title ak-focus-ring" onClick={() => toggle(id)} aria-expanded={expanded}>{item.title}</button><div className="ak-smoke-case-meta"><span>{t("Revision {{revision}}", { revision: item.revision ?? "?" })}</span>
              {item.lifecycle === "RETIRED" ? <Badge variant="muted">{t("Retired")}</Badge> : null}</div></td>
            <td><p className="ak-smoke-excerpt">{item.summary ?? item.expected?.content ?? "—"}</p></td>
            {frozen ? <><td>{onEditCase && item.id ? <button type="button" data-tour="smoke-result" className="ak-focus-ring rounded-sm" aria-label={t("Edit result for {{id}}", { id: item.id })} onClick={() => onEditCase(item.id!)}><Result result={item.result} /></button> : <Result result={item.result} />}</td><td><p className="ak-smoke-excerpt">{last?.memo?.content || "—"}</p><div className="flex items-center gap-2">{last ? <span className="ak-smoke-case-meta">{logLabel(last, t)}</span> : null}{onEditCase && item.id ? <Button variant="ghost" size="xs" aria-label={t("Edit notes for {{id}}", { id: item.id })} onClick={() => onEditCase(item.id!)}><Pencil /></Button> : null}</div></td></> : null}
          </tr>{expanded ? <tr className="ak-smoke-detail-row"><td colSpan={frozen ? 5 : 3}><div id={`smoke-case-${item.range.start}`} className="ak-smoke-detail">
            <SmokeCaseDetails item={item} frozen={frozen} criteria={criteria} normal={normal} />
          </div></td></tr> : null}</Fragment>;
        })}</tbody>
      </table>
      {!visible.length ? <p className="ak-smoke-empty" role="status">{t(model.cases.length ? "No matching test cases" : "No test cases found. Open Markdown to read the original.")}</p> : null}
    </div>
    <nav className="ak-smoke-tabs ak-scroll-area" data-tour="smoke-tabs" aria-label={t("Smoke sheets")}>
      {sheetTabs.map(tab => { const label = <>
        {tab.definition ? <ListChecks aria-hidden="true" /> : null}<span>{tab.definition ? t("Smoke definition") : t("Run {{number}} · {{title}}", { number: tab.number ?? "?", title: tab.title })}</span>
        {tab.duplicateNumber ? <Badge variant="warning">{t("Duplicate run number")}</Badge> : null}
      </>; return fileHref ? <NavigationLink className="ak-smoke-tab" key={tab.id} href={fileHref(tab.id)} onNavigate={() => onFileSelect?.(tab.id)} aria-current={tab.id === file.id ? "page" : undefined} title={tab.path}>{label}</NavigationLink>
        : <span className="ak-smoke-tab" key={tab.id} aria-current={tab.id === file.id ? "page" : undefined} title={tab.path}>{label}</span>; })}
      {runAction}
    </nav>
  </section>;
}

export type FragmentProps = { file?: ReaderFile; context?: LinkContext; unavailable?: boolean };
export function MarkdownFragment({ content, file, context, unavailable }: FragmentProps & { content: string }) {
  const { t } = useTranslation();
  const resources = useBrowserMarkdownComponents(file, context);
  const components = useMemo(() => unavailable ? { ...resources, a: (props: { href?: string; children?: ReactNode }) => /^(https?:|mailto:)/i.test(props.href ?? "")
    ? <a href={props.href} target="_blank" rel="noopener noreferrer">{props.children}</a>
    : <span title={t("Open the source project to follow this snapshot link.")}>{props.children} <code className="break-all">{props.href}</code></span> } : resources, [unavailable, resources, t]);
  return <MarkdownContent components={components} urlTransform={localLinkUrlTransform}>{content}</MarkdownContent>;
}
const MEMO_PREVIEW_HEIGHT = 80;

function Memo({ title, section, expanded, onToggle, onEdit, ...props }: FragmentProps & { title: string; section: SmokeSection; expanded: boolean; onToggle: () => void; onEdit?: () => void }) {
  const { t } = useTranslation();
  const contentId = useId();
  const content = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = content.current!;
    // Measure the unclipped content so expanding cannot hide its own collapse button.
    const measure = () => setOverflows(element.scrollHeight > MEMO_PREVIEW_HEIGHT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [section.content]);
  const collapsed = overflows && !expanded;
  return <section className="ak-smoke-memo"><header><h4>{title}</h4><div className="flex items-center gap-1">{onEdit ? <Button variant="ghost" size="xs" onClick={onEdit} aria-label={t("Edit sheet notes")}><Pencil />{t("Edit")}</Button> : null}{overflows ? <Button size="xs" variant="ghost" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle}>{t(expanded ? "Collapse notes" : "Expand notes")}</Button> : null}</div></header>
    <div id={contentId} className={collapsed ? "ak-smoke-memo-collapsed" : undefined} style={{ maxHeight: collapsed ? MEMO_PREVIEW_HEIGHT : undefined }}>
      <div className="ak-smoke-memo-content" ref={content}><MarkdownFragment content={section.content} {...props} /></div>
    </div></section>;
}
function Section({ title, section, ...props }: FragmentProps & { title: string; section: SmokeSection | null }) {
  return section && section.content.trim() ? <section><h5>{title}</h5><MarkdownFragment content={section.content} {...props} /></section> : null;
}
function Property({ label, value }: { label: string; value: string | null }) { return <div><dt>{label}</dt><dd>{value ?? "—"}</dd></div>; }
export function Result({ result }: { result: SmokeCase["result"] }) { const { t } = useTranslation(); return <Badge variant={result ? resultVariant[result] : "warning"}>{t(result ? resultLabel[result] : "Unknown result")}</Badge>; }
function logLabel(log: SmokeLog, t: (key: string, params?: Record<string, string>) => string) {
  if (log.kind === "USER_EDIT") return log.actor && normalizeDocumentOwner(log.actor) ? t("{{actor}} correction", { actor: log.actor }) : t("User correction");
  if (log.kind === "NOTE") return t("Notes updated");
  return t(log.method === "HUMAN" ? "Human execution" : log.method === "COMPUTER_USE" ? "Computer Use" : log.method === "BROWSER_USE" ? "Browser Use" : "Execution record");
}

export function SmokeCaseDetails({ item, frozen = true, criteria, normal }: { item: SmokeCase; frozen?: boolean; criteria: FragmentProps; normal: FragmentProps }) {
  const { t } = useTranslation();
  return <>
            <div className="ak-smoke-criteria"><h4>{t(frozen ? "Criteria at this run" : "Test case definition")}</h4>
              <Section title={t("Prerequisites")} section={item.prerequisites} {...criteria} /><Section title={t("Steps")} section={item.steps} {...criteria} /><Section title={t("Expected result")} section={item.expected} {...criteria} />
              {item.changeReason ? <p>{t("Revision note")}: {item.changeReason}</p> : null}
              {item.lifecycle === "RETIRED" ? <p>{t("Retirement note")}: {item.retirementReason} {item.retiredAt}</p> : null}
            </div>
            {frozen ? <div className="ak-smoke-history"><h4>{t("Execution and correction history")}</h4>{!item.logs.length ? <p className="text-muted-foreground">{t("No execution recorded")}</p> : item.logs.map((log, index) => <article key={`${log.id}:${index}`}>
              <header><strong>{logLabel(log, t)}</strong><span>{log.at}</span>{log.from ? <><Result result={log.from} /><span aria-label={t("Changed to")}>→</span></> : null}<Result result={log.to} /></header>
              {log.actor ? <p>{t("Recorded by")}: {log.actor}</p> : null}
              <Section title={t("Correction reason")} section={log.reason} {...normal} /><Section title={t("Observation and notes")} section={log.memo} {...normal} /><Section title={t("Evidence")} section={log.evidence} {...normal} />
            </article>)}</div> : null}
  </>;
}
