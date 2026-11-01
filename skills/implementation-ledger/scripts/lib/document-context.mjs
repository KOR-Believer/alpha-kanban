import { constants } from "node:fs";
import { access, lstat, readdir, readFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { ContextError } from "./context-error.mjs";
import { parseSettings } from "./document-settings.mjs";
import { checkNewOwner, ownerFromPath } from "./document-owner.mjs";

const exec = promisify(execFile);
const unused = () => ({ status: "not-needed", value: null, source: null });
const relative = (root, target) => path.relative(root, target).split(path.sep).join("/");
const inside = (root, target) => target === root || (!path.isAbsolute(path.relative(root, target)) && !path.relative(root, target).split(path.sep).includes(".."));

async function statOrMissing(target) {
  try { return await lstat(target); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function directory(target) {
  const resolved = await realpath(target);
  if (!(await lstat(resolved)).isDirectory()) throw new ContextError("NOT_DIRECTORY", "Expected a directory.", { source: target });
  await access(resolved, constants.R_OK | constants.X_OK);
  return resolved;
}

async function git(cwd, args) {
  // Identity follows the given directory, never a parent process's alternate Git context.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
  return (await exec("git", ["-C", cwd, ...args], { env, encoding: "utf8", timeout: 5000, maxBuffer: 2 * 1024 * 1024 })).stdout;
}

async function gitPaths(cwd) {
  const paths = [];
  for (const option of ["--show-toplevel", "--absolute-git-dir", "--git-common-dir"]) {
    const output = await git(cwd, ["rev-parse", "--path-format=absolute", option]);
    paths.push(await realpath(output.replace(/\r?\n$/, "")));
  }
  return { root: paths[0], gitDirectory: paths[1], commonDirectory: paths[2] };
}

async function projectContext(cwd) {
  const current = await directory(path.resolve(cwd));
  let markerRoot = current;
  while (!(await statOrMissing(path.join(markerRoot, ".git")))) {
    const parent = path.dirname(markerRoot);
    if (parent === markerRoot) return { projectRoot: current, currentWorktree: null, gitStatus: "none" };
    markerRoot = parent;
  }
  try {
    const info = await gitPaths(current);
    if (!inside(info.root, current)) throw new Error("The Git worktree does not contain the requested directory.");
    return { projectRoot: info.root, currentWorktree: info.root, gitStatus: "known", gitDirectory: info.gitDirectory, commonDirectory: info.commonDirectory };
  } catch {
    // Explicit edits can still use the known directory boundary without settings lookup.
    return { projectRoot: markerRoot, currentWorktree: null, gitStatus: "unresolved" };
  }
}

function requireGitContext(context) {
  if (context.gitStatus === "unresolved") throw new ContextError("GIT_UNRESOLVED", "Git could not resolve this worktree. Restore its Git connection before resolving inherited settings.", { source: context.projectRoot });
}

async function privateRoot(context) {
  requireGitContext(context);
  if (context.gitStatus === "none" || context.gitDirectory === context.commonDirectory) return context.projectRoot;
  try {
    const output = await git(context.projectRoot, ["worktree", "list", "--porcelain", "-z"]);
    const main = output.split("\0\0")[0].split("\0");
    if (main.includes("bare") || !main[0]?.startsWith("worktree ")) throw new Error("No main worktree.");
    const candidate = await directory(main[0].slice("worktree ".length));
    const actual = await gitPaths(candidate);
    if (actual.root !== candidate || actual.commonDirectory !== context.commonDirectory || actual.gitDirectory !== actual.commonDirectory) throw new Error("Main worktree identity mismatch.");
    return candidate;
  } catch {
    throw new ContextError("PRIVATE_ROOT_UNRESOLVED", "The original main worktree could not be verified. Restore missing connections/access; bare or unverifiable separate-git-dir origins cannot inherit a private user. Explicit document targets remain available without identity lookup.", { source: context.commonDirectory });
  }
}

async function workspaceRoot(context) {
  requireGitContext(context);
  if (context.gitStatus === "none") return null;
  const config = path.join(context.commonDirectory, "config");
  let values;
  try {
    values = (await git(context.projectRoot, ["config", "--file", config, "--no-includes", "--null", "--get-all", "alphaKanban.workspaceRoot"])).split("\0");
    if (values.at(-1) === "") values.pop();
  } catch (error) {
    if (error.code === 1) return null;
    throw new ContextError("WORKSPACE_UNRESOLVED", "Could not read the repository's workspace connection.", { source: config });
  }
  if (values.length !== 1 || !path.isAbsolute(values[0])) throw new ContextError("WORKSPACE_INVALID", "Set exactly one absolute alphaKanban.workspaceRoot path in the common Git config.", { source: config });
  try { return await directory(values[0]); }
  catch { throw new ContextError("WORKSPACE_UNRESOLVED", "The configured workspace is unavailable. Reconnect it explicitly instead of falling back to another workspace.", { source: config, workspace: values[0] }); }
}

async function readText(target) {
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new ContextError("UNSUPPORTED_FILE", "Expected a regular file, not a directory or symbolic link.", { source: target });
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(target));
}

async function setting(root, kind, scope) {
  const file = path.join(root, `.ak.${kind}`);
  let text;
  try { text = await readText(file); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw new ContextError("SETTINGS_READ_FAILED", "Could not read a regular UTF-8 settings file.", { source: file });
  }
  const parsed = parseSettings(text, kind, file);
  return parsed.present ? { status: "known", value: parsed.value, source: { scope, path: file } } : null;
}

async function safeTarget(root, input, kind) {
  let target = path.resolve(root, input);
  // The project itself may be reached through an OS alias (e.g. /var -> /private/var).
  // Rebase only a verified alias of the project root; links below it are still refused.
  if (path.isAbsolute(input) && !inside(root, target)) {
    let candidate = target;
    const suffix = [];
    while (path.dirname(candidate) !== candidate) {
      try {
        if (await realpath(candidate) === root) { target = path.join(root, ...suffix); break; }
      } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
      suffix.unshift(path.basename(candidate)); candidate = path.dirname(candidate);
    }
  }
  if (!inside(root, target)) throw new ContextError("OUTSIDE_PROJECT", "The target must stay inside the current project/worktree.", { source: target });
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const [index, part] of parts.entries()) {
    if (part === ".git") throw new ContextError("GIT_PATH", "Git administration paths are not document targets.", { source: target });
    cursor = path.join(cursor, part);
    const info = await statOrMissing(cursor);
    if (!info) continue;
    if (info.isSymbolicLink()) throw new ContextError("SYMLINK_TARGET", "A document target may not traverse symbolic links.", { source: cursor });
    const last = index === parts.length - 1;
    if ((!last || kind === "directory") && !info.isDirectory()) throw new ContextError("NOT_DIRECTORY", "A target parent is not a directory.", { source: cursor });
    if (info.isDirectory() && await statOrMissing(path.join(cursor, ".git"))) throw new ContextError("NESTED_REPOSITORY", "Run from the nested repository to target its documents.", { source: cursor });
    if (last && kind === "file" && !info.isFile()) throw new ContextError("UNSUPPORTED_FILE", "Expected an existing document file.", { source: cursor });
  }
  if (kind === "file") {
    const info = await statOrMissing(target);
    if (!info) throw new ContextError("DOCUMENT_MISSING", "The document does not exist.", { source: target });
    if (!info.isFile()) throw new ContextError("UNSUPPORTED_FILE", "Expected an existing document file.", { source: target });
  }
  return target;
}

async function ownerDirectory(root, owner) {
  const docs = await safeTarget(root, "docs", "directory");
  const entries = await statOrMissing(docs) ? await readdir(docs, { withFileTypes: true }) : [];
  const matches = entries.filter(entry => entry.name.normalize("NFC").toLowerCase() === owner.toLowerCase());
  if (matches.length > 1 || (matches.length === 1 && matches[0].name.normalize("NFC") !== owner)) throw new ContextError("OWNER_COLLISION", "Owner folders differ only in case or Unicode spelling. Resolve the collision explicitly.", { source: docs, owner });
  return safeTarget(root, path.join("docs", matches[0]?.name ?? owner), "directory");
}

async function nextNumber(scope) {
  let maximum = 0;
  let visited = 0;
  async function scan(dir, depth) {
    if (depth > 64) throw new ContextError("NUMBER_SCAN_LIMIT", "Cannot determine the next number from an incomplete directory scan.", { source: dir });
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (++visited > 20000) throw new ContextError("NUMBER_SCAN_LIMIT", "Cannot determine the next number from an incomplete directory scan.", { source: dir });
      if (entry.isSymbolicLink()) throw new ContextError("NUMBER_SCAN_LINK", "Numbering cannot traverse symbolic links.", { source: target });
      if (entry.isDirectory()) {
        if (entry.name === ".git" || await statOrMissing(path.join(target, ".git"))) throw new ContextError("NESTED_REPOSITORY", "Numbering cannot cross a nested repository.", { source: target });
        await scan(target, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const digits = /^(\d+)_/.exec(entry.name)?.[1];
        if (!digits) continue;
        const number = Number(digits);
        if (!Number.isSafeInteger(number) || number >= Number.MAX_SAFE_INTEGER) throw new ContextError("NUMBER_OVERFLOW", "The next document number cannot be represented exactly.", { source: target });
        maximum = Math.max(maximum, number);
      }
    }
  }
  if (await statOrMissing(scope)) await scan(scope, 0);
  return { mode: "owner", scope, maximum, next: String(maximum + 1).padStart(2, "0") };
}

/** Read-only context for skill-created documents; home is injectable for isolated callers/tests. */
export async function resolveDocumentContext({ operation = "new", cwd = process.cwd(), target, baseDir = "docs", home = os.homedir() } = {}) {
  const result = { ok: false, operation, context: null, policy: unused(), user: unused(), document: null, numbering: null, diagnostics: [] };
  try {
    if (!["new", "edit", "actor", "check-new"].includes(operation)) throw new ContextError("INVALID_REQUEST", "Unknown operation.");
    if (["edit", "check-new"].includes(operation) && !target) throw new ContextError("INVALID_REQUEST", "This operation requires --target.");
    if (operation === "actor" && target) throw new ContextError("INVALID_REQUEST", "actor does not accept a document target.");
    const context = result.context = await projectContext(cwd);
    let workspace;
    const workspaceOnce = async () => {
      if (workspace === undefined) context.workspaceRoot = workspace = await workspaceRoot(context);
      return workspace;
    };
    const actor = async () => {
      result.user = { status: "unresolved", value: null, source: null };
      const root = context.privateSettingsRoot = await privateRoot(context);
      let chosen = await setting(root, "user", "repo");
      if (!chosen) {
        const workspace = await workspaceOnce();
        if (workspace) chosen = await setting(workspace, "user", "workspace");
      }
      if (!chosen) chosen = await setting(await directory(home), "user", "home");
      result.user = chosen ?? { status: "unset", value: null, source: null };
      if (!chosen) throw new ContextError("USER_REQUIRED", "Set user.id in a private .ak.user before requesting a user-dependent location or scope.");
      return chosen.value;
    };
    if (operation === "actor") {
      await actor();
    } else if (operation === "edit" || operation === "check-new") {
      const file = await safeTarget(context.projectRoot, target, "file");
      const owner = ownerFromPath(relative(context.projectRoot, file));
      result.document = { path: file, relativePath: relative(context.projectRoot, file), pathOwner: owner, createDirectory: false, ownerAction: "preserve", ownerHeader: null };
      if (operation === "check-new") {
        if (owner.status === "invalid") throw new ContextError("INVALID_OWNER", "The target has an invalid owner folder.", { source: file });
        if (owner.value) await ownerDirectory(context.projectRoot, owner.value);
        result.document.recordedOwner = checkNewOwner(await readText(file), owner.value);
      }
    } else {
      let destination;
      if (target !== undefined) {
        destination = await safeTarget(context.projectRoot, target, "directory");
      } else {
        result.policy = { status: "unresolved", value: null, source: null };
        let policy = await setting(context.projectRoot, "config", "repo");
        if (!policy) {
          const workspace = await workspaceOnce();
          if (workspace) policy = await setting(workspace, "config", "workspace");
        }
        result.policy = policy ?? { status: "known", value: false, source: { scope: "default", path: null } };
        destination = result.policy.value ? await ownerDirectory(context.projectRoot, await actor()) : await safeTarget(context.projectRoot, baseDir, "directory");
      }
      const owner = ownerFromPath(relative(context.projectRoot, destination));
      if (owner.status === "invalid") throw new ContextError("INVALID_OWNER", "The target has an invalid owner folder.", { source: destination });
      if (owner.value && target === undefined && result.policy.value === false) throw new ContextError("EXPLICIT_OWNER_TARGET", "Use --target only when the owner folder was explicitly requested; an existing @ folder does not enable ownerFolders.", { source: destination });
      if (owner.value) {
        const scope = await ownerDirectory(context.projectRoot, owner.value);
        // Use the existing Unicode spelling, without renaming the folder.
        destination = path.join(scope, ...owner.descendants);
        await safeTarget(context.projectRoot, destination, "directory");
        result.numbering = await nextNumber(scope);
      } else result.numbering = { mode: "existing-convention", scope: destination };
      result.document = {
        path: destination, relativePath: relative(context.projectRoot, destination), pathOwner: owner,
        createDirectory: !(await statOrMissing(destination)), ownerAction: owner.value ? "record-on-new-document" : "omit-on-new-document",
        ownerHeader: owner.value ? `Owner: ${owner.value}` : null,
      };
    }
    result.ok = true;
  } catch (error) {
    result.diagnostics.push(error instanceof ContextError ? error.diagnostic : { code: "READ_FAILED", message: error.message, source: error.path ?? null });
  }
  return result;
}
