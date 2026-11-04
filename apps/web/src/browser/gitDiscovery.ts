import { normalizeLink } from "./linkPaths";

export type GrantedRoot = { id: string; name: string; handle: FileSystemDirectoryHandle };
export type RepoCandidate = { id: string; handle: FileSystemDirectoryHandle; label: string; remotes: string[]; rootId: string; rootName?: string; path: string; kind?: "repo" | "worktree" };
export type RepoScan = { repos: RepoCandidate[]; complete: boolean; visited: number; reasons: string[] };
const excluded = new Set(["node_modules", "vendor", "dist", "dist-browser", "build", "coverage", "target"]);

// Exact host/path identities only. SSH aliases, local paths and includes need a human.
export function normalizeRemote(value: string): string | undefined {
  try {
    let input = value.trim();
    if (/^[^/@:]+@[^/:]+:/.test(input)) input = "ssh://" + input.replace(/^([^@]+@[^:]+):/, "$1/");
    const url = new URL(input);
    if (!["ssh:", "https:", "http:", "git:"].includes(url.protocol) || !url.hostname.includes(".") || url.search || url.hash) return;
    const port = (url.protocol === "ssh:" && url.port === "22") || (url.protocol === "git:" && url.port === "9418") ? "" : url.port;
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    if (!path || /[\s%\\]/.test(path) || path.split("/").some((part) => part === "." || part === "..")) return;
    return `${url.hostname.toLowerCase()}${port ? ":" + port : ""}/${path}`;
  } catch { return; }
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

export async function inspectRepo(root: GrantedRoot, directory: FileSystemDirectoryHandle, path: string): Promise<RepoCandidate | undefined> {
  let git: FileSystemDirectoryHandle | undefined;
  let gitPath = [path, ".git"].filter(Boolean).join("/");
  let marker = false;
  let kind: RepoCandidate["kind"] = "repo";
  try { git = await directory.getDirectoryHandle(".git"); marker = true; }
  catch {
    try {
      const pointer = await textAt(directory, ".git"); marker = true;
      const match = pointer.trim().match(/^gitdir:\s*(.+)$/);
      if (match) { const target = await directoryAt(root.handle, path, match[1]!); git = target.directory; gitPath = target.path; }
    } catch { /* A recognized but inaccessible marker remains an unknown repo boundary. */ }
  }
  if (!marker) return;
  let remotes: string[] = [];
  if (git) {
    try {
      let common = git;
      try { const commonPath = (await textAt(git, "commondir")).trim(); kind = "worktree"; common = (await directoryAt(root.handle, gitPath, commonPath)).directory; }
      catch (error) { if (!(error instanceof Error && error.name === "NotFoundError")) throw error; }
      let config = await textAt(common, "config");
      // Worktree-specific remote overrides are uncommon; combine them conservatively.
      if (/worktreeConfig\s*=\s*true/i.test(config)) {
        try { config += "\n" + await textAt(git, "config.worktree"); }
        catch (error) { if (!(error instanceof Error && error.name === "NotFoundError")) throw error; }
      }
      remotes = gitRemotes(config);
    } catch { /* Offer manual selection without guessing an identity. */ }
  }
  return { id: root.id + ":" + path, handle: directory, label: [root.name, path].filter(Boolean).join("/"), remotes, rootId: root.id, rootName: root.name, path, kind };
}

export class RepoDiscovery {
  private cached?: { roots: GrantedRoot[]; result: RepoScan; at: number };
  constructor(private readonly limits = { depth: 20, directories: 3000, entries: 50000, milliseconds: 8000 }) {}
  clear() { this.cached = undefined; }
  async scan(roots: GrantedRoot[], options: { signal?: AbortSignal; refresh?: boolean; onProgress?: (result: RepoScan) => void } = {}): Promise<RepoScan> {
    const { signal, onProgress } = options;
    if (!options.refresh && this.cached && Date.now() - this.cached.at < 60_000 && roots.length === this.cached.roots.length) {
      let same = true;
      for (let i = 0; i < roots.length; i++) if (roots[i]!.id !== this.cached.roots[i]!.id || !await roots[i]!.handle.isSameEntry(this.cached.roots[i]!.handle) || await roots[i]!.handle.queryPermission({ mode: "read" }) !== "granted") same = false;
      if (same) return this.cached.result;
    }
    const result: RepoScan = { repos: [], complete: true, visited: 0, reasons: [] };
    const partial = (reason: string) => { result.complete = false; if (!result.reasons.includes(reason)) result.reasons.push(reason); };
    const start = Date.now(); let entries = 0;
    const queue = roots.map((root) => ({ root, directory: root.handle, path: "", depth: 0 }));
    const visited = new Set<string>();
    while (queue.length) {
      if (signal?.aborted) { partial("cancelled"); break; }
      if (result.visited >= this.limits.directories || entries >= this.limits.entries || Date.now() - start > this.limits.milliseconds) { partial("limit"); break; }
      const item = queue.shift()!;
      const key = item.root.id + ":" + item.path;
      if (visited.has(key)) continue;
      visited.add(key);
      result.visited++;
      try {
        if (await item.directory.queryPermission({ mode: "read" }) !== "granted") { partial("permission"); continue; }
        const repo = await inspectRepo(item.root, item.directory, item.path);
        if (repo) {
          if (!repo.remotes.length) {
            for (const grant of roots) {
              if (grant.id === item.root.id) continue;
              const path = await grant.handle.resolve(item.directory);
              if (!path) continue;
              const wider = await inspectRepo(grant, item.directory, path.join("/"));
              if (wider?.remotes.length) { repo.remotes = wider.remotes; break; }
            }
          }
          let duplicate = false;
          for (const prior of result.repos) if (await prior.handle.isSameEntry(repo.handle)) { duplicate = true; break; }
          if (!duplicate) result.repos.push(repo);
        }
        const children: typeof queue = [];
        for await (const handle of item.directory.values()) {
          if (signal?.aborted || ++entries > this.limits.entries) break;
          if (handle.kind !== "directory" || handle.name.startsWith(".") || excluded.has(handle.name)) continue;
          if (item.depth >= this.limits.depth) { partial("depth"); continue; }
          children.push({ ...item, directory: handle, path: [item.path, handle.name].filter(Boolean).join("/"), depth: item.depth + 1 });
        }
        // Finish the nearest granted tree before a large unrelated workspace consumes
        // the scan budget. Still continue below a repo to discover nested checkouts.
        queue.unshift(...children);
      } catch { partial("unavailable"); }
      if (result.visited % 20 === 0) onProgress?.({ ...result, repos: [...result.repos], reasons: [...result.reasons] });
    }
    if (signal?.aborted) partial("cancelled");
    if (entries > this.limits.entries) partial("limit");
    if (!signal?.aborted) this.cached = { roots, result, at: Date.now() };
    return result;
  }
}
