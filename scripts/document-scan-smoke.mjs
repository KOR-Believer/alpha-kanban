#!/usr/bin/env node
// Synthetic native smoke only. No user documents or installed skills are read.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sha, scanWorktree } from "./lib/document-fs.mjs";

const repository = path.resolve(import.meta.dirname, "..");
const output = path.join(repository, "output/cli-scan-smoke");
await mkdir(output, { recursive: true });
const run = await mkdtemp(path.join(output, "run-")), root = path.join(run, "project");
await mkdir(root);
const results = [], runtimeCount = 20_100;
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
Object.assign(environment, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
async function put(relative, content) {
  const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content);
}
function git(...args) {
  const result = spawnSync("git", ["-C", root, "-c", "user.name=Scan Smoke", "-c", "user.email=smoke@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + path.join(run, "no-hooks"), ...args], { env: environment, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function cli(executable, args, input) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [executable, ...args], { cwd: root, env: environment, input: input && JSON.stringify(input), encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
  assert.ifError(result.error); assert.equal(result.stderr, "");
  return { exit: result.status, ms: Math.round(performance.now() - start), body: JSON.parse(result.stdout) };
}
const original = "# Work\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\n\n[Context](context.md)\n[Image](assets/image.bin)\n";
const context = "# Context\n\n[Work](01_work_plan.md)\n";
const request = { schema: 1, operation: "move", scope: ["docs"], moves: [{ from: "docs/01_work_plan.md", to: "docs/@alphago/01_work_plan.md" }], owner: "destination", intent: "adopt" };
await put("README.md", "# Synthetic scan smoke\n"); await put(".gitignore", ".runtime/\n");
await put(request.moves[0].from, original); await put("docs/context.md", context); await put("docs/assets/image.bin", Buffer.from([0, 1, 255, 17]));
git("init", "-q", "-b", "main"); git("add", "."); git("commit", "-qm", "synthetic fixture");
await mkdir(path.join(root, ".runtime"));
for (let offset = 0; offset < runtimeCount; offset += 128) {
  await Promise.all(Array.from({ length: Math.min(128, runtimeCount - offset) }, (_, i) => writeFile(path.join(root, `.runtime/file-${offset + i}.bin`), "")));
}
assert.equal(git("check-ignore", ".runtime/file-0.bin"), ".runtime/file-0.bin");
const bytesBefore = sha(await readFile(path.join(root, "docs/assets/image.bin")));
try {
  const baselineIndex = process.argv.indexOf("--baseline");
  if (baselineIndex !== -1) {
    const baseline = cli(path.resolve(process.argv[baselineIndex + 1]), ["analyze", "--request", "-"], request);
    assert.equal(baseline.body.error?.code, "SCAN_LIMIT");
    results.push({ executable: "before", stage: "analyze", exit: baseline.exit, ms: baseline.ms, error: baseline.body.error.code });
  }
  for (const executable of ["scripts/document-cli.mjs", "skills/implementation-ledger/scripts/document-cli.mjs"]) {
    const file = path.join(repository, executable);
    const first = cli(file, ["analyze", "--request", "-"], request);
    assert.equal(first.body.decision, "review", JSON.stringify(first.body));
    assert.ok(first.body.issues.every(issue => issue.code === "UNSCANNED_BACKLINKS"));
    assert.ok(!first.body.scan.paths.some(entry => entry.path.startsWith(".runtime")));
    results.push({ executable, stage: "analyze", exit: first.exit, ms: first.ms, decision: first.body.decision, inspectedPaths: first.body.scan.paths.length });
    const ready = cli(file, ["analyze", "--request", "-"], { ...request, acknowledgements: first.body.issues.map(issue => issue.fingerprint) });
    assert.equal(ready.body.decision, "ready", JSON.stringify(ready.body));
    const plan = ready.body;
    await writeFile(path.join(run, (executable.startsWith("skills/") ? "bundled" : "source") + "-plan.json"), JSON.stringify(plan, null, 2), { mode: 0o600 });
    await put(".runtime/after-analysis.md", "# Ignored runtime state\n");
    await put("unrelated.log", "untracked log outside scope\n");
    const applied = cli(file, ["apply", "--plan", "-", "--approve", plan.id], plan);
    assert.equal(applied.body.status, "completed", JSON.stringify(applied.body));
    const expected = original.replace("# Work\n", "# Work\nOwner: @alphago\n").replace("(context.md)", "(../context.md)").replace("(assets/image.bin)", "(../assets/image.bin)");
    assert.equal(await readFile(path.join(root, request.moves[0].to), "utf8"), expected);
    assert.equal(await readFile(path.join(root, "docs/context.md"), "utf8"), context.replace("(01_work_plan.md)", "(@alphago/01_work_plan.md)"));
    await rm(path.join(root, "unrelated.log")); await put(".runtime/after-apply.bin", "log churn\n");
    assert.equal(cli(file, ["verify", "--id", plan.id]).body.verified, true);
    assert.equal(cli(file, ["analyze", "--request", "-"], request).body.status, "already-applied");
    const recovered = cli(file, ["recover", "--id", plan.id, "--approve", plan.id]);
    assert.equal(recovered.body.status, "rolled-back", JSON.stringify(recovered.body));
    assert.equal(cli(file, ["verify", "--id", plan.id]).body.verified, true);
    assert.equal(await readFile(path.join(root, request.moves[0].from), "utf8"), original);
    assert.equal(await readFile(path.join(root, "docs/context.md"), "utf8"), context);
    assert.equal(sha(await readFile(path.join(root, "docs/assets/image.bin"))), bytesBefore);
    results.push({ executable, stage: "apply-verify-recover", passed: true, applyMs: applied.ms, recoverMs: recovered.ms, originalRestored: true, assetBytesUnchanged: true });
  }
  // Non-Markdown runtime files outside scope are irrelevant even when the
  // project has not yet added an ignore rule. New Markdown remains inspectable.
  await rm(path.join(root, ".runtime/after-analysis.md")); await put(".gitignore", "");
  const unignored = cli(path.join(repository, "scripts/document-cli.mjs"), ["analyze", "--request", "-"], request);
  assert.equal(unignored.body.decision, "review", JSON.stringify(unignored.body));
  assert.ok(!unignored.body.scan.paths.some(entry => entry.path.startsWith(".runtime")));
  results.push({ stage: "unignored-non-markdown-runtime", passed: true, ms: unignored.ms, inspectedPaths: unignored.body.scan.paths.length });
  await put(".gitignore", ".runtime/\n");
  // Keeping the cap for explicitly selected data prevents narrowing the scan
  // from silently dropping assets in a large requested directory move.
  await assert.rejects(scanWorktree(root, ".runtime", [".runtime"]), error => error.code === "SCAN_LIMIT" && error.details.scope[0] === ".runtime");
  results.push({ stage: "explicit-large-scope-still-refused", passed: true });
  console.log(JSON.stringify({ output: run, runtimeFiles: runtimeCount, results }, null, 2));
} finally {
  await writeFile(path.join(run, "report.json"), JSON.stringify({ runtimeFiles: runtimeCount, results }, null, 2));
}
