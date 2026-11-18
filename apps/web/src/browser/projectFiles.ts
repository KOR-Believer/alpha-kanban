import type { BrowserStorage } from "./storage";
import { documentRootBranch } from "./documentSettings";

export const EXCLUDED_PROJECT_DIRECTORIES = new Set([".git", "node_modules", ".alpha-kanban", ".next", "dist", "dist-browser", "build"]);
export const FILE_EXPLORER_LIMITS = { depth: 30, entries: 20_000, directoryEntries: 10_000, concurrency: 4, cacheDirectories: 256, cacheMs: 60_000 };
export type PreviewKind = "markdown" | "text" | "image" | "pdf" | "html" | "file";
const textExtensions = new Set("txt text json jsonc yaml yml sql js jsx ts tsx mjs cjs css scss sass less py rb rs go java kt kts c h cpp hpp cs sh bash zsh ps1 toml xml csv tsv log env ini conf config vue svelte swift php r graphql gql dockerfile makefile cmake".split(" "));
export function previewKind(name: string): PreviewKind {
  const extension = name.toLowerCase().split(".").at(-1)!;
  if (extension === "md") return "markdown";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (extension === "html" || extension === "htm") return "html";
  return textExtensions.has(extension) || ["license", "readme", ".gitignore", ".ak.config", ".ak.user"].includes(name.toLowerCase()) ? "text" : "file";
}
export type ProjectFileEntry = { id?: string; name: string; path: string; kind: "file" | "directory"; preview?: PreviewKind };
export type ProjectFileScope = { root: FileSystemDirectoryHandle; documentRoot: string | null; excluded: string[] };
type FileRecord = { id: string; projectId: string; path: string; handle: FileSystemFileHandle };
type Lock = <T>(name: string, action: () => Promise<T>) => Promise<T>;
export type FileSearchResult = { entries: ProjectFileEntry[]; visited: number; directories: number; errors: string[]; limited: boolean; complete: boolean };
export function safeProjectPath(path: string, directory = false): string[] {
  if (!path && directory) return [];
  const parts = path.split("/");
  if (!path || /^[a-z]:/i.test(path) || /[\\\u0000-\u001f]/.test(path) || parts.some(part => !part || part === "." || part === "..")) throw new Error("This file path is outside the connected project.");
  return parts;
}
export function canExplorePath(path: string, scope: ProjectFileScope, directory: boolean): boolean {
  if (scope.excluded.some(root => !root || path === root || path.startsWith(root + "/"))) return false;
  const parts = safeProjectPath(path, directory);
  return parts.slice(0, directory ? undefined : -1).every((part, i) => documentRootBranch(parts.slice(0, i + 1).join("/"), scope.documentRoot) || (!part.startsWith(".") && !EXCLUDED_PROJECT_DIRECTORIES.has(part)));
}
/** Entry metadata only. It never reads a file body to list or find names. */
export class ProjectFiles {
  private cache = new Map<string, { time: number; entries: ProjectFileEntry[] }>();
  private revision = 0;
  constructor(private storage: BrowserStorage, private scope: (projectId: string) => Promise<ProjectFileScope>, private lock: Lock,
    private markdownIdentities: (projectId: string, entries: { path: string; handle: FileSystemFileHandle }[]) => Promise<{ id: string; path: string }[]>) {}
  invalidate() { this.revision++; this.cache.clear(); }
  private check(path: string, scope: ProjectFileScope, directory: boolean) {
    if (!canExplorePath(path, scope, directory)) throw new Error("This folder is outside the current project's file exploration scope.");
  }
  private async directory(scope: ProjectFileScope, path: string) {
    this.check(path, scope, true);
    let handle = scope.root;
    for (const part of safeProjectPath(path, true)) handle = await handle.getDirectoryHandle(part);
    return handle;
  }
  private async identify(projectId: string, files: { path: string; handle: FileSystemFileHandle }[], signal?: AbortSignal): Promise<Map<string, string>> {
    if (!files.length) return new Map();
    const directory = files[0]!.path.split("/").slice(0, -1).join("/");
    const key = "project-file-directory:" + projectId + ":" + directory;
    return this.lock("registry", async () => {
      signal?.throwIfAborted();
      const stored = new Map((await this.storage.get<FileRecord[]>(key) ?? []).map(record => [record.path, record]));
      const ids = new Map<string, string>(), writes: { key: string; value: unknown }[] = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(FILE_EXPLORER_LIMITS.concurrency, files.length) }, async () => {
        while (next < files.length) {
          signal?.throwIfAborted();
          const { path, handle } = files[next++]!, saved = stored.get(path);
          if (saved?.projectId === projectId && await saved.handle.isSameEntry(handle)) { ids.set(path, saved.id); continue; }
          const record: FileRecord = { id: "f_" + crypto.randomUUID(), projectId, path, handle };
          stored.set(path, record); ids.set(path, record.id); writes.push({ key: "project-file:" + record.id, value: record });
        }
      }));
      signal?.throwIfAborted();
      if (writes.length) {
        writes.push({ key, value: [...stored.values()] });
        if (this.storage.setMany) await this.storage.setMany(writes);
        else for (const { key, value } of writes) await this.storage.set(key, value);
      }
      return ids;
    });
  }
  async entry(projectId: string, path: string): Promise<ProjectFileEntry> {
    const scope = await this.scope(projectId); this.check(path, scope, false);
    const parts = safeProjectPath(path);
    const directory = await this.directory(scope, parts.slice(0, -1).join("/"));
    const handle = await directory.getFileHandle(parts.at(-1)!);
    const id = /\.md$/i.test(handle.name) ? (await this.markdownIdentities(projectId, [{ path, handle }]))[0]!.id : (await this.identify(projectId, [{ path, handle }])).get(path)!;
    return { id, name: handle.name, path, kind: "file", preview: previewKind(handle.name) };
  }
  async list(projectId: string, path = "", signal?: AbortSignal, force = false) {
    return this.listAt(projectId, path, await this.scope(projectId), signal, force);
  }
  private async listAt(projectId: string, path: string, scope: ProjectFileScope, signal?: AbortSignal, force = false): Promise<ProjectFileEntry[]> {
    signal?.throwIfAborted(); this.check(path, scope, true);
    const revision = this.revision;
    const key = JSON.stringify([projectId, path, scope.documentRoot, scope.excluded]);
    const cached = this.cache.get(key);
    if (!force && cached && Date.now() - cached.time < FILE_EXPLORER_LIMITS.cacheMs) return cached.entries;
    const directory = await this.directory(scope, path);
    const entries: ProjectFileEntry[] = [];
    const files: { path: string; handle: FileSystemFileHandle }[] = [];
    let visited = 0;
    for await (const handle of directory.values()) {
      signal?.throwIfAborted();
      if (++visited > FILE_EXPLORER_LIMITS.directoryEntries) throw new Error("This folder has too many entries. Connect a smaller folder.");
      const relative = path ? path + "/" + handle.name : handle.name;
      if (!canExplorePath(relative, scope, handle.kind === "directory")) continue;
      if (handle.kind === "file") files.push({ path: relative, handle });
      else entries.push({ name: handle.name, path: relative, kind: "directory" });
      if (visited % 200 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const markdown = files.filter(item => /\.md$/i.test(item.handle.name));
    const ids = new Map((await this.markdownIdentities(projectId, markdown)).map(item => [item.path, item.id]));
    const otherIds = await this.identify(projectId, files.filter(item => !/\.md$/i.test(item.handle.name)), signal);
    for (const { path, handle } of files) {
      signal?.throwIfAborted();
      const id = ids.get(path) ?? otherIds.get(path)!;
      entries.push({ id, name: handle.name, path, kind: "file", preview: previewKind(handle.name) });
    }
    signal?.throwIfAborted();
    entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "directory" ? -1 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (revision === this.revision) {
      if (this.cache.size >= FILE_EXPLORER_LIMITS.cacheDirectories) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { time: Date.now(), entries });
    }
    return entries;
  }
  async search(projectId: string, query: string, signal: AbortSignal, publish: (value: FileSearchResult) => void): Promise<FileSearchResult> {
    const scope = await this.scope(projectId), revision = this.revision;
    const terms = query.normalize("NFC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const result: FileSearchResult = { entries: [], visited: 0, directories: 0, errors: [], limited: false, complete: false };
    const queue = [{ path: "", depth: 0 }];
    while (queue.length && !result.limited) {
      signal.throwIfAborted();
      if (revision !== this.revision) throw new Error("Folder connections changed. Refresh the file list.");
      const batch = queue.splice(0, FILE_EXPLORER_LIMITS.concurrency);
      await Promise.all(batch.map(async ({ path, depth }) => {
        signal.throwIfAborted();
        if (depth > FILE_EXPLORER_LIMITS.depth) { result.errors.push(path); return; }
        try {
          const entries = await this.listAt(projectId, path, scope, signal);
          signal.throwIfAborted(); result.directories++;
          for (const entry of entries) {
            if (++result.visited > FILE_EXPLORER_LIMITS.entries) { result.limited = true; break; }
            if (entry.kind === "directory") queue.push({ path: entry.path, depth: depth + 1 });
            else if (terms.every(term => entry.path.normalize("NFC").toLocaleLowerCase().includes(term))) result.entries.push(entry);
          }
        } catch (error) { signal.throwIfAborted(); result.errors.push(path || "/"); }
      }));
      signal.throwIfAborted(); publish({ ...result, entries: [...result.entries], errors: [...result.errors] });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal.throwIfAborted(); result.complete = !result.errors.length && !result.limited;
    return result;
  }
  async open(projectId: string, id: string) {
    if (!/^f_[a-zA-Z0-9-]+$/.test(id)) throw new Error("This file is not registered in this browser.");
    const saved = await this.storage.get<FileRecord>("project-file:" + id);
    if (!saved || saved.projectId !== projectId) throw new Error("This file is not registered in this browser.");
    const scope = await this.scope(projectId); this.check(saved.path, scope, false);
    const relative = await scope.root.resolve(saved.handle);
    if (!relative || relative.join("/") !== saved.path) throw new Error("This file moved or was removed. Select it again in the file explorer.");
    const parts = safeProjectPath(saved.path), directory = await this.directory(scope, parts.slice(0, -1).join("/"));
    const current = await directory.getFileHandle(parts.at(-1)!);
    if (!await current.isSameEntry(saved.handle)) throw new Error("This file was replaced. Select it again in the file explorer.");
    return { file: await current.getFile(), path: saved.path, handle: current, root: scope.root };
  }
  async resource(projectId: string, sourcePath: string, href: string) {
    const path = relativeFilePath(sourcePath, href), scope = await this.scope(projectId); this.check(path, scope, false);
    const parts = safeProjectPath(path), directory = await this.directory(scope, parts.slice(0, -1).join("/"));
    return { file: await (await directory.getFileHandle(parts.at(-1)!)).getFile(), path };
  }
}
export function relativeFilePath(sourcePath: string, href: string): string {
  const decoded = decodeURIComponent(href.split(/[?#]/)[0] ?? "");
  if (!decoded || /^[a-z][a-z\d+.-]*:|^[/\\]/i.test(decoded) || decoded.includes("\\")) throw new Error("This file path is outside the connected project.");
  const parts = safeProjectPath(sourcePath).slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") { if (!parts.length) throw new Error("This file path is outside the connected project."); parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  safeProjectPath(parts.join("/")); return parts.join("/");
}
