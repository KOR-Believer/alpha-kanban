import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Columns2 } from "lucide-react";
import { compareSmokeRuns, smokeCriteria } from "@alpha-kanban/shared/smokeComparison";
import type { SmokeIndexEntry } from "@alpha-kanban/shared/smokeMarkdown";
import { browserRepository } from "../../browser/repository";
import { useTranslation } from "../../i18n";
import { errorSummary } from "../../i18n/errors";
import { TourButton, useScreenTour } from "../../onboarding/ScreenTour";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { CodeDiff } from "../CodeDiff";
import { MarkdownFragment, Result, SmokeCaseDetails, type FragmentProps } from "./SmokeSheetReader";
import { smokeSheetTabs, snapshotPath } from "./smokeSheets";
type Collection = Awaited<ReturnType<typeof browserRepository.smokeCollection>>;

export function SmokeComparison({ workspaceId, fileId }: { workspaceId: string; fileId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [data, setData] = useState<Collection>(), [error, setError] = useState<Error>();
  const [leftId, setLeftId] = useState(""), [rightId, setRightId] = useState("");
  const [changesOnly, setChangesOnly] = useState(false), [expanded, setExpanded] = useState<string[]>([]);
  const request = useRef(0);
  const tourContainer = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("smoke-compare", { enabled: open && Boolean(data) && !error, eligible: false, scope: `${workspaceId}:${fileId}:${leftId}:${rightId}`, container: tourContainer });
  useEffect(() => () => { request.current++; }, []);
  const load = async () => {
    const attempt = ++request.current; setOpen(true); setData(undefined); setError(undefined); setExpanded([]); setChangesOnly(false);
    try {
      const next = await browserRepository.smokeCollection(workspaceId);
      if (attempt !== request.current) return;
      const runs = candidates(next, fileId);
      const index = runs.findIndex(run => run.localId === fileId);
      const right = index > 0 ? index : index === 0 ? 1 : runs.length - 1;
      setLeftId(runs[Math.max(0, right - 1)]?.localId ?? ""); setRightId(runs[right]?.localId ?? ""); setData(next);
    } catch (cause) { if (attempt === request.current) setError(cause instanceof Error ? cause : new Error(String(cause))); }
  };
  const runs = useMemo(() => data ? candidates(data, fileId) : [], [data, fileId]);
  const left = runs.find(run => run.localId === leftId), right = runs.find(run => run.localId === rightId);
  const definition = data?.entries.find(entry => entry.localId === data.index.runs.find(run => run.localId === leftId)?.sourceLocalId)?.document;
  const comparison = useMemo(() => left?.document && right?.document && left !== right ? compareSmokeRuns(left.document, right.document, definition) : undefined, [left, right, definition]);
  const title = (entry: SmokeIndexEntry) => t("Run {{number}} · {{title}}", { number: entry.document!.run!.number!, title: entry.document!.title });
  const normal = (entry: SmokeIndexEntry): FragmentProps => ({ file: data?.files.find(file => file.id === entry.localId) });
  // The same local resource loader supports a frozen path without changing the run's identity.
  const criteria = (entry: SmokeIndexEntry): FragmentProps => {
    const file = data?.files.find(file => file.id === entry.localId), path = snapshotPath(entry.document!);
    return file && path ? { file: { ...file, relativePath: path }, context: contexts[entry.localId] ? { ...contexts[entry.localId]!, path } : undefined, unavailable: !contexts[entry.localId] } : { unavailable: true };
  };
  const [contexts, setContexts] = useState<Record<string, Awaited<ReturnType<typeof browserRepository.linkContext>>>>({});
  useEffect(() => {
    let cancelled = false; setContexts({});
    if (open && left && right) void Promise.all([left, right].map(async entry => [entry.localId, await browserRepository.linkContext(workspaceId, entry.localId)] as const)).then(values => { if (!cancelled) setContexts(Object.fromEntries(values)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, left, right, workspaceId]);
  const rows = comparison?.rows.filter(row => !changesOnly || row.different) ?? [];
  return <>
    <Button data-tour="smoke-compare" size="sm" variant="ghost" className="shrink-0 self-center" onClick={() => void load()}><Columns2 />{t("Compare runs")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) request.current++; setOpen(value); }}>
      <DialogContent ref={tourContainer} className="ak-smoke-compare-dialog grid-rows-[auto_minmax(0,1fr)_auto]" onEscapeKeyDown={event => { if (tour.active) event.preventDefault(); }}>
        <DialogHeader className="pr-12"><DialogTitle>{t("Compare runs")}</DialogTitle><DialogDescription>{t("Compare the results, observations and criteria saved in two runs.")}</DialogDescription><TourButton tour={tour} labelKey="Tour this dialog" /></DialogHeader>
        <DialogBody className="ak-smoke-compare-body">
          {error ? <p role="alert">{errorSummary(error)}</p> : !data ? <p role="status">{t("Loading documents")}</p> : runs.length < 2 ? <p>{t("Two linked run records are needed to compare.")}</p> : <>
            <div className="ak-smoke-compare-controls" data-tour="smoke-compare-controls">{[{ id: leftId, set: setLeftId, label: "First run" }, { id: rightId, set: setRightId, label: "Second run" }].map(({ id, set, label }) => <label key={label} className="grid min-w-0 gap-1 text-sm">{t(label)}<Select value={id} onValueChange={value => { set(value); setExpanded([]); }}><SelectTrigger size="field" aria-label={t(label)}><SelectValue /></SelectTrigger><SelectContent>{runs.map(run => <SelectItem key={run.localId} value={run.localId}>{title(run)}</SelectItem>)}</SelectContent></Select></label>)}
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={changesOnly} onCheckedChange={checked => setChangesOnly(Boolean(checked))} />{t("Differences only")}</label>
            </div>
            {leftId === rightId ? <p role="status">{t("Choose two different runs.")}</p> : comparison && left && right ? <div className="ak-smoke-compare-scroll ak-scroll-area" tabIndex={0} aria-label={t("Run comparison")}>
              <div className="ak-smoke-compare-context" data-tour="smoke-compare-context">
                {!comparison.currentDefinitionAvailable ? <p className="text-sm text-muted-foreground">{t("The current definition is unavailable. Current retirement status is unknown.")}</p> : null}
                <details><summary>{t(comparison.commonChanged ? "Common conditions differ" : "Common conditions match")}</summary><CodeDiff before={left.document!.common!.content} after={right.document!.common!.content} beforeLabel={title(left)} afterLabel={title(right)} /></details>
                <details><summary>{t(comparison.memoChanged ? "Run notes differ" : "Run notes match")}</summary><div className="ak-smoke-compare-pair">{[left, right].map(run => <section key={run.localId}><h4>{title(run)}</h4><MarkdownFragment content={run.document!.memo!.content} {...normal(run)} /></section>)}</div></details>
              </div>
              <table className="ak-smoke-compare-table"><caption className="sr-only">{t("Run comparison")}</caption><thead data-tour="smoke-compare-cases"><tr><th scope="col">{t("TC")}</th>{[left, right].map(run => <th key={run.localId} scope="col"><span>{title(run)}</span><small>{run.document!.run!.target} · {run.document!.run!.environment}</small></th>)}</tr></thead><tbody>{rows.map(row => <Fragment key={row.id}>
                <tr><th scope="row"><Button variant="ghost" size="sm" aria-label={t("Compare {{id}} details", { id: row.id })} aria-expanded={expanded.includes(row.id)} onClick={() => setExpanded(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}>{row.id}</Button><div className="ak-smoke-case-meta">
                  {row.currentLifecycle === "RETIRED" ? <Badge variant="muted">{t("Currently retired")}</Badge> : null}
                  {row.revisionChanged ? <Badge variant="warning">{t("Revision differs")}</Badge> : row.criteriaChanged ? <Badge variant="warning">{t("Criteria text differs")}</Badge> : null}
                  {row.resultChanged ? <Badge variant="outline">{t("Result differs")}</Badge> : null}
                  {row.notesChanged || row.historyChanged ? <Badge variant="outline">{t("Notes or history differ")}</Badge> : null}
                </div></th>{[row.left, row.right].map((item, i) => <td key={i}>{item ? <><strong>{item.title}</strong><div className="ak-smoke-case-meta"><span>{t("Revision {{revision}}", { revision: item.revision! })}</span><Result result={item.result} /></div><p className="ak-smoke-excerpt">{item.logs.at(-1)?.memo?.content ?? ""}</p></> : <span className="text-muted-foreground">{t("Not included in this run")}</span>}</td>)}</tr>
                {expanded.includes(row.id) ? <tr className="ak-smoke-detail-row"><td><p className="text-xs text-muted-foreground">{t("Criteria and history at each run")}</p></td>{[row.left, row.right].map((item, i) => <td key={i}>{item ? <div className="ak-smoke-detail ak-smoke-comparison-detail"><SmokeCaseDetails item={item} criteria={criteria(i ? right : left)} normal={normal(i ? right : left)} /></div> : <p>{t("Not included in this run")}</p>}</td>)}</tr> : null}
                {expanded.includes(row.id) && row.left && row.right && row.criteriaChanged ? <tr><td colSpan={3}><CodeDiff label={t("Criteria differences")} before={smokeCriteria(left.document!, row.left)} after={smokeCriteria(right.document!, row.right)} beforeLabel={title(left)} afterLabel={title(right)} /></td></tr> : null}
              </Fragment>)}</tbody></table>
              {!rows.length ? <p className="ak-smoke-empty">{t("No differing test cases")}</p> : null}
            </div> : null}
          </>}
        </DialogBody>
        <DialogFooter><Button data-tour="smoke-compare-back" variant="outline" onClick={() => { request.current++; setOpen(false); }}>{t("Back to sheet")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
function candidates(data: Collection, currentId: string) {
  const ids = new Set(smokeSheetTabs(currentId, data.index, data.entries).filter(tab => !tab.definition).map(tab => tab.id));
  return data.entries.filter(entry => ids.has(entry.localId) && entry.document?.valid).sort((a, b) => (a.document!.run!.number! - b.document!.run!.number!) || a.path.localeCompare(b.path));
}
