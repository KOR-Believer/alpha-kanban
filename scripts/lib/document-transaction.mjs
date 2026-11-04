import { constants } from "node:fs";
import { open, mkdir, rmdir, link, unlink, chmod, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { within } from "../../packages/shared/src/documentPaths.mjs";
import { assertPlan, createDocumentPlan, inspectRepositories, validateRequest } from "./document-plan.mjs";
import { resolveDocumentContext } from "../../skills/implementation-ledger/scripts/lib/document-context.mjs";
import { withinDocumentRoot } from "../../skills/implementation-ledger/scripts/lib/document-root.mjs";
import { fail, hashObject, portable, maybeStat, safePath, snapshot, scanWorktree, worktreeContext } from "./document-fs.mjs";
import { operationDirectory, saveJournal, loadJournal, journalIds, syncDirectory, withOperationLock, documentPersistence, documentWriteFlags } from "./document-journal.mjs";

const exec = promisify(execFile);
const selected = (plan, file, directory = false) => plan.request.scope.some((scope) => file === scope || file.startsWith(scope + "/") || (directory && scope.startsWith(file + "/")));
async function targetPath(plan, relative, missing = false, directory = false) {
  const root = plan.documentRoot?.value ?? "docs";
  if (!selected(plan, relative, directory) || (!withinDocumentRoot(relative, root) && !(directory && root.startsWith(relative + "/")))) fail("WRITE_SCOPE", "A journal step is outside its approved document scope.");
  return safePath(plan.context.root, relative, { missing });
}
function comparable(record, { ignoreMtime = false, ignoreLinks = false } = {}) {
  if (!record) return null;
  const result = { kind: record.kind, dev: record.dev, ino: record.ino, mode: record.mode, uid: record.uid, gid: record.gid, attributes: record.attributes };
  if (record.kind === "file") Object.assign(result, { hash: record.hash, size: record.size, ...(!ignoreLinks ? { nlink: record.nlink } : {}), ...(!ignoreMtime ? { mtimeNs: record.mtimeNs } : {}) });
  return result;
}
const same = (left, right, options) => hashObject(comparable(left, options)) === hashObject(comparable(right, options));
async function current(plan, relative) {
  const file = await targetPath(plan, relative, true, true);
  return await maybeStat(file) ? snapshot(file, { attributes: true }) : null;
}
async function assertExpected(journal, paths = Object.keys(journal.expected)) {
  for (const relative of paths) if (!same(await current(journal.plan, relative), journal.expected[relative])) {
    fail("EXTERNAL_CHANGE", "A file or directory differs from the journal. New edits were preserved.", { path: relative });
  }
}
async function boundContext(journal, cwd, home, rollback = false) {
  const actual = await worktreeContext(cwd);
  if (hashObject(actual) !== hashObject(journal.plan.context)) fail("WORKTREE_CHANGED", "The current worktree, HEAD or branch changed. Do not apply this plan elsewhere.");
  if (!rollback) {
    const settings = await resolveDocumentContext({ operation: "root", cwd: actual.root });
    const expected = journal.plan.documentRoot ?? { status: "known", value: "docs", source: { scope: "default", path: null } };
    if (!settings.ok || hashObject(settings.documentRoot) !== hashObject(expected)) fail("DOCUMENT_ROOT_CHANGED", "The document root or its setting source changed. Review a new plan; interrupted operations can still be explicitly recovered.");
  }
  if (journal.plan.actor) {
    const actor = await resolveDocumentContext({ operation: "actor", cwd: actual.root, ...(home ? { home } : {}) });
    if (!actor.ok || hashObject({ user: actor.user, context: actor.context }) !== hashObject(journal.plan.actor)) fail("ACTOR_CHANGED", "Current-user identity or its source changed.");
  }
}
async function verifyScan(journal) {
  const scan = await scanWorktree(journal.plan.context.root, journal.plan.documentRoot?.value ?? "docs");
  const expectedPaths = new Map(journal.plan.scan.paths.map(entry => [entry.path, entry.kind]));
  for (const [relative, record] of Object.entries(journal.expected)) {
    if (record) expectedPaths.set(relative, record.kind); else expectedPaths.delete(relative);
  }
  const pairs = entries => entries.map(([name, kind]) => name + ":" + kind).sort();
  if (hashObject(pairs([...expectedPaths])) !== hashObject(pairs(scan.paths.map(entry => [entry.path, entry.kind]))) || hashObject(scan.skipped) !== hashObject(journal.plan.scan.skipped)) fail("SCAN_CHANGED", "The inspected file inventory changed. Preserve the journal and review the new paths.");
  const documents = new Map(scan.documents.map(document => [document.path, document.guard]));
  for (const before of journal.plan.scan.documents) {
    if (Object.hasOwn(journal.expected, before.path)) continue;
    const after = documents.get(before.path);
    if (!after || before.hash !== after.hash || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino) fail("REFERENCE_CHANGED", "An inspected reference document changed.", { path: before.path });
  }
}

async function verifyTargets(journal) {
  const plan = journal.plan;
  if (hashObject(await inspectRepositories(plan.request, plan.context)) !== hashObject(plan.repositories)) fail("REPOSITORY_CHANGED", "A reference repository or its identity evidence changed.");
  for (const check of plan.targetChecks) {
    if (check.virtual || check.code === "UNREGISTERED_TARGET") continue;
    const repo = plan.repositories.filter(entry => within(portable(entry.root), check.target)).sort((a, b) => b.root.length - a.root.length)[0];
    const relative = portable(path.relative(repo.root, check.target));
    // These paths are already checked against their journaled intermediate/final state.
    if (repo.current && Object.hasOwn(journal.expected, relative)) continue;
    let record, code;
    try { record = await snapshot(relative ? await safePath(repo.root, relative) : repo.root, { bytes: false }); }
    catch (error) { code = error.code ?? "TARGET_UNAVAILABLE"; }
    if (check.record ? !same(record, check.record) : code !== check.code) fail("REFERENCE_TARGET_CHANGED", "A checked reference target changed. Recheck the mapping before continuing.", { target: check.target });
  }
}

async function stepsFor(plan) {
  const desired = new Map(plan.directories.map(directory => [directory.to, directory.before]));
  for (const change of plan.changes) {
    let directory = portable(path.dirname(change.to));
    while (directory !== "." && directory !== "") {
      const absolute = await targetPath(plan, directory, true, true);
      const info = await maybeStat(absolute);
      if (info) {
        if (String(info.dev) !== change.before.dev) fail("CROSS_DEVICE_MOVE", "Cross-filesystem moves require a separately verified copy adapter.");
        break;
      }
      if (!desired.has(directory)) desired.set(directory, null);
      directory = portable(path.dirname(directory));
    }
  }
  const steps = [...desired].sort(([a], [b]) => a.split("/").length - b.split("/").length || a.localeCompare(b)).map(([relative, template]) => ({ kind: "mkdir", path: relative, template }));
  for (let i = 0; i < plan.changes.length; i++) if (plan.changes[i].from !== plan.changes[i].to) steps.push({ kind: "link", index: i, from: plan.changes[i].from, to: plan.changes[i].to });
  for (let i = 0; i < plan.changes.length; i++) if (plan.changes[i].before.hash !== plan.changes[i].afterHash) steps.push({ kind: "write", index: i, path: plan.changes[i].to, undo: false });
  for (let i = 0; i < plan.changes.length; i++) if (plan.changes[i].from !== plan.changes[i].to) steps.push({ kind: "unlink", index: i, path: plan.changes[i].from, survivor: plan.changes[i].to });
  for (const directory of [...plan.directories].sort((a, b) => b.from.split("/").length - a.from.split("/").length || b.from.localeCompare(a.from))) steps.push({ kind: "rmdir", path: directory.from, template: directory.before });
  return steps;
}
function reverseStep(step) {
  if (step.kind === "mkdir") return { kind: "rmdir", path: step.path, template: step.template };
  if (step.kind === "rmdir") return { kind: "mkdir", path: step.path, template: step.template };
  if (step.kind === "link") return { kind: "unlink", index: step.index, path: step.to, survivor: step.from };
  if (step.kind === "unlink") return { kind: "link", index: step.index, from: step.survivor, to: step.path };
  return { ...step, undo: true };
}
function affected(journal, step) {
  if (step.kind === "link") return [step.from, step.to];
  if (step.kind === "unlink") return [step.path, step.survivor];
  if (step.kind === "write") { const file = journal.plan.changes[step.index]; return [...new Set([file.from, file.to])]; }
  return [step.path];
}

async function setDirectoryAttributes(file, template) {
  if (!template) return;
  await chmod(file, template.mode);
  for (const [name, hex] of Object.entries(template.attributes?.xattrs ?? {})) await exec("/usr/bin/xattr", ["-wx", name, hex, file]);
}
async function writeBytes(file, bytes, expected, beforeClose) {
  const handle = await open(file, documentWriteFlags(constants.O_RDWR | (constants.O_NOFOLLOW ?? 0)));
  try {
    const info = await handle.stat({ bigint: true });
    if (String(info.dev) !== expected.dev || String(info.ino) !== expected.ino || String(info.mtimeNs) !== expected.mtimeNs) fail("EXTERNAL_CHANGE", "The open file no longer matches the checked file.");
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.write(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesWritten) fail("SHORT_WRITE", "No bytes were written; preserve the recovery journal.");
      offset += result.bytesWritten;
    }
    await handle.truncate(bytes.length); await handle.sync(); await beforeClose?.();
  } finally { await handle.close(); }
}
function postMatches(journal, step, observed) {
  const before = journal.pending.before;
  if (step.kind === "mkdir") {
    const entry = observed[step.path];
    return entry?.kind === "directory" && journal.pending.created?.ino === entry.ino && journal.pending.created?.dev === entry.dev && (!step.template || (entry.mode === step.template.mode && entry.uid === step.template.uid && entry.gid === step.template.gid && hashObject(entry.attributes) === hashObject(step.template.attributes)));
  }
  if (step.kind === "rmdir") return observed[step.path] === null;
  if (step.kind === "link") return same(observed[step.from], before[step.from], { ignoreLinks: true }) && same(observed[step.to], observed[step.from]) && observed[step.from].nlink === before[step.from].nlink + 1;
  if (step.kind === "unlink") return observed[step.path] === null && same(observed[step.survivor], before[step.survivor], { ignoreLinks: true }) && observed[step.survivor].nlink === before[step.survivor].nlink - 1;
  const change = journal.plan.changes[step.index], expectedHash = step.undo ? change.before.hash : change.afterHash;
  return Object.entries(observed).every(([relative, entry]) => {
    const original = before[relative];
    if (!original) return entry === null;
    return entry?.hash === expectedHash && same({ ...entry, hash: original.hash, size: original.size }, original, { ignoreMtime: true });
  });
}
async function observe(journal, step) {
  const result = {};
  for (const relative of affected(journal, step)) result[relative] = await current(journal.plan, relative);
  return result;
}
async function reconcilePending(directory, journal) {
  if (!journal.pending) return;
  const step = journal.pending.step, observed = await observe(journal, step);
  if (Object.entries(observed).every(([relative, record]) => same(record, journal.pending.before[relative]))) {
    journal.pending = null; await saveJournal(directory, journal); return;
  }
  if (!postMatches(journal, step, observed)) fail("UNCERTAIN_STEP", "An interrupted step is neither its checked original nor verified result. Preserve new edits and the backup for manual review.", { step });
  Object.assign(journal.expected, observed);
  if (journal.pending.direction === "rollback") journal.rollbackCursor++; else journal.cursor++;
  journal.pending = null; await saveJournal(directory, journal);
}

async function executeStep(directory, journal, step, direction, fault) {
  await fault?.("before-step", step, journal);
  await assertExpected(journal, affected(journal, step));
  journal.pending = { step, direction, before: Object.fromEntries(affected(journal, step).map(relative => [relative, journal.expected[relative] ?? null])) };
  await saveJournal(directory, journal);
  await fault?.("after-intent", step, journal);
  const plan = journal.plan;
  if (step.kind === "mkdir") {
    const file = await targetPath(plan, step.path, true, true);
    await mkdir(file, { mode: step.template?.mode ?? 0o755 });
    journal.pending.created = await snapshot(file, { attributes: true });
    await saveJournal(directory, journal);
    await setDirectoryAttributes(file, step.template); await syncDirectory(file); await syncDirectory(path.dirname(file));
  } else if (step.kind === "link") {
    const source = await targetPath(plan, step.from), target = await targetPath(plan, step.to, true);
    await link(source, target); await syncDirectory(path.dirname(target));
  } else if (step.kind === "write") {
    const change = plan.changes[step.index];
    await writeBytes(await targetPath(plan, step.path), Buffer.from(step.undo ? change.before.bytes : change.after, "base64"), journal.expected[step.path], () => fault?.("before-close", step, journal));
  } else if (step.kind === "unlink") {
    // All intended contents have been read back before source removal starts.
    await fault?.("before-unlink", step, journal);
    await assertExpected(journal);
    if (direction === "apply") { await verifyScan(journal); await verifyTargets(journal); }
    const source = await targetPath(plan, step.path), survivor = await current(plan, step.survivor);
    if (!same(survivor, journal.expected[step.path])) fail("MOVE_IDENTITY_LOST", "The destination is no longer the same checked inode and content.");
    await unlink(source); await syncDirectory(path.dirname(source));
  } else {
    const file = await targetPath(plan, step.path, false, true);
    if ((await readdir(file)).length) fail("DIRECTORY_NOT_EMPTY", "An unexpected file appeared in a directory scheduled for removal.");
    await rmdir(file); await syncDirectory(path.dirname(file));
  }
  await fault?.("after-operation", step, journal);
  const observed = await observe(journal, step);
  if (!postMatches(journal, step, observed)) fail("READBACK_MISMATCH", "The operation result or native attributes could not be verified.");
  Object.assign(journal.expected, observed);
  if (direction === "rollback") journal.rollbackCursor++; else journal.cursor++;
  journal.pending = null; await saveJournal(directory, journal);
  await fault?.("after-step", step, journal);
}

async function runJournal(directory, journal, { cwd, home, fault }, rollback = false) {
  assertPlan(journal.plan); await boundContext(journal, cwd, home, rollback);
  await reconcilePending(directory, journal);
  await assertExpected(journal); await verifyScan(journal);
  if (!rollback && !journal.recovering && journal.status !== "rolled-back") await verifyTargets(journal);
  if (!rollback && journal.status === "rolled-back") fail("ROLLED_BACK", "This operation was rolled back; create a fresh plan.");
  if (!rollback && journal.status === "completed") return report(journal);
  if (rollback && journal.status === "rolled-back") return report(journal);
  if (!rollback && journal.recovering) fail("ROLLBACK_IN_PROGRESS", "Continue the explicit recovery instead of applying this operation.");
  if (rollback) journal.recovering = true;
  journal.status = rollback ? "rolling-back" : "applying"; journal.error = null;
  await saveJournal(directory, journal);
  try {
    if (rollback) {
      const steps = journal.steps.slice(0, journal.cursor).reverse().map(reverseStep);
      while (journal.rollbackCursor < steps.length) await executeStep(directory, journal, steps[journal.rollbackCursor], "rollback", fault);
      journal.status = "rolled-back";
    } else {
      while (journal.cursor < journal.steps.length) await executeStep(directory, journal, journal.steps[journal.cursor], "apply", fault);
      journal.status = "completed";
    }
    await assertExpected(journal); await verifyScan(journal);
    if (!rollback) await verifyTargets(journal);
    await saveJournal(directory, journal);
    return report(journal);
  } catch (error) {
    journal.status = "interrupted"; journal.error = { code: error.code ?? "IO_ERROR", message: error.message };
    await saveJournal(directory, journal).catch(() => {});
    fail("OPERATION_INTERRUPTED", "The operation stopped. Inspect the journal, then explicitly resume or recover; nothing was automatically rolled back.", { id: journal.plan.id, cause: journal.error, cursor: journal.cursor, pending: journal.pending?.step ?? null });
  }
}
const report = journal => ({ id: journal.plan.id, status: journal.status, completedSteps: journal.cursor, totalSteps: journal.steps.length, recoveredSteps: journal.rollbackCursor, files: journal.plan.changes.map(change => ({ from: change.from, to: change.to })), persistence: journal.persistence ?? null, error: journal.error });

export async function applyDocumentPlan(plan, { cwd = process.cwd(), home, approve, fault } = {}) {
  assertPlan(plan);
  if (approve !== plan.id) fail("APPROVAL_REQUIRED", "Pass the exact reviewed plan ID explicitly.");
  const context = await worktreeContext(cwd);
  if (hashObject(context) !== hashObject(plan.context)) fail("WORKTREE_CHANGED", "The plan belongs to another worktree, HEAD or branch.");
  const directory = await operationDirectory(context, true);
  return withOperationLock(directory, async () => {
    const ids = await journalIds(directory);
    if (ids.includes(plan.id)) {
      const existing = await loadJournal(directory, plan.id);
      if (existing.status !== "completed") fail("RECOVERY_REQUIRED", "Use explicit resume or recover for this existing operation.", { id: plan.id });
      return runJournal(directory, existing, { cwd, home, fault });
    }
    for (const id of ids) if (!["completed", "rolled-back"].includes((await loadJournal(directory, id)).status)) fail("RECOVERY_REQUIRED", "Resolve the earlier interrupted operation before creating a new one.", { id });
    const fresh = await createDocumentPlan(plan.request, { cwd, home, ...(plan.migration ? { generatedIds: plan.migration.generatedIds } : {}) });
    if (fresh.id !== plan.id) fail("STALE_PLAN", "Inputs, files, repo evidence or user settings changed after analysis.");
    const steps = await stepsFor(plan), expected = {};
    for (const change of plan.changes) { expected[change.from] = change.before; if (change.from !== change.to) expected[change.to] = null; }
    for (const directory of plan.directories) expected[directory.from] = directory.before;
    for (const step of steps) if (step.kind === "mkdir") expected[step.path] = null;
    const journal = { schema: 1, plan, steps, expected, cursor: 0, rollbackCursor: 0, pending: null, status: "prepared", persistence: documentPersistence(), error: null };
    await fault?.("before-journal", null, journal);
    await saveJournal(directory, journal); // Flush and read back the entire preimage before the first document change.
    await fault?.("after-journal", null, journal);
    return runJournal(directory, journal, { cwd, home, fault });
  });
}

export async function continueDocumentOperation(id, { cwd = process.cwd(), home, approve, rollback = false, fault } = {}) {
  if (approve !== id) fail("APPROVAL_REQUIRED", "Explicitly approve this exact operation ID for resumption or recovery.");
  const directory = await operationDirectory(await worktreeContext(cwd));
  if (!directory) fail("JOURNAL_NOT_FOUND", "No operation journal exists in this worktree.");
  return withOperationLock(directory, async () => runJournal(directory, await loadJournal(directory, id), { cwd, home, fault }, rollback));
}
export async function verifyDocumentOperation(id, { cwd = process.cwd(), home } = {}) {
  const directory = await operationDirectory(await worktreeContext(cwd));
  const journal = await loadJournal(directory, id);
  assertPlan(journal.plan); await boundContext(journal, cwd, home, journal.status === "rolled-back");
  // Verification is read-only: an uncertain pending step is never adopted here.
  if (journal.pending) return { ...report(journal), verified: false, pending: journal.pending.step };
  await assertExpected(journal); await verifyScan(journal);
  if (!journal.recovering && journal.status !== "rolled-back") await verifyTargets(journal);
  return { ...report(journal), verified: true };
}

export async function listDocumentOperations({ cwd = process.cwd() } = {}) {
  const directory = await operationDirectory(await worktreeContext(cwd));
  const operations = [];
  for (const id of await journalIds(directory)) operations.push(report(await loadJournal(directory, id)));
  return { operations };
}

/** A verified receipt makes an identical request idempotent even after its source path disappears. */
export async function analyzeDocumentOperation(request, options = {}) {
  validateRequest(request, null);
  const context = await worktreeContext(options.cwd ?? process.cwd());
  const directory = await operationDirectory(context);
  const key = value => { const { acknowledgements: _ignored, ...body } = value; return hashObject(body); };
  for (const id of await journalIds(directory)) {
    const journal = await loadJournal(directory, id);
    if (journal.status !== "completed" || key(journal.plan.request) !== key(request)) continue;
    let verified;
    try { verified = await verifyDocumentOperation(id, options); } catch { continue; }
    if (verified.verified) return { schema: 1, engine: "document-operation-receipt-1", id, decision: "noop", status: "already-applied", changes: [], verified: true, files: verified.files };
  }
  return createDocumentPlan(request, options);
}
