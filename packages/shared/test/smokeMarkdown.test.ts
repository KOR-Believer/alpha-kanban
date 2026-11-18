import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseSmokeDocument, buildSmokeIndex, smokeFileKind, type SmokeKind, type SmokeIndexEntry } from "../src/smokeMarkdown.mjs";
import { smokeSource, smokeFirstRun, smokeSecondRun, smokeSourceId, emptySmokeRun } from "./smokeFixtures";
import { inferMarkdownFileType, inferSlug } from "../src/documents";

const parseRun = (source = smokeSecondRun) => parseSmokeDocument(source, "smoke-run");
const errors = (source: string, kind: SmokeKind = "smoke-run") => parseSmokeDocument(source, kind).diagnostics.map(item => item.code);
const entry = (localId: string, source: string, kind: SmokeKind, projectId = "project"): SmokeIndexEntry => ({ projectId, localId, path: `${localId}.md`, document: parseSmokeDocument(source, kind) });

describe("reviewed smoke Markdown contract", () => {
  it("reads frozen definitions, partial close and post-close corrections independently of the current source", () => {
    const definition = parseSmokeDocument(smokeSource, "smoke"), first = parseRun(smokeFirstRun), second = parseRun();
    for (const document of [definition, first, second]) expect(document.diagnostics).toEqual([]);
    expect(definition.cases.map(row => [row.id, row.revision, row.lifecycle])).toEqual([["TC-001", 2, "ACTIVE"], ["TC-002", 1, "RETIRED"], ["TC-003", 1, "ACTIVE"]]);
    expect(definition.counts).toBeNull(); expect(definition.owner).toBeNull();
    expect(first.cases[0]?.revision).toBe(1); expect(first.cases[1]?.lifecycle).toBe("ACTIVE");
    expect(first.counts?.PASS).toBe(2);
    expect(second.run?.state).toBe("CLOSED"); expect(second.counts).toMatchObject({ PASS: 1, NOT_RUN: 1, invalid: 0 });
    expect(second.cases[0]?.logs.map(log => [log.kind, log.from, log.to])).toEqual([["EXECUTION", "NOT_RUN", "FAIL"], ["USER_EDIT", "FAIL", "PASS"]]);
    expect(second.cases[0]?.logs[0]?.memo?.content).toContain("검색 직후");
    expect(second.cases[0]?.logs[1]?.actor).toBe("@bob"); expect(second.owner).toBe("@alice");
    expect(second.cases[0]?.logs[1]?.at! > second.run!.closedAt!).toBe(true);
    expect(second.common?.content).toBe(definition.memo?.content);
    expect(second.common?.content).not.toBe(first.common?.content);
    expect(parseRun(smokeSecondRun.replace("Actor: @bob\n\n", "")).cases[0]?.logs[1]?.actor).toBeNull();
  });

  it("starts a new run without results or records and does not infer closure from all PASS", () => {
    const fresh = parseSmokeDocument(emptySmokeRun(), "smoke-run", { newRun: true });
    expect(fresh.diagnostics).toEqual([]); expect(fresh.counts?.NOT_RUN).toBe(2);
    expect(fresh.cases.every(row => row.logs.length === 0)).toBe(true);
    const completedButOpen = smokeFirstRun.replace("Run-State: CLOSED", "Run-State: OPEN").replace(/^Closed at:.*\n\n/m, "").replace(/^Close reason:.*\n\n/m, "");
    expect(parseRun(completedButOpen)).toMatchObject({ valid: true, run: { state: "OPEN" }, counts: { PASS: 2 } });
    expect(parseSmokeDocument(completedButOpen, "smoke-run", { newRun: true }).diagnostics.map(d => d.code)).toContain("NEW_RUN_RESULTS");
  });

  it.each(["HUMAN", "COMPUTER_USE", "BROWSER_USE"])("records actual %s attempts without inventing an actor or evidence", method => {
    const observation = `##### LOG-001\n\nKind: EXECUTION\n\nAt: 2026-11-10T14:00:00+09:00\n\nMethod: ${method}\n\nFrom: NOT_RUN\n\nTo: BLOCKED\n\n###### 메모\n\n권한창을 열지 못해 확인하지 못했다.\n\n###### 증거\n\n`;
    const text = emptySmokeRun().replace("Result: NOT_RUN", "Result: BLOCKED").replace("#### 기록\n\n", "#### 기록\n\n" + observation);
    const parsed = parseRun(text);
    expect(parsed.diagnostics).toEqual([]); expect(parsed.counts?.BLOCKED).toBe(1);
    expect(parsed.cases[0]?.logs[0]).toMatchObject({ actor: null, method, evidence: { content: "\n" } });
  });

  it.each([["NOTE", "NOT_RUN"], ["USER_EDIT", "SKIPPED"]])("keeps %s separate from execution", (kind, to) => {
    const record = `##### LOG-001\n\nKind: ${kind}\n\nAt: 2026-11-10T14:00:00+09:00\n\nFrom: NOT_RUN\n\nTo: ${to}\n\n###### 메모\n\n준비 메모\n\n###### 증거\n\n${kind === "USER_EDIT" ? "###### 수정 사유\n\n이번 회차 범위에서 제외한다.\n\n" : ""}`;
    const parsed = parseRun(emptySmokeRun().replace("Result: NOT_RUN", `Result: ${to}`).replace("#### 기록\n\n", "#### 기록\n\n" + record));
    expect(parsed.diagnostics).toEqual([]); expect(parsed.cases[0]?.logs[0]?.method).toBeNull();
  });

  it("ignores fake TC/LOG/field syntax in fences, quotes, lists, code and HTML, retaining arbitrary Markdown", () => {
    const decoys = "```md\n### TC-999. Fake\nResult: PASS\n```\n\n> ### TC-998. Quoted\n> Result: PASS\n\n> ```md\n> ### TC-997. Fenced quote\n> ```\n\n- ### TC-996. Listed\n\n    ### TC-995. Indented code\n\n<!--\n### TC-994. HTML comment\n-->\n\n";
    const text = smokeSecondRun.replace("## Test Cases", decoys + "### 1. 자유 제목\n\n메모 본문\n\n## Test Cases").replace("#### 사전조건", "#### 사전조건\n\nResult: FAIL\n\n### 일반 메모\n\n| 문구 | 값 |\n| --- | --- |\n| Result | UNKNOWN |\n");
    const parsed = parseRun(text);
    expect(parsed.diagnostics).toEqual([]); expect(parsed.cases).toHaveLength(2);
    expect(parsed.cases[0]?.result).toBe("PASS"); expect(parsed.source).toBe(text);
    expect(parsed.cases[0]?.prerequisites?.content).toContain("### 일반 메모");
  });

  it("does not interpret a multiline inline comment/code as metadata", () => {
    for (const blocker of ["Extra: <!--\nRevision: 99\n-->\n", "Extra: `example\nRevision: 99\n`\n"]) {
      const text = smokeSource.replace("Revision: 2", blocker + "\nRevision: 2");
      const parsed = parseSmokeDocument(text, "smoke");
      expect(parsed.cases[0]?.revision).toBeNull();
      expect(parsed.diagnostics.map(d => d.code)).toContain("MISSING_FIELD");
    }
  });

  it("preserves BOM, CRLF, unknown fields and exact offsets for later guarded edits", () => {
    const text = "\uFEFF" + smokeSecondRun.replace("Summary:", "Future-field: Ω 한글\n\nSummary:").replaceAll("\n", "\r\n");
    const parsed = parseRun(text); expect(parsed.diagnostics).toEqual([]); expect(parsed.source).toBe(text);
    for (const field of [...parsed.fields, ...parsed.cases.flatMap(row => [...row.fields, ...row.logs.flatMap(log => log.fields)])]) expect(text.slice(field.range.start, field.range.end)).toBe(field.raw);
    for (const section of [...parsed.sections, ...parsed.cases.flatMap(row => [...row.sections, ...row.logs.flatMap(log => log.sections)])]) expect(text.slice(section.range.start, section.range.end)).toBe(section.content);
    expect(parsed.cases[0]?.fields.find(field => field.name === "Future-field")?.value).toBe("Ω 한글");
    expect(parseRun(text.replace("\r\n", "\n")).diagnostics.map(d => d.code)).toContain("MIXED_LINE_ENDINGS");
  });

  it.each([
    ["unknown result", (s: string) => s.replace("Result: PASS", "Result: SUCCESS"), "INVALID_VALUE"],
    ["unknown method", (s: string) => s.replace("Method: BROWSER_USE", "Method: AUTOMATED_TEST"), "INVALID_VALUE"],
    ["chain", (s: string) => s.replace("From: FAIL", "From: NOT_RUN"), "LOG_CHAIN"],
    ["current mismatch", (s: string) => s.replace("Result: PASS", "Result: FAIL"), "RESULT_HISTORY_MISMATCH"],
    ["missing method", (s: string) => s.replace("Method: BROWSER_USE\n\n", ""), "MISSING_FIELD"],
    ["missing reason", (s: string) => s.replace(/###### 수정 사유[\s\S]*?(?=### TC-003)/, ""), "MISSING_EDIT_REASON"],
    ["note changes result", (s: string) => s.replace("Kind: USER_EDIT", "Kind: NOTE"), "NOTE_RESULT_CHANGE"],
    ["close missing", (s: string) => s.replace(/^Closed at:.*\n\n/m, ""), "MISSING_FIELD"],
    ["open with close", (s: string) => s.replace("Run-State: CLOSED", "Run-State: OPEN"), "UNEXPECTED_FIELD"],
    ["duplicate field", (s: string) => s.replace("Revision: 2", "Revision: 2\n\nRevision: 1"), "DUPLICATE_FIELD"],
    ["unknown duplicate field", (s: string) => s.replace("Revision: 2", "Revision: 2\n\nFuture: a\n\nFuture: b"), "DUPLICATE_FIELD"],
    ["duplicate TC", (s: string) => s.replace("### TC-003.", "### TC-001."), "DUPLICATE_TC_ID"],
    ["duplicate log", (s: string) => s.replace("##### LOG-002", "##### LOG-001"), "INVALID_LOG_ID"],
    ["bad UUID", (s: string) => s.replace("Document-ID: 33333333-3333-4333-8333-333333333333", "Document-ID: d_browser"), "INVALID_VALUE"],
    ["missing UUID", (s: string) => s.replace(/^Document-ID:.*\n\n/m, ""), "MISSING_FIELD"],
    ["unknown format", (s: string) => s.replace("## 메모", "Ledger-Format: 999\n\n## 메모"), "UNSUPPORTED_FORMAT"],
    ["bad source path", (s: string) => s.replace("Smoke-Path: docs/basic/01_notes_smoke.md", "Smoke-Path: ../other/01_notes_smoke.md"), "INVALID_VALUE"],
    ["bad date", (s: string) => s.replace(/Created at:.*/, "Created at: 2026-02-30T10:00:00Z"), "INVALID_VALUE"],
    ["unclosed fence", (s: string) => s + "\n```md\nUnclosed\n", "UNCLOSED_FENCE"],
    ["unclosed comment", (s: string) => s + "\n<!-- Unclosed\n", "UNCLOSED_COMMENT"],
  ] as const)("reports %s while preserving the readable source", (_name, transform, code) => {
    const text = transform(smokeSecondRun), parsed = parseRun(text);
    expect(parsed.valid).toBe(false); expect(errors(text)).toContain(code); expect(parsed.source).toBe(text);
  });

  it("isolates definition-only and lifecycle errors, rather than deleting fields or changing results", () => {
    expect(errors(smokeSource.replace("Revision: 2", "Revision: 2\n\nResult: PASS"), "smoke")).toContain("UNEXPECTED_FIELD");
    expect(errors(smokeSource.replace("Lifecycle: RETIRED", "Lifecycle: ACTIVE"), "smoke")).toContain("UNEXPECTED_FIELD");
    expect(errors(smokeSource.replace(/^Retirement reason:.*\n\n/m, ""), "smoke")).toContain("MISSING_FIELD");
    expect(parseRun(smokeSecondRun.replace("Result: PASS", "Result: SUCCESS")).counts).toMatchObject({ invalid: 1, PASS: 0, NOT_RUN: 1 });
  });

  it("retains different criteria and common context even when revision numbers agree", () => {
    const first = parseRun(smokeFirstRun), second = parseRun(smokeSecondRun.replace("Revision: 2", "Revision: 1"));
    expect(second.valid).toBe(true); expect(first.cases[0]?.revision).toBe(second.cases[0]?.revision);
    expect(first.cases[0]?.expected?.content).not.toBe(second.cases[0]?.expected?.content);
    expect(first.common?.content).not.toBe(second.common?.content);
  });

  it.each(["smoke", "smoke_run", "plan", "tickets", "inventory", "markdown"])("recognizes %s filenames without changing the slug", suffix => {
    const filename = suffix === "markdown" ? "08_notes.md" : `08_notes_${suffix}.md`;
    expect(inferMarkdownFileType(filename)).toBe(suffix === "smoke_run" ? "smoke-run" : suffix);
    expect(inferSlug(filename)).toBe("notes");
    expect(smokeFileKind(filename)).toBe(suffix === "smoke" ? "smoke" : suffix === "smoke_run" ? "smoke-run" : null);
  });
});

describe("project-scoped smoke identities", () => {
  const entries = () => [entry("source", smokeSource, "smoke"), entry("first", smokeFirstRun, "smoke-run"), entry("second", smokeSecondRun, "smoke-run")];
  it("links multiple rounds by UUID across folders and titles, including standalone suites", () => {
    const input = entries(); input[2]!.path = "elsewhere/different_name_smoke_run.md";
    const index = buildSmokeIndex(input);
    expect(index.definitions[0]?.runLocalIds).toEqual(["first", "second"]);
    expect(index.runs.map(run => run.status)).toEqual(["linked", "linked"]);
  });
  it("keeps orphan runs readable and refuses a same-title source with a different ID", () => {
    const input = entries().slice(1);
    expect(buildSmokeIndex(input).runs.every(run => run.status === "orphan")).toBe(true);
    input.push(entry("different", smokeSource.replace(smokeSourceId, "44444444-4444-4444-8444-444444444444"), "smoke"));
    expect(buildSmokeIndex(input).runs.every(run => run.status === "orphan")).toBe(true);
    expect(input[0]?.document?.cases[0]?.revision).toBe(1);
  });
  it("isolates duplicate UUIDs to the connected project, including collisions with ordinary Markdown", () => {
    const input = entries();
    input.push(entry("other-source", smokeSource, "smoke", "other-project"));
    expect(buildSmokeIndex(input).duplicates).toEqual([]);
    input.push({ projectId: "project", localId: "plain", path: "anything.md", documentId: smokeSourceId });
    const index = buildSmokeIndex(input);
    expect(index.runs.every(run => run.status === "ambiguous" && run.sourceLocalId === null)).toBe(true);
    expect(index.definitions.find(d => d.projectId === "other-project")?.duplicate).toBe(false);
  });
  it("does not combine duplicate run IDs or duplicate numbers", () => {
    const input = entries(); input.push(entry("same-id", smokeSecondRun, "smoke-run"));
    expect(buildSmokeIndex(input).runs.find(run => run.localId === "second")?.status).toBe("ambiguous");
    const number = entries(); number[2] = entry("second", smokeSecondRun.replace("Run: 2", "Run: 1"), "smoke-run");
    expect(buildSmokeIndex(number).runs.map(run => [run.status, run.duplicateNumber])).toEqual([["linked", true], ["linked", true]]);
  });
  it("does not use another run as the definition or search another project", () => {
    const input = entries().slice(1); input[0]!.projectId = "elsewhere";
    expect(buildSmokeIndex(input).runs.every(run => run.status === "orphan")).toBe(true);
    input[1] = entry("wrong", smokeSecondRun.replace(smokeSourceId, "22222222-2222-4222-8222-222222222222"), "smoke-run", "elsewhere");
    expect(buildSmokeIndex(input).runs.find(run => run.localId === "wrong")?.status).toBe("wrong-type");
  });
});

it("ships the same checker as a standalone read-only Node script without repository dependencies", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "ak-smoke-check-"));
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    await cp(path.join(root, "skills/implementation-ledger/scripts/check-smoke.mjs"), path.join(folder, "check.mjs"));
    await writeFile(path.join(folder, "01_notes_smoke.md"), smokeSource);
    await writeFile(path.join(folder, "02_notes_smoke_run.md"), smokeSecondRun);
    const args = ["--json", "01_notes_smoke.md", "02_notes_smoke_run.md"];
    const run = (script: string, extra: string[] = []) => spawnSync(process.execPath, [script, ...extra, ...args], { cwd: folder, encoding: "utf8" });
    const bundled = run("check.mjs"), native = run(path.join(root, "scripts/check-smoke.mjs"));
    expect(bundled.status).toBe(0); expect(native.status).toBe(0);
    expect(JSON.parse(bundled.stdout)).toEqual(JSON.parse(native.stdout));
    expect(JSON.parse(bundled.stdout).relations.runs[0].status).toBe("linked");
    const newRun = run("check.mjs", ["--new-run"]);
    expect(newRun.status).toBe(1); expect(JSON.parse(newRun.stdout).files[1].diagnostics.some((d: { code: string }) => d.code === "NEW_RUN_RESULTS")).toBe(true);
    await writeFile(path.join(folder, "02_notes_smoke_run.md"), smokeSecondRun.replace("Result: PASS", "Result: UNKNOWN"));
    const invalid = run("check.mjs"); expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).files[1].diagnostics.some((d: { code: string }) => d.code === "INVALID_VALUE")).toBe(true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
