import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, mkdir, readFile, writeFile, readdir, rm, access, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";
import { createSkillDistribution, collectSkill, repoRoot, sha256 } from "../lib/skill-distribution.mjs";
import { installSkill, inspectInstallation } from "../lib/install-skill.mjs";
import { buildDocumentCli } from "../build-document-cli.mjs";
import { buildSmokeCheck } from "../build-smoke-check.mjs";
import { parseSmokeDocument } from "../../packages/shared/src/smokeMarkdown.mjs";
import { validateBundle, readSkillBundle } from "../../apps/web/src/skills/bundle.ts";
const distribution = await createSkillDistribution();
async function fixture(t) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "ak-distribution-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, target: path.join(base, "skills/implementation-ledger") };
}
const hashes = files => files.map(({ path, sha256 }) => ({ path, sha256 }));
test("standalone artifact is reproducible and package JSON/ZIP/receipt/installed files agree", async t => {
  await buildDocumentCli({ check: true });
  await buildSmokeCheck({ check: true });
  execFileSync(process.execPath, [path.join(repoRoot, "scripts/package-browser-assets.mjs")], { cwd: repoRoot, stdio: "pipe" });
  const directory = path.join(repoRoot, "apps/web/public-browser/downloads");
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const json = await readFile(path.join(directory, "implementation-ledger-" + manifest.version + ".json"), "utf8");
  assert.equal(sha256(json), manifest.payloadSha256);
  const bundle = await validateBundle(JSON.parse(json), manifest.version, manifest.payloadSha256);
  const archive = await readFile(path.join(directory, manifest.archive)); assert.equal(sha256(archive), manifest.archiveSha256);
  const entries = unzipSync(archive);
  for (const file of bundle.files) assert.equal(sha256(entries["implementation-ledger/" + file.path]), file.sha256);
  assert.deepEqual(manifest.fileHashes, hashes(bundle.files));
  assert.match(new TextDecoder().decode(entries["INSTALL.txt"]), new RegExp(bundle.source.commit));
  const f = await fixture(t), installed = await installSkill({ target: f.target, distribution: { bundle, payloadSha256: manifest.payloadSha256 } });
  assert.deepEqual(hashes(await collectSkill(installed.target)), hashes(bundle.files));
  const receipt = JSON.parse(await readFile(installed.receipt, "utf8"));
  assert.deepEqual(receipt.source, bundle.source); assert.deepEqual(receipt.ledger, bundle.ledger); assert.deepEqual(receipt.files, manifest.fileHashes);
  assert.match(bundle.source.commit, /^[a-f0-9]{40}$/); assert.ok(["worktree", "commit"].includes(bundle.source.kind));
  const help = JSON.parse(execFileSync(process.execPath, [path.join(f.target, "scripts/document-cli.mjs"), "help"], { cwd: f.base, encoding: "utf8" }));
  assert.match(help.runtime, /no pnpm/); await assert.rejects(access(path.join(f.target, "node_modules")), { code: "ENOENT" });
});
test("inspection never writes and existing matching, custom, unknown and unversioned installations are all preserved", async t => {
  const f = await fixture(t); await installSkill({ target: f.target, distribution });
  assert.equal((await inspectInstallation(f.target, distribution)).status, "matching");
  await assert.rejects(installSkill({ target: f.target, distribution }), /already exists/);
  for (const content of ["# Personal skill\n", "---\nname: implementation-ledger\n---\n# Undeclared\n"]) {
    await writeFile(path.join(f.target, "SKILL.md"), content);
    const before = await collectSkill(f.target);
    assert.equal((await inspectInstallation(f.target, distribution)).status, "different");
    await assert.rejects(installSkill({ target: f.target, distribution }), /already exists/);
    assert.deepEqual(await collectSkill(f.target), before);
  }
});
test("hash/source/download failures do not create an install target", async t => {
  const f = await fixture(t), modified = structuredClone(distribution);
  modified.bundle.files[0].content += "tampered";
  await assert.rejects(installSkill({ target: f.target, distribution: modified }), /Invalid skill bundle/);
  await assert.rejects(access(f.target), { code: "ENOENT" });
  for (const source of [{ ...distribution.bundle.source, commit: "main" }, { ...distribution.bundle.source, kind: "published" }]) {
    const bundle = { ...distribution.bundle, source };
    await assert.rejects(validateBundle(bundle, bundle.version, sha256(JSON.stringify(bundle))), /provenance/);
  }
  await assert.rejects(readSkillBundle(new Response("failed", { status: 503 }), distribution.bundle.version, distribution.payloadSha256));
  await assert.rejects(access(f.target), { code: "ENOENT" });
});
test("isolated smoke templates and checker validate new runs without editing their files", async t => {
  const f = await fixture(t); await installSkill({ target: f.target, distribution });
  const smokeId = "11111111-1111-4111-8111-111111111111", runId = "22222222-2222-4222-8222-222222222222";
  const fill = (template, values) => template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    assert.ok(Object.hasOwn(values, key), key); return values[key];
  });
  const source = fill(await readFile(path.join(f.target,"assets/smoke-template.md"),"utf8"), {
    Title:"Example notes", OwnerHeader:"", DocumentIdHeader:`Document-ID: ${smokeId}`,
    "검증 목적, 공통 사전조건, 테스트 데이터와 주의사항을 자유 Markdown으로 작성":"Synthetic setup only.",
    "관찰할 동작의 제목":"Search notes", "조작과 기대 결과를 연결한 한 줄 요약":"Search returns matching notes.",
    "이 TC를 수행하기 전에 준비할 조건 또는 없음":"A sample note exists.",
    "사람이나 Computer Use / browser use 에이전트가 실제 앱에서 할 조작":"Enter the sample title in Search.",
    "실제 화면이나 동작에서 확인할 수 있는 결과":"The sample note is visible."
  });
  const model = parseSmokeDocument(source,"smoke"), tc = model.cases[0]; assert.equal(model.valid,true);
  const run = fill(await readFile(path.join(f.target,"assets/smoke-run-template.md"),"utf8"), {
    RunTitle:"Synthetic run",OwnerHeader:"",DocumentIdHeader:`Document-ID: ${runId}`,SourceSmokeDocumentId:smokeId,
    SourceSmokeH1Title:model.title,SourceSmokeProjectRelativePath:"01_notes_smoke.md",RunNumber:"1",
    "실행 대상 앱과 빌드를 식별할 값":"Example synthetic build", "브라우저, OS 및 필요한 실행 환경":"Synthetic data; no app executed",
    "YYYY-MM-DDTHH:mm:ss+HH:MM":"2026-11-10T00:00:00Z", "이번 회차의 목적, 준비 및 진행 특이사항을 자유 Markdown으로 작성":"Format check only.",
    "회차를 생성할 때 원본 스모크의 메모 본문 전체를 그대로 보존":model.memo.content,
    SourceCaseId:tc.id,SourceCaseTitle:tc.title,SourceCaseRevision:String(tc.revision),SourceCaseSummary:tc.summary,SourceCaseChangeReason:tc.changeReason,
    SourceCasePrerequisites:tc.prerequisites.content,SourceCaseSteps:tc.steps.content,SourceCaseExpected:tc.expected.content
  });
  const sourcePath=path.join(f.base,"01_notes_smoke.md"),runPath=path.join(f.base,"02_notes_smoke_run.md");
  await writeFile(sourcePath,source);await writeFile(runPath,run);
  const executable=path.join(f.target,"scripts/check-smoke.mjs"),args=["--json","--new-run","--project",f.base,sourcePath,runPath];
  const report=JSON.parse(execFileSync(process.execPath,[executable,...args],{cwd:f.base,encoding:"utf8"}));
  assert.equal(report.ok,true);assert.equal(report.relations.runs[0].status,"linked");assert.equal(report.files[1].counts.NOT_RUN,1);
  assert.equal(await readFile(runPath,"utf8"),run);assert.equal(await readFile(sourcePath,"utf8"),source);
  const docs = path.join(f.base, "docs");
  await mkdir(docs);
  await writeFile(path.join(docs, "02_notes_smoke_run.md"), run);
  const context = JSON.parse(execFileSync(process.execPath, [path.join(f.target, "scripts/document-context.mjs"), "artifacts", "--cwd", f.base, "--target", "docs/02_notes_smoke_run.md"], { encoding: "utf8" }));
  assert.equal(context.artifacts.runEvidence, "docs/assets/notes/runs/02_notes_smoke_run");
  assert.equal(context.artifacts.output, ".output/alpha-kanban/notes/" + runId);
  const invalid=run.replace("Result: NOT_RUN","Result: PASS");await writeFile(runPath,invalid);
  assert.throws(()=>execFileSync(process.execPath,[executable,...args],{cwd:f.base,encoding:"utf8",stdio:"pipe"}),error=>error.status===1);
  assert.equal(await readFile(runPath,"utf8"),invalid);
  for(const file of ["SKILL.md","references/smoke-format.md"]) {
    const content=await readFile(path.join(f.target,file),"utf8");
    for(const match of content.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))if(!match[1].includes(":"))await access(path.resolve(f.target,path.dirname(file),match[1]));
  }
});
for (const stage of ["prepared", "file", "before-publish", "published"]) test("install interruption at " + stage + " retains verified prepared files for explicit recovery", async t => {
  const f = await fixture(t);
  await assert.rejects(installSkill({ target: f.target, distribution, fault: at => { if (at === stage) throw new Error("Injected installation failure"); } }), /retained at/);
  const staging = path.join(f.base, (await readdir(f.base)).find(name => name.startsWith(".ledger-install-")));
  assert.deepEqual(hashes(await collectSkill(path.join(staging, "prepared"))), hashes(distribution.bundle.files));
  assert.equal(JSON.parse(await readFile(path.join(staging, "receipt.json"), "utf8")).version, distribution.bundle.version);
  if (stage !== "published") await assert.rejects(access(path.join(f.target, "SKILL.md")), { code: "ENOENT" });
  // Explicit recovery installs into a new selected directory; partial/existing targets are never silently replaced.
  const restored = path.join(f.base, "recovered/implementation-ledger");
  await installSkill({ target: restored, distribution });
  assert.equal((await inspectInstallation(restored, distribution)).status, "matching");
});
test("a target created during staging is not replaced", async t => {
  const f = await fixture(t);
  await assert.rejects(installSkill({ target: f.target, distribution, fault: async at => { if (at === "prepared") { await mkdir(f.target); await writeFile(path.join(f.target, "personal.txt"), "Keep"); } } }), /No existing installation was changed/);
  assert.equal(await readFile(path.join(f.target, "personal.txt"), "utf8"), "Keep");
});
test("copied standalone CLI passes actual worktree/handoff/rebase/recovery scenarios without runtime dependencies", async t => {
  const f = await fixture(t); await mkdir(f.target, { recursive: true });
  // The subprocess gets only the self-contained executable, no source checkout imports or skill sibling files.
  const executable = path.join(f.target, "document-cli.mjs");
  await cp(path.join(repoRoot, "skills/implementation-ledger/scripts/document-cli.mjs"), executable);
  // This runs the complete worktree/recovery suite, including real Git operations.
  // Keep a bounded timeout without cutting off healthy runs on a busy build host.
  const output = execFileSync(process.execPath, ["--test", path.join(repoRoot, "scripts/test/document-cli.test.mjs")], { cwd: f.base, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")), AK_TEST_CLI_PATH: executable }, encoding: "utf8", timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
  assert.match(output, /fail 0/);
});
