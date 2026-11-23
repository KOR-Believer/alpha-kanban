import { normalizeGitRemote as normalizeRemote } from "@alpha-kanban/shared/revisionLinks";
import { normalizeLink } from "./linkPaths";

export { normalizeRemote };
export type GrantedRoot = { id: string; name: string; handle: FileSystemDirectoryHandle };
export type RepoCandidate = { id: string; handle: FileSystemDirectoryHandle; label: string; remotes: string[]; rootId: string; rootName?: string; path: string; kind?: "repo" | "worktree"; gitDirectory?: FileSystemDirectoryHandle };
export type RepoScan = { repos: RepoCandidate[]; complete: boolean; visited: number; reasons: string[] };
export const REPO_SCAN_LIMITS = { depth: 20, directories: 3000, entries: 50000, milliseconds: 8000 };
type ScanOptions = {
  signal?: AbortSignal;
  refresh?: boolean;
  continuous?: boolean;
  onProgress?: (result: RepoScan) => void;
  revision?: { sourceRootId?: string; preferredRemote?: string };
};
const excluded = new Set(["node_modules", "vendor", "dist", "dist-browser", "build", "coverage", "target"]);

export function hasGitRemote(repo: RepoCandidate, hint: string) {
  return repo.remotes.some(remote => remote.slice(remote.indexOf("=") + 1) === hint);
}

export function gitRemotes(config: string): string[] {
  if (/^\s*\[\s*(?:include|includeIf|url)\b/im.test(config) || /\\\r?\n/.test(config)) return [];
  const values = new Map<string, string>();
  let remote: string | undefined;
  for (const line of config.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) { remote = line.match(/^\s*\[remote\s+"([^"\n]+)"\]\s*(?:[#;].*)?$/i)?.[1]; continue; }
    const match = remote && line.match(/^\s*url\s*=\s*(.*?)\s*$/i);
    if (remote && match) {
      let value = match[1]!;
      if (value.startsWith('"')) { if (!/^"[^"\\]*"\s*(?:[#;].*)?$/.test(value)) return []; value = value.slice(1, value.indexOf('"', 1)); }
      else value = value.replace(/\s+[;#].*$/, "");
      const normalized = normalizeRemote(value);
      if (!normalized || values.has(remote)) return [];
      values.set(remote, normalized);
    }
  }
  // Include the remote name: a fork's upstream is not equivalent to its origin.
  return [...values].map(([name, value]) => name + "=" + value).sort();
}

async function textAt(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
  const file = await (await directory.getFileHandle(name)).getFile();
  if (file.size > 256 * 1024) throw new Error("Git metadata is too large");
  return file.text();
}

async function directoryAt(root: FileSystemDirectoryHandle, from: string, relative: string): Promise<{ directory: FileSystemDirectoryHandle; path: string }> {
  if (/^(?:[/\\]|[a-z]:)/i.test(relative)) throw new Error("Git metadata is outside the granted path");
  const normalized = normalizeLink(relative + "/__directory__", from + "/__source__").path.slice(2).replace(/\/__directory__$/, "");
  if (normalized.split("/").includes("..")) throw new Error("Git metadata is outside the granted path");
  let directory = root;
  for (const part of normalized.split("/").filter(Boolean)) directory = await directory.getDirectoryHandle(part);
  return { directory, path: normalized };
}

// A native absolute pointer alone cannot identify a browser folder. For revision
// reads within one grant, the admin directory's reverse pointer must also name
// the selected worktree under the very same prefix. All actual reads use handles.
async function pairedWorktreeDirectory(root: GrantedRoot, worktreePath: string, pointer: string) {
  const native = pointer.replaceAll("\\", "/");
  if (!worktreePath || !/^(?:\/|[a-z]:\/)/i.test(native) || !/\/\.git\/worktrees\/[^/]+$/.test(native)) return;
  const parts = native.split("/");
  if (parts.length > 128 || parts.some(part => part === "." || part === "..")) return;
  const equal = (a: string, b: string) => /^[a-z]:\//i.test(native) ? a.toLowerCase() === b.toLowerCase() : a === b;
  let found: {directory: FileSystemDirectoryHandle; path: string} | undefined;
  for (let i = 0; i < parts.length - 3; i++) {
    if (!equal(parts[i]!, root.handle.name)) continue;
    try {
      const candidate = await directoryAt(root.handle, "", parts.slice(i + 1).join("/"));
      const back = (await textAt(candidate.directory, "gitdir")).trim().replaceAll("\\", "/");
      if (!equal(back, [...parts.slice(0, i + 1), worktreePath, ".git"].join("/"))) continue;
      if (found) return;
      found = candidate;
    } catch { /* This spelling cannot be proven inside this grant. */ }
  }
  return found;
}

export async function inspectRepo(root: GrantedRoot, directory: FileSystemDirectoryHandle, path: string, verifyAbsoluteWorktree = false): Promise<RepoCandidate | undefined> {
  let git: FileSystemDirectoryHandle | undefined;
  let gitPath = [path, ".git"].filter(Boolean).join("/");
  let marker = false;
  let kind: RepoCandidate["kind"] = "repo";
  try { git = await directory.getDirectoryHandle(".git"); marker = true; }
  catch {
    try {
      const pointer = await textAt(directory, ".git"); marker = true;
      const match = pointer.trim().match(/^gitdir:\s*(.+)$/);
      if (match) {
        const pointerPath = match[1]!;
        const target = verifyAbsoluteWorktree && /^(?:[/\\]|[a-z]:)/i.test(pointerPath)
          ? await pairedWorktreeDirectory(root, path, pointerPath) : await directoryAt(root.handle, path, pointerPath);
        if (target) { git = target.directory; gitPath = target.path; }
      }
    } catch { /* A recognized but inaccessible marker remains an unknown repo boundary. */ }
  }
  if (!marker) return;
  let remotes: string[] = [];
  let gitDirectory: FileSystemDirectoryHandle | undefined;
  if (git) {
    try {
      let common = git;
      try { const commonPath = (await textAt(git, "commondir")).trim(); kind = "worktree"; common = (await directoryAt(root.handle, gitPath, commonPath)).directory; }
      catch (error) { if (!(error instanceof Error && error.name === "NotFoundError")) throw error; }
      gitDirectory = common;
      let config = await textAt(common, "config");
      // Worktree-specific remote overrides are uncommon; combine them conservatively.
      if (/worktreeConfig\s*=\s*true/i.test(config)) {
        try { config += "\n" + await textAt(git, "config.worktree"); }
        catch (error) { if (!(error instanceof Error && error.name === "NotFoundError")) throw error; }
      }
      remotes = gitRemotes(config);
    } catch { /* Offer manual selection without guessing an identity. */ }
  }
  return { id: root.id + ":" + path, handle: directory, label: [root.name, path].filter(Boolean).join("/"), remotes, rootId: root.id, rootName: root.name, path, kind, gitDirectory };
}

type ScanFolder = { root: GrantedRoot; directory: FileSystemDirectoryHandle; path: string; depth: number };

async function findRepo(folder: ScanFolder, grants: GrantedRoot[], revision: boolean) {
  const repo = await inspectRepo(folder.root, folder.directory, folder.path, revision);
  if (!repo || repo.remotes.length) return repo;
  for (const grant of grants) {
    if (grant.id === folder.root.id) continue;
    const path = await grant.handle.resolve(folder.directory);
    if (!path) continue;
    const wider = await inspectRepo(grant, folder.directory, path.join("/"), revision);
    if (wider?.gitDirectory) {
      repo.gitDirectory = wider.gitDirectory;
      repo.remotes = wider.remotes;
      if (repo.remotes.length) break;
    }
  }
  return repo;
}

export class RepoDiscovery {
  private cached?: { roots: GrantedRoot[]; mode: string; result: RepoScan; at: number };
  constructor(private readonly limits = REPO_SCAN_LIMITS) {}
  clear() { this.cached = undefined; }
  async scan(roots: GrantedRoot[], options: ScanOptions = {}): Promise<RepoScan> {
    const { signal, onProgress } = options;
    const source = roots.find(root => root.id === options.revision?.sourceRootId);
    // A cached inventory belongs to its search scope and may end at a batch
    // boundary. It cannot stand in for a continuous or differently scoped search.
    const mode = JSON.stringify([Boolean(options.continuous), Boolean(options.revision), source?.id, options.revision?.preferredRemote]);
    const cached = this.cached;
    if (!signal?.aborted && !options.refresh && cached?.mode === mode && Date.now() - cached.at < 60_000 && roots.length === cached.roots.length) {
      let same = true;
      for (let i = 0; i < roots.length; i++) if (roots[i]!.id !== cached.roots[i]!.id || !await roots[i]!.handle.isSameEntry(cached.roots[i]!.handle) || await roots[i]!.handle.queryPermission({ mode: "read" }) !== "granted") same = false;
      if (same && !signal?.aborted) return cached.result;
    }
    const result: RepoScan = { repos: [], complete: true, visited: 0, reasons: [] };
    const partial = (reason: string) => { result.complete = false; if (!result.reasons.includes(reason)) result.reasons.push(reason); };
    const limits = this.limits;
    let batchStart = Date.now(), foldersInBatch = 0, entriesInBatch = 0;
    let lastProgress = 0;
    function publish(immediate = false) {
      const now = Date.now();
      if (!onProgress || (!immediate && now - lastProgress < 100)) return;
      lastProgress = now;
      onProgress({ ...result, complete: false, repos: [...result.repos], reasons: [...result.reasons] });
    }
    async function nextBatch(reason: string) {
      if (!options.continuous) { partial(reason); return false; }
      publish(true);
      // Yield to input, keeping the active directory iterator and queued folders.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      batchStart = Date.now(); foldersInBatch = 0; entriesInBatch = 0;
      return !signal?.aborted;
    }
    function limitReached(beforeFolder: boolean) {
      if (beforeFolder && foldersInBatch >= limits.directories) return "directories";
      if (entriesInBatch >= limits.entries) return "entries";
      if (Date.now() - batchStart >= limits.milliseconds) return "time";
    }
    const visited = new Set<string>();
    // Finish the citing workspace first. Other revision roots share a breadth-first
    // pass, so a deep unrelated tree cannot hide a sibling checkout. Ordinary path
    // discovery retains the requesting connection's priority.
    const groups = source ? [[source], roots.filter(root => root !== source)] : options.revision ? [roots] : roots.map(root => [root]);
    scan: for (const group of groups) {
      let level: ScanFolder[] = group.map(root => ({ root, directory: root.handle, path: "", depth: 0 }));
      while (level.length) {
        const children: ScanFolder[] = [];
        for (const item of level) {
          if (signal?.aborted) break scan;
          const key = item.root.id + ":" + item.path;
          if (visited.has(key)) continue;
          const limit = limitReached(true);
          if (limit && !await nextBatch(limit)) break scan;
          visited.add(key);
          result.visited++; foldersInBatch++;
          try {
            if (await item.directory.queryPermission({ mode: "read" }) !== "granted") { partial("permission"); continue; }
            const repo = await findRepo(item, roots, Boolean(options.revision));
            if (repo) {
              let duplicate = false;
              for (const prior of result.repos) if (await prior.handle.isSameEntry(repo.handle)) { duplicate = true; break; }
              if (!duplicate) { result.repos.push(repo); publish(result.repos.length === 1); }
            }
            if (signal?.aborted) break scan;
            for await (const handle of item.directory.values()) {
              if (signal?.aborted) break scan;
              const entryLimit = limitReached(false);
              if (entryLimit && !await nextBatch(entryLimit)) break scan;
              entriesInBatch++;
              if (handle.kind !== "directory" || handle.name.startsWith(".") || excluded.has(handle.name)) continue;
              if (item.depth >= limits.depth) { partial("depth"); continue; }
              children.push({ root: item.root, directory: handle, path: [item.path, handle.name].filter(Boolean).join("/"), depth: item.depth + 1 });
            }
          } catch { partial("unavailable"); }
          if (result.visited % 20 === 0) publish();
        }
        level = children;
      }
      const remote = options.revision?.preferredRemote;
      if (source && group[0] === source && remote && !signal?.aborted && result.complete && result.repos.some(repo => hasGitRemote(repo, remote))) {
        // All candidates in the citing workspace are known. Other workspaces
        // are fallback locations; the manual change-folder search includes them.
        break;
      }
    }
    if (signal?.aborted) partial("cancelled");
    if (!signal?.aborted) this.cached = { roots, mode, result, at: Date.now() };
    return result;
  }
}
