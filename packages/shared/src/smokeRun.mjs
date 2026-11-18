import { parseSmokeDocument, SMOKE_RESULTS } from "./smokeMarkdown.mjs";

const line = value => typeof value === "string" && value.trim() && value.length <= 2048 && !/[\r\n\u0000-\u001f\u007f]/.test(value);
const path = value => line(value) && !/[:\\]/.test(value) && value.split("/").every(part => part && part !== "." && part !== "..");

/** New file only. Preserve selected definitions; never copy an earlier run. */
export function createSmokeRun(source, options) {
  const model = parseSmokeDocument(source, "smoke");
  if (!model.valid || !model.format.writable || !model.documentId) throw new Error("Correct the smoke definition before creating a run.");
  if (![options.title, options.target, options.environment].every(line) || !path(options.sourcePath)
    || !Number.isSafeInteger(options.number) || options.number < 1) throw new Error("Enter a run name, test target and environment on single lines.");
  const selected = new Set(options.caseIds);
  const cases = model.cases.filter(item => selected.has(item.id));
  if (!cases.length || cases.length !== options.caseIds.length || cases.some(item => item.lifecycle !== "ACTIVE")) throw new Error("Select at least one active test case from the definition.");
  const normalize = text => text.replace(/\r\n/g, "\n");
  const blocks = cases.map(item => {
    const start = item.range.start, split = item.prerequisites.headingRange.start;
    const metadata = normalize(source.slice(start, split));
    const criteria = normalize(source.slice(split, item.range.end));
    return `${metadata.trimEnd()}\n\nResult: NOT_RUN\n\n${criteria}${criteria.endsWith("\n\n") ? "" : criteria.endsWith("\n") ? "\n" : "\n\n"}#### 기록\n\n`;
  });
  const header = [
    `# ${options.title.trim()}`, `Document-ID: ${options.documentId}`,
    ...(options.owner ? [`Owner: ${options.owner}`] : []),
    `Smoke-Document-ID: ${model.documentId}`, `Smoke-Title: ${model.title}`, `Smoke-Path: ${options.sourcePath}`,
    `Run: ${options.number}`, "Run-State: OPEN", `Target: ${options.target.trim()}`,
    `Environment: ${options.environment.trim()}`, `Created at: ${options.createdAt}`,
  ].join("\n\n");
  const common = normalize(model.memo.content);
  const output = `${header}\n\n## 메모\n\n## 실행 당시 공통 조건\n${common}${common.endsWith("\n\n") ? "" : "\n\n"}## Test Cases\n\n${blocks.join("")}`;
  const result = parseSmokeDocument(output, "smoke-run", { newRun: true });
  if (!result.valid || result.documentId === model.documentId || result.title !== options.title.trim()
    || result.owner !== (options.owner ?? null)) throw new Error("The new run could not be validated. Review the definition and run details.");
  return output;
}

/** Scoped, append-only user edits. A browser edit is never an execution record. */
export function updateSmokeDocument(source, kind, change, at) {
  const before = parseSmokeDocument(source, kind);
  if (!before.valid || !before.format.writable) throw new Error("Correct the smoke document before saving changes.");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const text = value => {
    if (typeof value !== "string" || value.length > 1_000_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("The note is too large or contains unsupported characters.");
    return value.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "").replace(/\n/g, eol);
  };
  const patches = [];
  const replaceField = (field, value) => patches.push({ ...field.range, value: field.raw.replace(/^([^:\r\n]+:[ \t]*)[^\r\n]*/, (_, prefix) => prefix + value) });
  let editedCase, logKind, logNumber;
  if (change.kind === "memo") {
    const value = text(change.memo);
    if (text(before.memo.content) === value) return source;
    patches.push({ ...before.memo.range, value: eol + value + eol + eol });
  } else if (change.kind === "case") {
    if (kind !== "smoke-run" || !SMOKE_RESULTS.includes(change.result)) throw new Error("Choose a valid run result.");
    editedCase = before.cases.find(item => item.id === change.caseId);
    if (!editedCase) throw new Error("The test case could not be found in this run.");
    const memo = text(change.memo), evidence = text(change.evidence), reason = text(change.reason ?? "");
    const actor = change.actor?.trim();
    if (actor && !line(actor)) throw new Error("Enter the recorded author on a single line.");
    const last = editedCase.logs.at(-1);
    if (change.result !== editedCase.result && !reason.trim()) throw new Error("Enter a reason for changing the result.");
    if (change.result === editedCase.result && !reason.trim() && memo === text(last?.memo?.content ?? "") && evidence === text(last?.evidence?.content ?? "")) return source;
    logKind = reason.trim() ? "USER_EDIT" : "NOTE";
    logNumber = last ? Number(last.id.slice(4)) + 1 : 1;
    if (!Number.isSafeInteger(logNumber)) throw new Error("The record number cannot be increased safely.");
    const log = [
      `##### LOG-${String(logNumber).padStart(3, "0")}`, `Kind: ${logKind}`, `At: ${at}`,
      ...(actor ? [`Actor: ${actor}`] : []), `From: ${editedCase.result}`, `To: ${change.result}`,
      "###### 메모", memo, "###### 증거", evidence,
      ...(logKind === "USER_EDIT" ? ["###### 수정 사유", reason] : []),
    ].join(eol + eol);
    const end = editedCase.records.range.end;
    const prefix = source.slice(0, end).endsWith(eol + eol) ? "" : source.slice(0, end).endsWith(eol) ? eol : eol + eol;
    patches.push({ start: end, end, value: prefix + log + (end === source.length ? source.match(/(?:\r\n|\n)*$/)[0] : eol + eol) });
    replaceField(editedCase.fields.find(field => field.name === "Result"), change.result);
  } else if (change.kind === "close") {
    if (kind !== "smoke-run" || before.run.state !== "OPEN") throw new Error("Only an open run can be closed.");
    if (!line(change.reason)) throw new Error("Enter a closure note on a single line.");
    const remaining = before.cases.filter(item => item.result === "NOT_RUN").map(item => item.id);
    const reason = change.reason.trim() + (remaining.length ? ` [NOT_RUN: ${remaining.join(", ")}]` : "");
    const state = before.fields.find(field => field.name === "Run-State");
    replaceField(state, "CLOSED");
    patches[0].value += `${eol}Closed at: ${at}${eol}${eol}Close reason: ${reason}${eol}`;
  } else throw new Error("Unknown smoke document change.");
  let result = source;
  for (const patch of patches.sort((a, b) => b.start - a.start)) result = result.slice(0, patch.start) + patch.value + result.slice(patch.end);
  const after = parseSmokeDocument(result, kind);
  // A note containing a structural heading must not inject extra cases or logs.
  if (!after.valid || after.documentId !== before.documentId || JSON.stringify(after.cases.map(item => item.id)) !== JSON.stringify(before.cases.map(item => item.id))) throw new Error("The note contains reserved Markdown structure. Put examples inside a code block.");
  if (editedCase) {
    const saved = after.cases.find(item => item.id === editedCase.id), last = saved.logs.at(-1);
    if (saved.logs.length !== editedCase.logs.length + 1 || last.kind !== logKind || last.id !== `LOG-${String(logNumber).padStart(3, "0")}`
      || last.to !== change.result || text(last.memo.content) !== text(change.memo) || text(last.evidence.content) !== text(change.evidence)
      || text(last.reason?.content ?? "") !== text(change.reason ?? "")) throw new Error("The note contains reserved Markdown structure. Put examples inside a code block.");
  }
  return result;
}
