import { constants } from "node:fs";
import { lstat, readdir, readFile, realpath, open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { projectPath } from "../../packages/shared/src/documentPaths.mjs";

const exec = promisify(execFile);
export class OperationError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "DocumentOperationError"; this.code = code; this.details = details; }
}
export const fail = (code, message, details) => { throw new OperationError(code, message, details); };
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const stable = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const hashObject = (value) => sha(stable(value));
export const portable = (value) => value.split(path.sep).join("/");
export const contained = (root, file) => { const rel = path.relative(root, file); return rel === "" || (!path.isAbsolute(rel) && rel.split(path.sep)[0] !== ".."); };
export async function maybeStat(file) { try { return await lstat(file, { bigint: true }); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

export async function git(cwd, args, { diagnostics = false } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
  try {
    const { stdout, stderr } = await exec("git", ["-C", cwd, ...args], { env, encoding: "utf8", timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    return diagnostics ? { stdout, stderr } : stdout.replace(/\r?\n$/, "");
  }
  catch { fail("GIT_UNAVAILABLE", "Read-only Git identity could not be established."); }
}
export async function worktreeContext(cwd) {
  const current = await realpath(path.resolve(cwd));
  const paths = [];
  for (const option of ["--show-toplevel", "--absolute-git-dir", "--git-common-dir"]) paths.push(await realpath(await git(current, ["rev-parse", "--path-format=absolute", option])));
  if (!contained(paths[0], current)) fail("WRONG_WORKTREE", "The working directory is outside its Git worktree.");
  const head = await git(current, ["rev-parse", "--verify", "HEAD"]);
  // A same-commit branch switch is still a context change.
  const headFile = await readFile(path.join(paths[1], "HEAD"), "utf8");
  return { root: paths[0], gitDirectory: paths[1], commonDirectory: paths[2], head, headFile: headFile.trim() };
}
export function normalizeRemote(value) {
  let host, repo;
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
  if (!value.includes("://") && scp && !/^[A-Za-z]:[\\/]/.test(value)) { host = scp[1]; repo = scp[2]; }
  else {
    try {
      const url = new URL(value);
      if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol) || url.search || url.hash) return null;
      const defaultPort = { "https:": "443", "http:": "80", "ssh:": "22", "git:": "9418" }[url.protocol];
      host = url.hostname + (url.port && url.port !== defaultPort ? ":" + url.port : ""); repo = url.pathname;
    }
    catch { return null; }
  }
  return host.toLowerCase() + "/" + repo.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
}

export async function safePath(root, relative, { missing = false } = {}) {
  projectPath(relative);
  let current = root;
  const parts = relative.split("/");
  if (parts.some((part) => part.toLowerCase() === ".git")) fail("GIT_BOUNDARY", "Git administrative paths are not document targets.");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.toLowerCase() === ".git") fail("GIT_BOUNDARY", "Git administrative paths are not document targets.");
    const parent = await maybeStat(current);
    if (!parent) { if (missing) return path.join(root, ...parts); fail("MISSING_PATH", "An input path is missing.", { path: relative }); }
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail("SYMLINK_BOUNDARY", "A path parent is not a real directory.", { path: relative });
    const siblings = (await readdir(current)).filter((name) => name.normalize("NFC").toLowerCase() === part.normalize("NFC").toLowerCase());
    if (siblings.some((name) => name !== part)) fail("PATH_COLLISION", "A path differs only by case or Unicode normalization.", { path: relative });
    current = path.join(current, part);
    const stat = await maybeStat(current);
    if (!stat) { if (missing) return path.join(root, ...parts); fail("MISSING_PATH", "An input path is missing.", { path: relative }); }
    if (stat.isSymbolicLink()) fail("SYMLINK_BOUNDARY", "Symlinks are not followed.", { path: relative });
    if (stat.isDirectory() && await maybeStat(path.join(current, ".git"))) fail("NESTED_REPOSITORY", "A nested repository or worktree is outside this operation.", { path: relative });
    if (i < parts.length - 1 && !stat.isDirectory()) fail("NOT_DIRECTORY", "An intermediate path is not a directory.", { path: relative });
  }
  if (!contained(root, await realpath(current))) fail("PATH_ESCAPE", "A path resolves outside the worktree.");
  return current;
}

export async function nativeAttributes(file) {
  if (process.platform !== "darwin") return { platform: process.platform, xattrs: null, directoryAcl: null, flags: null };
  const names = (await exec("/usr/bin/xattr", [file], { encoding: "utf8" })).stdout.trim().split("\n").filter(Boolean).sort();
  const xattrs = {};
  for (const name of names) xattrs[name] = (await exec("/usr/bin/xattr", ["-px", name, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })).stdout.replace(/\s/g, "").toLowerCase();
  const stat = await lstat(file);
  let directoryAcl = null, flags = null;
  if (stat.isDirectory()) {
    directoryAcl = (await exec("/bin/ls", ["-lde", file], { encoding: "utf8" })).stdout.split("\n").slice(1).filter(Boolean);
    flags = (await exec("/usr/bin/stat", ["-f", "%Sf", file], { encoding: "utf8" })).stdout.trim();
  }
  return { platform: process.platform, xattrs, directoryAcl, flags };
}

export function statRecord(stat) {
  return { kind: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "unsupported", dev: String(stat.dev), ino: String(stat.ino),
    size: String(stat.size), mode: Number(stat.mode & 0o7777n), uid: Number(stat.uid), gid: Number(stat.gid), nlink: Number(stat.nlink), mtimeNs: String(stat.mtimeNs) };
}
export async function snapshot(file, { bytes = true, attributes = false } = {}) {
  const info = await lstat(file, { bigint: true });
  if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) fail("UNSUPPORTED_FILE", "Only regular files and real directories are supported.");
  const result = statRecord(info);
  if (info.isFile() && bytes) {
    if (info.size > 64n * 1024n * 1024n) fail("FILE_TOO_LARGE", "Files above 64 MiB require a separate operation.");
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (String((await handle.stat({ bigint: true })).ino) !== result.ino) fail("STALE_FILE", "A file changed while reading.");
      const data = await handle.readFile();
      const after = statRecord(await handle.stat({ bigint: true }));
      if (hashObject(result) !== hashObject(after)) fail("STALE_FILE", "A file changed while reading.");
      result.hash = sha(data); result.bytes = data.toString("base64");
    } finally { await handle.close(); }
  }
  if (attributes) result.attributes = await nativeAttributes(file);
  return result;
}
export function decodeMarkdown(record) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(record.bytes, "base64")); }
  catch { fail("INVALID_UTF8", "The Markdown file is not valid UTF-8."); }
}

export const EXCLUDED = new Set([".git", "node_modules", ".pnpm", ".cache", ".next", "dist", "dist-browser", "build", "coverage", ".playwright-cli", "output"]);
export const DOCUMENT_SCAN_POLICY = "git-markdown-and-scope-v1";

/** Explicit write scopes retain their complete physical inventory. Outside them,
 * Git supplies only tracked/nonignored Markdown candidates for backlink checks.
 * Omitting scopes preserves the scan contract of previously reviewed journals. */
export async function scanWorktree(root, documentRoot = "docs", scopes) {
  if (scopes === undefined) return scanLegacyWorktree(root, documentRoot);
  const paths = new Map(), documents = new Map(), skipped = new Map(), inspected = new Map();
  const selected = relative => scopes.some(scope => relative === scope || relative.startsWith(scope + "/"));
  const skip = (relative, code) => skipped.set(relative, { path: relative, code });
  const addPath = (relative, kind) => {
    paths.set(relative, { path: relative, kind });
    if (paths.size > 20_000) fail("SCAN_LIMIT", "The selected scope and Markdown references exceed 20,000 entries; no complete plan was produced.", { path: relative, scope: scopes, policy: DOCUMENT_SCAN_POLICY });
  };
  // Check each ancestor before reading a Git candidate; Git's index may name a
  // deleted file, a symlink, or a path now occupied by a nested checkout.
  const inspect = async (relative, includeParents = false) => {
    projectPath(relative);
    const parts = relative.split("/");
    let prefix = "", info;
    for (let i = 0; i < parts.length; i++) {
      prefix = prefix ? prefix + "/" + parts[i] : parts[i];
      if (EXCLUDED.has(parts[i]) && !(prefix === documentRoot || documentRoot.startsWith(prefix + "/"))) {
        if (parts[i] !== ".git") skip(prefix, "EXCLUDED_DIRECTORY");
        return null;
      }
      if (!inspected.has(prefix)) {
        let record = null;
        try {
          record = await maybeStat(path.join(root, prefix));
          if (record?.isSymbolicLink()) { skip(prefix, "SYMLINK"); record = null; }
          else if (record?.isDirectory() && await maybeStat(path.join(root, prefix, ".git"))) { skip(prefix, "NESTED_REPOSITORY"); record = null; }
          else if (record && !record.isDirectory() && !record.isFile()) { skip(prefix, "SPECIAL_FILE"); record = null; }
        } catch { skip(prefix, "UNREADABLE_PATH"); record = null; }
        inspected.set(prefix, record);
      }
      info = inspected.get(prefix);
      if (!info) return null;
      if (i < parts.length - 1 && !info.isDirectory()) { skip(prefix, "NOT_DIRECTORY"); return null; }
      if (includeParents && info.isDirectory()) addPath(prefix, "directory");
    }
    return info;
  };
  const readMarkdown = async relative => {
    if (documents.has(relative)) return;
    try {
      const record = await snapshot(path.join(root, relative));
      documents.set(relative, { path: relative, markdown: decodeMarkdown(record), guard: { ...record, bytes: undefined } });
    } catch (error) { skip(relative, error.code ?? "UNREADABLE_MARKDOWN"); }
  };
  const walk = async relative => {
    if (paths.has(relative) && paths.get(relative).kind === "file") return;
    const info = await inspect(relative);
    if (!info) return;
    addPath(relative, info.isDirectory() ? "directory" : "file");
    if (info.isFile()) { if (/\.md$/i.test(relative)) await readMarkdown(relative); return; }
    let entries;
    try { entries = await readdir(path.join(root, relative)); }
    catch { skip(relative, "UNREADABLE_DIRECTORY"); return; }
    for (const name of entries.sort((a, b) => a.localeCompare(b))) await walk(relative + "/" + name);
  };
  const roots = [...new Set(scopes)].sort().filter((scope, index, all) => !all.slice(0, index).some(parent => scope.startsWith(parent + "/")));
  for (const scope of roots) {
    // Existing ancestors matter when a file-level scope requires new directories.
    if (await inspect(scope, true)) await walk(scope);
  }
  const listing = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z", "--", ":(icase,glob)**/*.md"], { diagnostics: true });
  // Git can exit successfully after skipping an unreadable directory. Keep that
  // coverage gap visible and bound to the plan instead of claiming a clean scan.
  if (listing.stderr.trim()) skipped.set("", { path: "", code: "GIT_SCAN_WARNING", message: listing.stderr.trim() });
  const candidates = listing.stdout.split("\0").filter(Boolean);
  for (const relative of [...new Set(candidates)].sort((a, b) => a.localeCompare(b))) {
    if (selected(relative)) continue;
    const info = await inspect(relative);
    if (!info) continue;
    if (!info.isFile()) { skip(relative, "NOT_REGULAR_MARKDOWN"); continue; }
    addPath(relative, "file"); await readMarkdown(relative);
  }
  const ordered = values => [...values].sort((a, b) => a.path.localeCompare(b.path));
  return { documents: ordered(documents.values()), paths: ordered(paths.values()), skipped: ordered(skipped.values()) };
}

// Old plans/journals keep their original coverage through apply/resume/recover.
async function scanLegacyWorktree(root, documentRoot) {
  const documents = [], paths = [], skipped = [];
  const walk = async (directory, relative = "") => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { skipped.push({ path: relative, code: "UNREADABLE_DIRECTORY" }); return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relative ? relative + "/" + entry.name : entry.name;
      if (paths.length > 20_000) fail("SCAN_LIMIT", "The scan exceeds 20,000 entries; no complete plan was produced.");
      if (EXCLUDED.has(entry.name) && !(rel === documentRoot || documentRoot.startsWith(rel + "/"))) { if (entry.name !== ".git") skipped.push({ path: rel, code: "EXCLUDED_DIRECTORY" }); continue; }
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { skipped.push({ path: rel, code: "SYMLINK" }); continue; }
      if (entry.isDirectory()) {
        if (await maybeStat(path.join(absolute, ".git"))) { skipped.push({ path: rel, code: "NESTED_REPOSITORY" }); continue; }
        paths.push({ path: rel, kind: "directory" }); await walk(absolute, rel);
      } else if (entry.isFile()) {
        paths.push({ path: rel, kind: "file" });
        if (/\.md$/i.test(entry.name)) {
          try { const record = await snapshot(absolute); documents.push({ path: rel, markdown: decodeMarkdown(record), guard: { ...record, bytes: undefined } }); }
          catch (error) { skipped.push({ path: rel, code: error.code ?? "UNREADABLE_MARKDOWN" }); }
        }
      } else skipped.push({ path: rel, code: "SPECIAL_FILE" });
    }
  };
  await walk(root);
  return { documents, paths, skipped };
}
