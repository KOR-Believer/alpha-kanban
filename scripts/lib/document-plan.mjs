import path from "node:path";
import { realpath } from "node:fs/promises";
import { analyzeReferences, referenceTargets, projectPath, absolutePath, movePath, pathKey, within } from "../../packages/shared/src/documentReferences.mjs";
import { readDocumentMetadata, analyzeDocumentMetadata, previewDocumentMetadata } from "../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";
import { inspectLedgerFormat, inspectTicketCompatibility } from "../../skills/implementation-ledger/scripts/lib/ledger-format.mjs";
import { scanDocumentHeader } from "../../skills/implementation-ledger/scripts/lib/document-header.mjs";
import { resolveDocumentContext } from "../../skills/implementation-ledger/scripts/lib/document-context.mjs";
import { fail, hashObject, sha, portable, maybeStat, git, worktreeContext, normalizeRemote, safePath, snapshot, scanWorktree } from "./document-fs.mjs";

const selected = (scopes, file) => scopes.some((scope) => file === scope || file.startsWith(scope + "/"));
const exactKeys = (input, names, label) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !names.includes(key))) fail("INVALID_REQUEST", `Unknown or invalid ${label} fields.`);
};
export function validateRequest(request) {
  exactKeys(request, ["schema", "operation", "scope", "moves", "targets", "repositories", "output", "owner", "intent", "actor", "acknowledgements"], "request");
  if (request.schema !== 1 || !["move", "reconcile", "rebase"].includes(request.operation)) fail("INVALID_REQUEST", "Expected schema 1 and move, reconcile or rebase.");
  if (!Array.isArray(request.scope) || !request.scope.length) fail("INVALID_REQUEST", "Explicit docs write scope is required.");
  for (const scope of request.scope) if (projectPath(scope) !== "docs" && !scope.startsWith("docs/")) fail("WRITE_SCOPE", "Write scope must be docs or a path below docs.");
  if (request.output !== undefined && !["relative", "file-url"].includes(request.output)) fail("INVALID_REQUEST", "Unknown link output policy.");
  if (request.owner !== undefined && !["preserve", "destination"].includes(request.owner)) fail("INVALID_REQUEST", "Unknown owner policy.");
  if (request.intent !== undefined && !["organize", "adopt", "handoff"].includes(request.intent)) fail("INVALID_REQUEST", "Unknown ownership intent.");
  if (request.actor !== undefined && request.actor !== "current") fail("INVALID_REQUEST", "actor may only be current; explicit destinations need no actor lookup.");
  if (request.repositories !== undefined && !Array.isArray(request.repositories)) fail("INVALID_REQUEST", "repositories must be an array.");
  if (request.acknowledgements !== undefined && (!Array.isArray(request.acknowledgements) || request.acknowledgements.some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)))) fail("INVALID_REQUEST", "Acknowledgements must be exact analysis fingerprints.");
  if (request.operation !== "move" && request.moves !== undefined) fail("INVALID_REQUEST", "Only move accepts moves.");
  if (request.operation !== "reconcile" && request.targets !== undefined) fail("INVALID_REQUEST", "Only reconcile accepts targets.");
  if (request.operation === "rebase" && (request.owner !== undefined || request.actor !== undefined || request.intent !== undefined)) fail("INVALID_REQUEST", "PC rebasing does not also change ownership.");
}

export async function inspectRepositories(request, context) {
  const result = [{ root: context.root, current: true, oldRoot: null, evidence: null, identity: context }];
  for (const repo of request.repositories ?? []) {
    exactKeys(repo, ["root", "oldRoot", "proof"], "repository");
    if (typeof repo.root !== "string" || (repo.root !== "current" && !path.isAbsolute(repo.root))) fail("INVALID_REQUEST", "An external repo requires its exact current absolute root.");
    const root = repo.root === "current" ? context.root : await realpath(repo.root);
    const identity = await worktreeContext(root);
    if (identity.root !== root) fail("REPOSITORY_ROOT_REQUIRED", "An external path must be the exact repository root.");
    let evidence = null;
    if (repo.oldRoot !== undefined) {
      absolutePath(repo.oldRoot);
      exactKeys(repo.proof, ["kind", "url", "reason"], "repository proof");
      if (repo.proof.kind === "remote") {
        const expected = typeof repo.proof.url === "string" ? normalizeRemote(repo.proof.url) : null;
        const names = (await git(root, ["remote"])).split("\n").filter(Boolean);
        const remotes = [];
        for (const name of names) for (const url of (await git(root, ["config", "--local", "--get-all", `remote.${name}.url`])).split("\n")) {
          const normalized = normalizeRemote(url); if (normalized) remotes.push(normalized);
        }
        if (!expected || !remotes.includes(expected)) fail("REPOSITORY_IDENTITY_MISMATCH", "The confirmed old repo does not match a configured local remote.");
        evidence = { kind: "remote", expected, remotes: [...new Set(remotes)].sort() };
      } else if (repo.proof.kind === "confirmed" && typeof repo.proof.reason === "string" && repo.proof.reason.trim()) {
        evidence = { kind: "confirmed", reason: repo.proof.reason.trim() };
      } else fail("REPOSITORY_PROOF_REQUIRED", "An old root needs matching remote evidence or an explicit user confirmation reason.");
    } else if (repo.proof !== undefined) fail("INVALID_REQUEST", "Repository proof is only used with an old root.");
    const prior = result.find((entry) => entry.root === root);
    if (prior?.oldRoot) fail("MAPPING_CONFLICT", "A current repository was specified more than once.");
    if (repo.oldRoot && result.some((entry) => entry.oldRoot && pathKey(entry.oldRoot) === pathKey(repo.oldRoot) && entry.root !== root)) fail("MAPPING_CONFLICT", "An old root maps to different repositories.");
    const entry = { root, current: root === context.root, oldRoot: repo.oldRoot ?? null, evidence, identity };
    if (prior) result[result.indexOf(prior)] = entry; else result.push(entry);
  }
  if (request.operation === "rebase" && !result[0].oldRoot) fail("OLD_DOCUMENT_ROOT_REQUIRED", "PC rebasing requires the old root of the current document repo.");
  if (request.operation !== "rebase" && result.some((entry) => entry.oldRoot)) fail("INVALID_REQUEST", "Old repo mappings belong to rebase operations.");
  return result.sort((a, b) => a.root.localeCompare(b.root));
}

function formatCheck(relative, markdown) {
  const canonical = /_(tickets|plan|inventory)\.md$/.test(relative);
  if (!canonical && scanDocumentHeader(markdown).error === "MISSING_DOCUMENT_TITLE") return;
  const compatibility = relative.endsWith("_tickets.md") ? inspectTicketCompatibility(markdown) : inspectLedgerFormat(markdown);
  if (!compatibility.writable) fail(compatibility.code, "The document format cannot be structurally changed.", { path: relative });
}

/** Reads only. The caller controls where to save the returned reviewable JSON plan. */
export async function createDocumentPlan(request, { cwd = process.cwd(), home } = {}) {
  validateRequest(request);
  const context = await worktreeContext(cwd), root = context.root;
  const repos = await inspectRepositories(request, context);
  const actor = request.actor === "current" ? await resolveDocumentContext({ operation: "actor", cwd: root, ...(home ? { home } : {}) }) : null;
  if (actor && !actor.ok) fail(actor.diagnostics[0]?.code ?? "USER_REQUIRED", actor.diagnostics[0]?.message ?? "Current user could not be resolved.");
  const actorIdentity = actor ? { user: actor.user, context: actor.context } : null;
  const scan = await scanWorktree(root), issues = [];
  const writePath = async (relative, missing = false) => {
    if (!selected(request.scope, projectPath(relative))) fail("WRITE_SCOPE", "A source or destination lies outside the selected docs scope.", { path: relative });
    return safePath(root, relative, { missing });
  };
  for (const scope of request.scope) await safePath(root, scope, { missing: true });
  for (const skipped of scan.skipped) {
    const insideScope = selected(request.scope, skipped.path);
    issues.push({ severity: insideScope ? "blocked" : "review", code: skipped.code, path: skipped.path, message: insideScope ? "The selected write scope contains an uninspected boundary." : "This worktree path was not inspected for backlinks." });
  }
  const documents = scan.documents.map((document) => ({ ...document, writable: selected(request.scope, document.path) }));
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const idIndex = new Map();
  for (const document of documents) {
    const id = readDocumentMetadata(document.markdown).documentId.value;
    if (id) idIndex.set(id, [...(idIndex.get(id) ?? []), document.path]);
  }
  const physical = [], directories = [], moves = [], ownerPaths = new Set();
  if (request.operation === "move") {
    if (!Array.isArray(request.moves) || !request.moves.length) fail("INVALID_REQUEST", "move requires a nonempty moves list.");
    for (const move of request.moves) {
      exactKeys(move, ["from", "to"], "move");
      const source = await writePath(move.from), target = await writePath(move.to, true);
      if (await maybeStat(target)) fail("DESTINATION_EXISTS", "Move destinations must not exist.", { path: move.to });
      moves.push({ from: move.from, to: move.to });
      const sourceStat = await snapshot(source, { bytes: false });
      const entries = sourceStat.kind === "directory" ? scan.paths.filter((entry) => entry.path === move.from || entry.path.startsWith(move.from + "/")) : [{ path: move.from, kind: "file" }];
      for (const entry of entries) {
        const to = move.to + entry.path.slice(move.from.length);
        await writePath(entry.path); await writePath(to, true);
        if (entry.kind === "directory") directories.push({ from: entry.path, to, before: await snapshot(path.join(root, entry.path), { attributes: true }) });
        else { physical.push({ from: entry.path, to }); if (request.owner === "destination" && /\.md$/i.test(entry.path)) ownerPaths.add(entry.path); }
      }
    }
  }
  if (request.operation === "reconcile") {
    if (!Array.isArray(request.targets) || !request.targets.length || request.owner !== "destination") fail("INVALID_REQUEST", "reconcile requires targets and owner: destination.");
    for (const target of request.targets) {
      exactKeys(target, ["path", "previous", "placement"], "reconciliation target");
      if (target.previous !== undefined && target.placement !== undefined) fail("INVALID_REQUEST", "Use either previous identity or confirmed placement, not both.");
      await writePath(target.path);
      const document = byPath.get(target.path);
      if (!document) fail("MARKDOWN_REQUIRED", "Owner reconciliation requires readable Markdown.");
      ownerPaths.add(target.path);
      if (target.previous) {
        exactKeys(target.previous, ["path", "documentId", "hash"], "previous identity");
        const previous = await writePath(target.previous.path, true);
        if (await maybeStat(previous)) fail("PREVIOUS_PATH_REUSED", "The previous path is still occupied; a copy cannot be inferred to be a move.");
        const metadata = readDocumentMetadata(document.markdown);
        if (!metadata.documentId.value || metadata.documentId.value !== target.previous.documentId || idIndex.get(metadata.documentId.value)?.length !== 1) fail("AMBIGUOUS_RELOCATION", "An external move requires one matching valid document UUID.");
        if (document.guard.hash !== target.previous.hash) fail("RELOCATION_CONTENT_CHANGED", "The externally moved file does not match the confirmed pre-move bytes.");
        document.previousPath = target.previous.path; moves.push({ from: target.previous.path, to: target.path });
      } else if (target.placement !== "confirmed-in-place") fail("PREVIOUS_PATH_REQUIRED", "Provide verified previous identity or explicitly confirm that existing references use the current placement.");
    }
  }
  if (new Set(physical.map((entry) => entry.from)).size !== physical.length || new Set(physical.map((entry) => entry.to)).size !== physical.length) fail("OVERLAPPING_MOVE", "A file appears in multiple move entries.");
  const referenceInput = { root: portable(root), previousRoot: repos.find((repo) => repo.current)?.oldRoot ?? undefined,
    documents, moves, verifyPaths: [...ownerPaths], mappings: repos.filter((repo) => repo.oldRoot).map((repo) => ({ oldRoot: repo.oldRoot, currentRoot: portable(repo.root) })), output: request.output ?? "relative" };
  const checks = [], available = [];
  for (const candidate of referenceTargets(referenceInput)) {
    const virtual = moves.find((move) => portable(path.join(root, move.from)) === candidate && documents.some((document) => document.previousPath === move.from));
    if (virtual) { available.push(candidate); checks.push({ target: candidate, virtual: virtual.to }); continue; }
    const repo = repos.filter((entry) => within(portable(entry.root), candidate)).sort((a, b) => b.root.length - a.root.length)[0];
    if (!repo) { checks.push({ target: candidate, code: "UNREGISTERED_TARGET" }); continue; }
    try {
      const relative = portable(path.relative(repo.root, candidate));
      const target = relative ? await safePath(repo.root, relative) : repo.root;
      const record = await snapshot(target, { bytes: false });
      checks.push({ target: candidate, record }); available.push(candidate);
    } catch (error) { checks.push({ target: candidate, code: error.code ?? "TARGET_UNAVAILABLE" }); }
  }
  const references = analyzeReferences({ ...referenceInput, available });
  issues.push(...references.issues);
  const edits = new Map(references.changes.map((change) => [change.path, change]));
  const files = new Map(physical.map((entry) => [entry.from, entry]));
  for (const relative of [...edits.keys(), ...ownerPaths]) if (!files.has(relative)) files.set(relative, { from: relative, to: relative });
  const changes = [];
  const absoluteMoves = moves.map((move) => ({ from: portable(path.join(root, move.from)), to: portable(path.join(root, move.to)) }));
  for (const file of files.values()) {
    const absolute = await writePath(file.from);
    const before = await snapshot(absolute, { attributes: true });
    if (before.kind !== "file" || before.nlink !== 1) fail("HARDLINK_OR_SPECIAL_FILE", "Existing hard links and nonregular files cannot be changed safely.", { path: file.from });
    const document = byPath.get(file.from);
    if (document && before.hash !== document.guard.hash) fail("STALE_FILE", "A document changed during analysis.");
    let after = Buffer.from(before.bytes, "base64"), ownership = null;
    if (document) {
      formatCheck(file.from, document.markdown);
      const metadata = readDocumentMetadata(document.markdown);
      if (metadata.documentId.value && idIndex.get(metadata.documentId.value)?.length > 1) fail("DUPLICATE_DOCUMENT_ID", "A changed document has a duplicate UUID.", { path: file.from });
      const destination = portable(path.relative(root, movePath(portable(path.join(root, file.from)), absoluteMoves)));
      const oldOwner = analyzeDocumentMetadata(document.markdown, document.previousPath ?? file.from);
      const newOwner = analyzeDocumentMetadata(document.markdown, destination);
      const plainWithoutHeader = !/_(tickets|plan|inventory)\.md$/.test(file.from) && scanDocumentHeader(document.markdown).error === "MISSING_DOCUMENT_TITLE";
      if (oldOwner.pathOwner.status === "invalid" || newOwner.pathOwner.status === "invalid" || (!plainWithoutHeader && (oldOwner.ownerState === "invalid" || newOwner.ownerState === "invalid"))) fail("INVALID_OWNERSHIP", "An invalid Owner header or owner folder must be resolved before changing this document.", { path: file.from });
      if (plainWithoutHeader && ownerPaths.has(file.from)) fail("OWNER_HEADER_REQUIRED", "Explicit Owner registration requires a document title; it is not generated by a move.", { path: file.from });
      const changingOwner = oldOwner.pathOwner.value !== newOwner.pathOwner.value || (ownerPaths.has(file.from) && newOwner.ownerState !== "aligned");
      if (changingOwner) {
        const registration = !metadata.owner.value && oldOwner.pathOwner.value === newOwner.pathOwner.value;
        const intent = !registration && (oldOwner.pathOwner.value || metadata.owner.value) ? "handoff" : "adopt";
        if (request.intent !== intent) fail("OWNERSHIP_INTENT_REQUIRED", `This owner transition requires intent: ${intent}.`, { path: file.from });
        if (newOwner.pathOwner.value && !ownerPaths.has(file.from)) fail("OWNER_POLICY_REQUIRED", "Moving into a different owner folder requires explicit owner: destination.");
      }
      const directed = physical.some(entry => entry.from === file.from) || ownerPaths.has(file.from);
      if (actorIdentity && directed && newOwner.pathOwner.value !== actorIdentity.user.value) fail("ACTOR_DESTINATION_MISMATCH", "The requested current-user destination does not match the resolved user.");
      let markdown = edits.get(file.from)?.after ?? document.markdown;
      if (ownerPaths.has(file.from)) markdown = previewDocumentMetadata({ markdown, path: destination, reconcileOwner: true, allowPlainMarkdown: true }).after;
      ownership = { beforePathOwner: oldOwner.pathOwner.value, recordedOwner: metadata.owner.value, afterPathOwner: newOwner.pathOwner.value, afterOwner: readDocumentMetadata(markdown).owner.value, intent: request.intent ?? "organize" };
      after = Buffer.from(markdown, "utf8");
    }
    if (file.from !== file.to || sha(after) !== before.hash) changes.push({ ...file, before, after: after.toString("base64"), afterHash: sha(after), ownership,
      diff: document ? { before: document.markdown, after: after.toString("utf8") } : null });
  }
  for (const directory of directories) {
    const attrs = directory.before.attributes;
    if (attrs.xattrs === null || attrs.directoryAcl === null || attrs.flags === null || attrs.directoryAcl.length || (attrs.flags !== "-" && attrs.flags !== "0") || directory.before.uid !== process.getuid?.() || directory.before.gid !== process.getgid?.()) {
      fail("UNSUPPORTED_DIRECTORY_ATTRIBUTES", "Moving a directory with ACLs, flags or different ownership needs a separately verified adapter.");
    }
  }
  if (changes.reduce((sum, change) => sum + Number(change.before.size), 0) > 256 * 1024 * 1024) fail("BACKUP_LIMIT", "One operation may back up at most 256 MiB; select a smaller docs scope.");
  if (changes.length || directories.length) issues.push({ severity: "review", code: "UNSCANNED_BACKLINKS", path: "", message: "Backlinks in other worktrees, unregistered repos, chats and arbitrary prose are not checked. Confirm that this scope is sufficient." });
  const guard = { paths: scan.paths, documents: scan.documents.map((document) => ({ path: document.path, ...document.guard })), skipped: scan.skipped };
  const baseRequest = { ...request }; delete baseRequest.acknowledgements;
  const binding = hashObject({ context, request: baseRequest, guard });
  const diagnostics = issues.map((issue) => { const fingerprint = hashObject({ binding, issue }); return { ...issue, fingerprint, acknowledged: issue.severity === "review" && (request.acknowledgements ?? []).includes(fingerprint) }; });
  const decision = diagnostics.some((issue) => issue.severity === "blocked") ? "blocked" : !changes.length && !directories.length ? "noop"
    : diagnostics.some((issue) => !issue.acknowledged) ? "review" : "ready";
  const plan = { schema: 1, engine: "document-operations-1", request, context, actor: actorIdentity, repositories: repos, scan: guard, targetChecks: checks,
    changes, directories, references: references.references, issues: diagnostics, decision };
  return { ...plan, id: hashObject(plan) };
}

export function assertPlan(plan) {
  if (!plan || plan.schema !== 1 || plan.engine !== "document-operations-1") fail("INVALID_PLAN", "Unknown operation plan.");
  const { id, ...body } = plan;
  if (id !== hashObject(body)) fail("PLAN_CHANGED", "The reviewed plan was changed.");
  if (!["ready", "noop"].includes(plan.decision)) fail("PLAN_NOT_READY", "Resolve blocked findings and explicitly acknowledge reviewed limits by reanalysis.");
}
