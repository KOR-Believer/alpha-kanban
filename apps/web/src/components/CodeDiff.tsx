import { useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import { useTranslation } from "../i18n";
import { Button } from "./ui/button";

type Line = { number: number; text: string; ending: "LF" | "CRLF" | "none" };
export type DiffRow = { before?: Line; after?: Line; changed: boolean };
type Group = { changed: boolean; rows: DiffRow[] };
const PAGE = 200;

export function codeDiff(before: string, after: string) {
  // A bounded exact comparison: on a very large edit, show the whole replacement.
  const changes = diffLines(before, after, { timeout: 300, maxEditLength: 10_000 }) ??
    [{ removed: true, added: false, value: before }, { removed: false, added: true, value: after }];
  const groups: Group[] = [];
  let oldLine = 1, newLine = 1, added = 0, removed = 0;
  const lines = (value: string, old: boolean): Line[] => (value.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((raw) => ({
    number: old ? oldLine++ : newLine++, text: raw.replace(/\r?\n$/, ""),
    ending: raw.endsWith("\r\n") ? "CRLF" : raw.endsWith("\n") ? "LF" : "none",
  }));
  for (let i = 0; i < changes.length;) {
    const change = changes[i]!;
    if (!change.added && !change.removed) {
      const left = lines(change.value, true), right = lines(change.value, false);
      groups.push({ changed: false, rows: left.map((line, index) => ({ before: line, after: right[index], changed: false })) });
      i++; continue;
    }
    const left: Line[] = [], right: Line[] = [];
    while (i < changes.length && (changes[i]!.added || changes[i]!.removed)) {
      const part = changes[i++]!;
      if (part.removed) left.push(...lines(part.value, true));
      else right.push(...lines(part.value, false));
    }
    removed += left.length; added += right.length;
    groups.push({ changed: true, rows: Array.from({ length: Math.max(left.length, right.length) }, (_, index) => ({ before: left[index], after: right[index], changed: true })) });
  }
  return { groups, added, removed };
}

export function CodeDiff({ before, after, label }: { before: string; after: string; label?: string }) {
  const { t, i18n } = useTranslation();
  const diff = useMemo(() => codeDiff(before, after), [before, after]);
  const [expanded, setExpanded] = useState<Record<number, number>>({});
  useEffect(() => setExpanded({}), [before, after]);
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  function cell(line: Line | undefined, side: "before" | "after", changed: boolean) {
    return <div className="ak-diff-cell" data-side={side} data-change={line && changed ? side === "before" ? "removed" : "added" : undefined} data-empty={!line || undefined}>
      {line ? <><span className="ak-diff-number" aria-label={t("Line {{line}}", { line: line.number })}>{line.number}</span>
        <span className="ak-diff-sign" aria-label={changed ? t(side === "before" ? "Removed line" : "Added line") : undefined}>{changed ? side === "before" ? "−" : "+" : " "}</span>
        <code>{line.text || "\u00a0"}{line.ending === "none" ? <span className="ak-diff-eof">{t("No newline at end of file")}</span> : null}</code></> : null}
    </div>;
  }
  function row(item: DiffRow, key: number) {
    return <div className="ak-diff-row" data-context={!item.changed || undefined} key={key}>{cell(item.before, "before", item.changed)}{cell(item.after, "after", item.changed)}</div>;
  }
  function more(group: number, remaining: number, unchanged: boolean) {
    return <Button key="more" variant="ghost" size="sm" className="ak-diff-expand" onClick={() => setExpanded((value) => ({ ...value, [group]: (value[group] ?? 0) + PAGE }))}>
      {t(unchanged ? "Show {{count}} unchanged lines" : "Show {{count}} more changed lines", { count: Math.min(PAGE, remaining) })}
    </Button>;
  }
  return <div className="ak-code-diff" aria-label={label ?? t("Document changes")}>
    <div className="ak-diff-summary" aria-label={t("{{added}} lines added, {{removed}} lines removed", { added: number(diff.added), removed: number(diff.removed) })}>
      <span className="text-[var(--ak-success)]">+{number(diff.added)}</span><span className="text-destructive">−{number(diff.removed)}</span>
    </div>
    <div className="ak-diff-head"><span>{t("Before")}</span><span>{t("After")}</span><span>{t("Changes")}</span></div>
    {diff.groups.map((group, index) => {
      if (group.changed) {
        const limit = PAGE + (expanded[index] ?? 0);
        return <div key={index}>{group.rows.slice(0, limit).map(row)}{group.rows.length > limit ? more(index, group.rows.length - limit, false) : null}</div>;
      }
      const head = index > 0 ? 3 : 0, tail = index < diff.groups.length - 1 ? 3 : 0;
      const hidden = group.rows.length - head - tail;
      if (hidden <= 0) return <div key={index}>{group.rows.map(row)}</div>;
      const revealed = Math.min(hidden, expanded[index] ?? 0);
      return <div key={index}>{group.rows.slice(0, head + revealed).map(row)}
        {hidden > revealed ? more(index, hidden - revealed, true) : null}
        {tail ? group.rows.slice(-tail).map((item, offset) => row(item, group.rows.length - tail + offset)) : null}
      </div>;
    })}
  </div>;
}
