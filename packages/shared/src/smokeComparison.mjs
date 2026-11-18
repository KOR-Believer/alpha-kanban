const normalize = value => (value ?? "").replace(/\r\n/g, "\n");
export function smokeCriteria(document, item) {
  const result = item.fields.find(field => field.name === "Result"), end = item.records?.headingRange.start ?? item.range.end;
  const text = result ? document.source.slice(item.range.start, result.range.start) + document.source.slice(result.range.end, end)
    : document.source.slice(item.range.start, end);
  return normalize(text);
}

/** Compare frozen runs only; a present-day definition supplies lifecycle labels. */
export function compareSmokeRuns(left, right, definition) {
  if (![left, right].every(document => document.kind === "smoke-run" && document.valid)
    || left.documentId === right.documentId || left.run.sourceId !== right.run.sourceId) throw new Error("Choose two different valid runs of the same smoke definition.");
  const current = definition?.kind === "smoke" && definition.valid && definition.documentId === left.run.sourceId ? definition : null;
  const a = new Map(left.cases.map(item => [item.id, item])), b = new Map(right.cases.map(item => [item.id, item]));
  const currentCases = new Map(current?.cases.map(item => [item.id, item]) ?? []);
  const commonChanged = normalize(left.common.content) !== normalize(right.common.content);
  const memoChanged = normalize(left.memo.content) !== normalize(right.memo.content);
  const rows = [...new Set([...a.keys(), ...b.keys()])].map(id => {
    const first = a.get(id) ?? null, second = b.get(id) ?? null, currentCase = currentCases.get(id);
    const missing = !first || !second;
    const revisionChanged = !missing && first.revision !== second.revision;
    const criteriaChanged = !missing && smokeCriteria(left, first) !== smokeCriteria(right, second);
    const resultChanged = !missing && first.result !== second.result;
    const notes = item => JSON.stringify([normalize(item.logs.at(-1)?.memo?.content), normalize(item.logs.at(-1)?.evidence?.content)]);
    const notesChanged = !missing && notes(first) !== notes(second);
    const historyChanged = !missing && normalize(first.records.content) !== normalize(second.records.content);
    return { id, left: first, right: second, currentLifecycle: currentCase?.lifecycle ?? null,
      revisionChanged, criteriaChanged, resultChanged, notesChanged, historyChanged,
      different: missing || revisionChanged || criteriaChanged || resultChanged || notesChanged || historyChanged || commonChanged };
  });
  return { rows, commonChanged, memoChanged, currentDefinitionAvailable: Boolean(current) };
}
