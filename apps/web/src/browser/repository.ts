import type {
  MarkdownDocumentResponse, MarkdownFileSummary, TicketDocumentResponse, TicketInstructionKind,
  TicketProgress, TicketStatus, WorkspaceSummary, WorkspacesResponse, BoardOrder, DocumentSetTicketProgress, DocumentSetsResponse,
} from "@alpha-kanban/shared";
import { buildDocumentSets, inferDocumentPathOwner, inferMarkdownFileType, inferSequenceNumber, inferSlug, parseMarkdownOutline, sumDocumentSetTicketProgress } from "@alpha-kanban/shared/documents";
import { appendUserInstruction, parseTicketDocument, updateTicketStatusAndProgress } from "@alpha-kanban/shared/ticketMarkdown";
import { readDocumentMetadata, indexDocumentIds } from "@alpha-kanban/shared/documentMetadata";
import { parseSmokeDocument, buildSmokeIndex, type SmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
import { createSmokeRun, updateSmokeDocument, type NewSmokeRunFields, type SmokeChange } from "@alpha-kanban/shared/smokeRun";
import type { MigrationInput, MigrationPreview, MigrationTarget } from "@alpha-kanban/shared/documentMigration";
import { IndexedDbStorage, type BrowserStorage } from "./storage";
import { appActivity } from "../pwa/activity";
import { LinkMappings, type LinkContext } from "./linkMappings";
import { documentRootBranch, resolveBrowserDocumentRoot, type DocumentRootSetting } from "./documentSettings";
import { createMigrationAnalysis } from "./migrationAnalysis";
import { forEachMigrationFile, readMigrationFile } from "./migrationFiles";
import { attachTicketSearch } from "../ticketSearch";
import { createDocumentSearchEntry } from "../documentSearch";
import { DocumentSearchCache } from "./documentSearchCache";
import { ProjectFiles, EXCLUDED_PROJECT_DIRECTORIES, relativeFilePath } from "./projectFiles";

export class BrowserFileError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "BrowserFileError"; }
}

export type Connection = { id: string; kind: "root" | "project"; handle: FileSystemDirectoryHandle; name: string };
type ProjectRecord = { id: string; handle: FileSystemDirectoryHandle; connectionId: string; label: string; parent: string; lastOpenedAt?: string };
type DocumentRecord = { id: string; workspaceId: string; path: string; handle: FileSystemFileHandle };
type Snapshot = { file: MarkdownFileSummary; markdown: string; size: number; document?: TicketDocumentResponse["document"]; smoke?: SmokeDocument };
type IndexedSnapshot = { file: MarkdownFileSummary; size: number; ticketProgress?: DocumentSetTicketProgress };
export type RecoveryRecord = {
  id: string; fileId: string; workspaceId: string; path: string; ticketId: string;
  before: string; intended: string; beforeHash: string; intendedHash: string; createdAt: string;
  operation?: "document-migration" | "smoke-create" | "smoke-edit";
  sourceFileId?: string;
};
export type SmokeRunPlan = {
  id: string; workspaceId: string; sourceFileId: string; source: MarkdownDocumentResponse;
  path: string; owner: string | null; number: number; documentId: string; contextHash: string;
};
export type BrowserMigration = {
  workspaceId: string; fileId: string; target: MigrationTarget; preview: MigrationPreview;
  documentRoot: DocumentRootSetting;
  guards: { id: string; path: string; hash: string; mtimeMs: number }[]; id: string;
};
type Guard = { expectedHash?: string; expectedMtimeMs?: number };
export type TicketChange = Guard & { status?: TicketStatus; progress?: TicketProgress; reason?: string };
export type Instruction = Guard & { kind: TicketInstructionKind; text: string };
type Lock = <T>(name: string, action: () => Promise<T>) => Promise<T>;
const ignoredDirectories = EXCLUDED_PROJECT_DIRECTORIES;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_DISCOVERY_INTERVAL_MS = 60_000;

// Bounded read-only work; finish the outstanding jobs before propagating a failure.
async function readInParallel<T, R>(items: T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const jobs = await Promise.allSettled(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await read(items[i]!); }
  }));
  const failed = jobs.find((job) => job.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results;
}

export function browserSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "showDirectoryPicker" in window &&
    typeof indexedDB !== "undefined" && Boolean(navigator.locks);
}

const browserLock: Lock = (name, action) => {
  if (!navigator.locks) throw new BrowserFileError("UNSUPPORTED", "Browser file locking is unavailable.");
  return appActivity.run(() => navigator.locks.request("alpha-kanban:" + name, action), name.startsWith("document:"));
};
const newId = (prefix: string) => prefix + crypto.randomUUID();
const isErrorNamed = (error: unknown, name: string) => error instanceof Error && error.name === name;

export async function contentHash(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class BrowserRepository {
  private snapshots = new Map<string, Snapshot>();
  private index = new Map<string, IndexedSnapshot>();
  private snapshotBytes = 0;
  private scans = new Map<string, Promise<MarkdownFileSummary[]>>();
  private listings = new Map<string, { records: DocumentRecord[]; scannedAt: number; documentRoot: string | null }>();
  private documentCounts = new Map<string, { count: number; scannedAt: number; documentRoot: string | null }>();
  private countScans = new Map<string, Promise<number>>();
  private counting = 0;
  private countQueue: Array<() => void> = [];
  private listingRevision = 0;
  private changeListeners = new Set<() => void>();
  private channel?: BroadcastChannel;

  readonly documentSearch: DocumentSearchCache;
  readonly projectFiles: ProjectFiles;
  constructor(readonly storage: BrowserStorage = new IndexedDbStorage(), private readonly lock: Lock = browserLock, private readonly cacheBytes = 64 * 1024 * 1024) {
    this.documentSearch = new DocumentSearchCache(storage);
    this.projectFiles = new ProjectFiles(storage, async id => {
      const project = await this.project(id);
      return { root: project.handle, documentRoot: (await this.documentRoot(project)).value, excluded: await this.excludedPaths(project) };
    }, lock, async (id, entries) => entries.length ? this.discoveredIdentities(await this.project(id), entries) : []);
  }

  private clearSnapshots() { this.snapshots.clear(); this.index.clear(); this.snapshotBytes = 0; this.documentSearch.clearMemory(); this.invalidateListings(); }

  invalidateListings() { this.listings.clear(); this.documentCounts.clear(); this.listingRevision++; this.projectFiles.invalidate(); }

  private forgetSnapshot(id: string) {
    const previous = this.snapshots.get(id);
    if (previous) this.snapshotBytes -= previous.markdown.length * (previous.document || previous.smoke ? 6 : 2);
    this.snapshots.delete(id);
  }

  private cache(snapshot: Snapshot) {
    this.forgetSnapshot(snapshot.file.id);
    // Include a conservative allowance for parsed fields and the search source.
    snapshot.document ??= snapshot.file.type === "tickets" ? attachTicketSearch(parseTicketDocument(snapshot.markdown), snapshot.markdown) : undefined;
    snapshot.smoke ??= snapshot.file.type === "smoke" || snapshot.file.type === "smoke-run" ? parseSmokeDocument(snapshot.markdown, snapshot.file.type) : undefined;
    this.documentSearch.remember(createDocumentSearchEntry(snapshot.file, snapshot.markdown, snapshot.document));
    const bytes = snapshot.markdown.length * (snapshot.document || snapshot.smoke ? 6 : 2);
    if (bytes <= this.cacheBytes) {
      while (this.snapshotBytes + bytes > this.cacheBytes && this.snapshots.size) this.forgetSnapshot(this.snapshots.keys().next().value!);
      this.snapshots.set(snapshot.file.id, snapshot); this.snapshotBytes += bytes;
    }
    const ticketProgress = snapshot.document?.status;
    this.index.set(snapshot.file.id, { file: snapshot.file, size: snapshot.size, ticketProgress });
  }

  subscribe(listener: () => void): () => void {
    if (!this.channel && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("alpha-kanban.browser.v1");
      this.channel.onmessage = () => { this.clearSnapshots(); this.changeListeners.forEach((notify) => notify()); };
    }
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
      if (!this.changeListeners.size) { this.channel?.close(); this.channel = undefined; }
    };
  }

  private changed() {
    this.channel?.postMessage({ changed: true });
    this.changeListeners.forEach((listener) => listener());
  }

  async connections(): Promise<Connection[]> {
    return (await this.storage.entries<Connection>("connection:")).map((row) => row.value);
  }

  private async documentRoot(project: ProjectRecord): Promise<DocumentRootSetting> {
    return resolveBrowserDocumentRoot(project.handle, await this.connections());
  }

  async documentRootSetting(workspaceId: string): Promise<DocumentRootSetting> {
    return this.documentRoot(await this.project(workspaceId));
  }

  async connect(handle: FileSystemDirectoryHandle, kind: Connection["kind"]): Promise<Connection> {
    const connection = await this.lock("registry", async () => {
      for (const existing of await this.connections()) {
        if (await existing.handle.isSameEntry(handle)) {
          if (existing.kind !== kind) throw new BrowserFileError("ALREADY_CONNECTED", "This folder is already connected with a different role.");
          return existing;
        }
      }
      const created: Connection = { id: newId("c_"), kind, handle, name: handle.name };
      await this.storage.set("connection:" + created.id, created);
      return created;
    });
    this.invalidateListings();
    await this.workspaces();
    this.changed();
    return connection;
  }

  async disconnect(id: string) {
    await this.lock("registry", () => this.storage.delete("connection:" + id));
    this.clearSnapshots();
    this.changed();
  }

  async workspaces(): Promise<WorkspacesResponse> {
    return this.lock("registry", async () => {
      const connections = await this.connections();
      const records = (await this.storage.entries<ProjectRecord>("project:")).map((row) => row.value);
      const roots = connections.filter((connection) => connection.kind === "root");
      const visible = new Map<string, WorkspaceSummary>();
      const register = async (handle: FileSystemDirectoryHandle, connection: Connection) => {
        // A more specific root is a container, not a project of its parent root.
        for (const root of roots) if (await root.handle.isSameEntry(handle)) return;
        let record = records.find((item) => item.connectionId === connection.id && item.label === handle.name);
        if (!record || !(await record.handle.isSameEntry(handle))) {
          record = undefined;
          for (const candidate of records) if (await candidate.handle.isSameEntry(handle)) { record = candidate; break; }
        }
        const updated: ProjectRecord = {
          ...record, id: record?.id ?? newId("bw_"), handle, connectionId: connection.id, label: handle.name, parent: connection.name,
        };
        if (!record) records.push(updated);
        if (!record || record.connectionId !== updated.connectionId || record.label !== updated.label) await this.storage.set("project:" + updated.id, updated);
        visible.set(updated.id, this.workspaceSummary(updated, true));
      };
      for (const connection of connections) {
        if (await connection.handle.queryPermission({ mode: "read" }) !== "granted") {
          for (const record of records.filter((item) => item.connectionId === connection.id)) visible.set(record.id, this.workspaceSummary(record, false));
          continue;
        }
        try {
          if (connection.kind === "project") await register(connection.handle, connection);
          else for await (const handle of connection.handle.values()) {
            if (handle.kind === "directory" && !handle.name.startsWith(".") && !ignoredDirectories.has(handle.name)) await register(handle, connection);
          }
        } catch (error) {
          if (!isErrorNamed(error, "NotFoundError") && !isErrorNamed(error, "NotAllowedError")) throw error;
          for (const record of records.filter((item) => item.connectionId === connection.id)) visible.set(record.id, this.workspaceSummary(record, false));
        }
      }
      return {
        workspaces: [...visible.values()].sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "") || a.label.localeCompare(b.label)),
        lastWorkspaceId: await this.storage.get<string>("lastWorkspace"),
      };
    });
  }

  private workspaceSummary(project: ProjectRecord, isAvailable: boolean): WorkspaceSummary {
    return {
      id: project.id, label: project.label, root: project.parent === project.label ? project.label : project.parent + "/" + project.label,
      isAvailable, hasDocs: (this.documentCounts.get(project.id)?.count ?? 0) > 0, lastOpenedAt: project.lastOpenedAt,
      project: { id: project.id, label: project.label, root: project.label, workspaceRoot: project.parent },
    };
  }

  async select(workspaceId: string) {
    const record = await this.project(workspaceId);
    await this.lock("registry", async () => {
      await this.storage.set("project:" + workspaceId, { ...record, lastOpenedAt: new Date().toISOString() });
      await this.storage.set("lastWorkspace", workspaceId);
    });
    this.changed();
    return { workspace: this.workspaceSummary(record, true) };
  }

  async projectConnection(workspaceId: string): Promise<Connection> {
    const project = await this.storage.get<ProjectRecord>("project:" + workspaceId);
    const connection = project && await this.storage.get<Connection>("connection:" + project.connectionId);
    if (!connection) throw new BrowserFileError("RECONNECT_REQUIRED", "Reconnect the original folder from Start.");
    return connection;
  }

  private async project(id: string): Promise<ProjectRecord> {
    const record = await this.storage.get<ProjectRecord>("project:" + id);
    if (!record) throw new BrowserFileError("RECONNECT_REQUIRED", "This project belongs to another browser connection.");
    const connection = await this.projectConnection(id);
    if (await record.handle.queryPermission({ mode: "read" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant folder access to reconnect this project.");
    const relative = await connection.handle.resolve(record.handle);
    if (!relative || (connection.kind === "root" && relative.length !== 1)) throw new BrowserFileError("RECONNECT_REQUIRED", "Reconnect the original folder from Start.");
    if (connection.kind === "root") {
      const current = await connection.handle.getDirectoryHandle(relative[0]!);
      if (!(await current.isSameEntry(record.handle))) throw new BrowserFileError("RECONNECT_REQUIRED", "Reconnect the original folder from Start.");
    }
    return record;
  }

  private async excludedPaths(project: ProjectRecord): Promise<string[]> {
    const excluded: string[] = [];
    for (const connection of await this.connections()) {
      if (connection.id === project.connectionId) continue;
      const relative = await project.handle.resolve(connection.handle);
      if (relative && (relative.length || connection.kind === "root")) excluded.push(relative.join("/"));
    }
    return excluded;
  }

  private async assertOwnedPath(project: ProjectRecord, path: string) {
    const excluded = await this.excludedPaths(project);
    if (excluded.some((prefix) => !prefix || path === prefix || path.startsWith(prefix + "/"))) {
      throw new BrowserFileError("RECONNECT_REQUIRED", "This document belongs to a more specific folder connection.");
    }
  }

  async createProject(connection: Connection, name: string) {
    return appActivity.run(async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/\u0000-\u001f]/.test(trimmed)) throw new BrowserFileError("INVALID_NAME", "Enter a valid project name.");
      if (connection.kind !== "root") throw new BrowserFileError("INVALID_ROOT", "Select a connected root.");
      try { await connection.handle.getDirectoryHandle(trimmed); throw new BrowserFileError("ALREADY_EXISTS", "This folder already exists."); }
      catch (error) { if (!isErrorNamed(error, "NotFoundError")) throw error; }
      if (await connection.handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant write access to this folder first.");
      await connection.handle.getDirectoryHandle(trimmed, { create: true });
      this.invalidateListings();
      const workspaces = await this.workspaces();
      this.changed();
      return workspaces.workspaces.find((workspace) => workspace.label === trimmed && workspace.project?.workspaceRoot === connection.name);
    });
  }

  async files(workspaceId: string, force = false): Promise<MarkdownFileSummary[]> {
    return this.listFiles(workspaceId, force, false);
  }

  async ticketFiles(workspaceId: string): Promise<MarkdownFileSummary[]> {
    return this.listFiles(workspaceId, false, true);
  }

  /** Count discovered Markdown names, without reading bodies or creating document IDs. */
  async documentCount(workspaceId: string): Promise<number> {
    const revision = this.listingRevision, key = `${workspaceId}:${revision}`;
    const pending = this.countScans.get(key);
    if (pending) return pending;
    const scan = this.countDocuments(workspaceId, revision).finally(() => this.countScans.delete(key));
    this.countScans.set(key, scan);
    return scan;
  }

  private async countDocuments(workspaceId: string, revision: number): Promise<number> {
    const project = await this.project(workspaceId);
    const documentRoot = (await this.documentRoot(project)).value;
    const cached = () => {
      const value = this.documentCounts.get(workspaceId);
      return value && value.documentRoot === documentRoot && Date.now() - value.scannedAt < DOCUMENT_DISCOVERY_INTERVAL_MS ? value.count : undefined;
    };
    const initial = cached();
    if (initial !== undefined) return initial;
    if (this.counting >= 2) await new Promise<void>((resolve) => this.countQueue.push(resolve));
    else this.counting++;
    try {
      // Reuse an in-flight sidebar/board discovery when it already walks this tree.
      const listing = [...this.scans].find(([key]) => key.startsWith(workspaceId + ":"))?.[1];
      if (listing) { try { await listing; } catch { /* Counting does not need readable document bodies. */ } }
      const discovered = cached();
      if (discovered !== undefined) return discovered;
      const excluded = await this.excludedPaths(project);
      let count = 0;
      const walk = async (directory: FileSystemDirectoryHandle, path: string, depth: number) => {
        if (depth > 30) throw new BrowserFileError("SCAN_LIMIT", "Folder nesting is too deep to scan safely.");
        for await (const handle of directory.values()) {
          const relative = path ? path + "/" + handle.name : handle.name;
          if (excluded.some((root) => !root || relative === root || relative.startsWith(root + "/"))) continue;
          if (handle.kind === "directory") {
            if (documentRootBranch(relative, documentRoot) || (!handle.name.startsWith(".") && !ignoredDirectories.has(handle.name))) await walk(handle, relative, depth + 1);
          } else if (/\.md$/i.test(handle.name) && ++count > 5000) {
            throw new BrowserFileError("SCAN_LIMIT", "Too many Markdown files. Connect a smaller project folder.");
          }
        }
      };
      if (!excluded.includes("")) await walk(project.handle, "", 0);
      if (revision !== this.listingRevision) throw new BrowserFileError("RECONNECT_REQUIRED", "Folder connections changed. Refresh the project list.");
      this.documentCounts.set(workspaceId, { count, scannedAt: Date.now(), documentRoot });
      return count;
    } finally {
      const next = this.countQueue.shift();
      if (next) next();
      else this.counting--;
    }
  }

  private async listFiles(workspaceId: string, force: boolean, ticketsOnly: boolean): Promise<MarkdownFileSummary[]> {
    const revision = this.listingRevision;
    const listingKey = workspaceId + (ticketsOnly ? ":tickets" : ":all");
    const key = `${listingKey}:${revision}:${force}`;
    const pending = this.scans.get(key);
    if (pending) return pending;
    const scan = this.scan(workspaceId, force, ticketsOnly, listingKey, revision).finally(() => this.scans.delete(key));
    this.scans.set(key, scan);
    return scan;
  }

  private async scan(workspaceId: string, force: boolean, ticketsOnly: boolean, listingKey: string, revision: number): Promise<MarkdownFileSummary[]> {
    const project = await this.project(workspaceId);
    const documentRoot = (await this.documentRoot(project)).value;
    const excluded = await this.excludedPaths(project);
    if (excluded.includes("")) return [];
    const listing = this.listings.get(listingKey);
    if (!force && listing && listing.documentRoot === documentRoot && Date.now() - listing.scannedAt < DOCUMENT_DISCOVERY_INTERVAL_MS) {
      try {
        let moved = false;
        const files = await readInParallel(listing.records.filter((record) => !excluded.some((root) => record.path === root || record.path.startsWith(root + "/"))), async (record) => {
          const relative = await project.handle.resolve(record.handle);
          if (!relative || relative.join("/") !== record.path) { moved = true; return undefined; }
          return this.fileSummary(record, false, documentRoot);
        });
        if (!moved) return files.filter((file): file is MarkdownFileSummary => Boolean(file)).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      } catch (error) {
        if (!isErrorNamed(error, "NotFoundError")) throw error;
        // A removed handle needs discovery now, not another minute of stale cards.
      }
    }
    const entries: { path: string; handle: FileSystemFileHandle }[] = [];
    let documentCount = 0;
    const walk = async (directory: FileSystemDirectoryHandle, path: string, depth: number) => {
      if (depth > 30) throw new BrowserFileError("SCAN_LIMIT", "Folder nesting is too deep to scan safely.");
      for await (const handle of directory.values()) {
        const relative = path ? path + "/" + handle.name : handle.name;
        if (excluded.some((root) => relative === root || relative.startsWith(root + "/"))) continue;
        if (handle.kind === "directory") {
          if (documentRootBranch(relative, documentRoot) || (!handle.name.startsWith(".") && !ignoredDirectories.has(handle.name))) await walk(handle, relative, depth + 1);
        } else if (/\.md$/i.test(handle.name)) {
          documentCount++;
          if (ticketsOnly && inferMarkdownFileType(relative) !== "tickets") continue;
          if (entries.length >= 5000) throw new BrowserFileError("SCAN_LIMIT", "Too many Markdown files. Connect a smaller project folder.");
          entries.push({ path: relative, handle });
        }
      }
    };
    await walk(project.handle, "", 0);
    const records = await this.discoveredIdentities(project, entries);
    const files = await readInParallel(records, (record) => this.fileSummary(record, force, documentRoot));
    if (revision === this.listingRevision) {
      this.listings.set(listingKey, { records, scannedAt: Date.now(), documentRoot });
      this.documentCounts.set(workspaceId, { count: documentCount, scannedAt: Date.now(), documentRoot });
    }
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async discoveredIdentities(project: ProjectRecord, entries: { path: string; handle: FileSystemFileHandle }[]): Promise<DocumentRecord[]> {
    return this.lock("registry", async () => {
      const stored = (await this.storage.entries<DocumentRecord>("document:")).map((row) => row.value);
      const byId = new Map(stored.map((record) => [record.id, record]));
      const prefix = "document-path:" + project.id + ":";
      const paths = new Map((await this.storage.entries<string>(prefix)).map((row) => [row.key.slice(prefix.length), row.value]));
      let identities: Promise<Map<string, DocumentRecord>> | undefined;
      const updates = new Map<string, unknown>();
      const records = await readInParallel(entries, async ({ path, handle }) => {
        const cached = byId.get(paths.get(path) ?? "");
        if (cached?.workspaceId === project.id && cached.path === path && await cached.handle.isSameEntry(handle)) return cached;
        const candidate = (await (identities ??= this.resolveDocumentIdentities(project, stored))).get(path);
        const existing = candidate && await candidate.handle.isSameEntry(handle) ? candidate : undefined;
        const record = { id: existing?.id ?? newId("d_"), workspaceId: project.id, path, handle };
        if (!existing || existing.workspaceId !== project.id || existing.path !== path) updates.set("document:" + record.id, record);
        updates.set(prefix + path, record.id);
        return record;
      });
      // One registry lock and transaction, instead of several transactions per file.
      const writes = [...updates].map(([key, value]) => ({ key, value }));
      if (this.storage.setMany) await this.storage.setMany(writes);
      else for (const { key, value } of writes) await this.storage.set(key, value);
      return records;
    });
  }

  private async resolveDocumentIdentities(project: ProjectRecord, documents?: DocumentRecord[]): Promise<Map<string, DocumentRecord>> {
    documents ??= (await this.storage.entries<DocumentRecord>("document:")).map((row) => row.value);
    // Index persisted handles by their current path once per scan, including moves
    // across projects. Newly discovered files never join a pairwise comparison loop.
    const identities = new Map<string, DocumentRecord>();
    await readInParallel(documents, async (record) => {
      try {
        const relative = await project.handle.resolve(record.handle);
        if (relative?.length) identities.set(relative.join("/"), record);
      } catch (error) {
        if (!isErrorNamed(error, "NotFoundError") && !isErrorNamed(error, "NotAllowedError")) throw error;
      }
    });
    return identities;
  }

  private async documentIdentity(project: ProjectRecord, path: string, handle: FileSystemFileHandle,
    identityIndex = () => this.resolveDocumentIdentities(project)): Promise<DocumentRecord> {
    const workspaceId = project.id;
    const pathKey = "document-path:" + workspaceId + ":" + path;
    const lookup = async () => {
      const id = await this.storage.get<string>(pathKey);
      const cached = id && await this.storage.get<DocumentRecord>("document:" + id);
      return cached && cached.workspaceId === workspaceId && cached.path === path && await cached.handle.isSameEntry(handle) ? cached : undefined;
    };
    const cached = await lookup();
    if (cached) return cached;
    return this.lock("registry", async () => {
      const current = await lookup();
      if (current) return current;
      const candidate = (await identityIndex()).get(path);
      const existing = candidate && await candidate.handle.isSameEntry(handle) ? candidate : undefined;
      const record = { id: existing?.id ?? newId("d_"), workspaceId, path, handle };
      if (!existing || existing.workspaceId !== workspaceId || existing.path !== path) await this.storage.set("document:" + record.id, record);
      await this.storage.set(pathKey, record.id);
      return record;
    });
  }

  private async document(workspaceId: string, id: string): Promise<DocumentRecord> {
    const project = await this.project(workspaceId);
    const record = await this.storage.get<DocumentRecord>("document:" + id);
    if (!record || record.workspaceId !== workspaceId) throw new BrowserFileError("FILE_NOT_FOUND", "The original document is unavailable. Select it again from the document list.");
    await this.assertOwnedPath(project, record.path);
    const relative = await project.handle.resolve(record.handle);
    if (!relative || relative.join("/") !== record.path) throw new BrowserFileError("FILE_NOT_FOUND", "The document moved or was removed.");
    let directory = project.handle;
    for (const part of relative.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const current = await directory.getFileHandle(relative.at(-1)!);
    if (!(await current.isSameEntry(record.handle))) throw new BrowserFileError("STALE_FILE", "The document was replaced externally.");
    return { ...record, handle: current };
  }

  private async fileSummary(record: DocumentRecord, force: boolean, documentRoot?: string | null): Promise<MarkdownFileSummary> {
    if (documentRoot === undefined) documentRoot = (await this.documentRoot(await this.project(record.workspaceId))).value;
    const blob = await record.handle.getFile();
    const indexed = this.index.get(record.id);
    if (!force && indexed && indexed.file.workspaceId === record.workspaceId && indexed.file.workspaceRelativePath === record.path && indexed.file.mtimeMs === blob.lastModified && indexed.size === blob.size) {
      indexed.file = { ...indexed.file, documentRoot, pathOwner: inferDocumentPathOwner(record.path, documentRoot) };
      return indexed.file;
    }
    return (await this.snapshot(record, true, blob, documentRoot)).file;
  }

  private async snapshot(record: DocumentRecord, force = false, blob?: File, documentRoot?: string | null): Promise<Snapshot> {
    if (documentRoot === undefined) documentRoot = (await this.documentRoot(await this.project(record.workspaceId))).value;
    blob ??= await record.handle.getFile();
    if (blob.size > MAX_DOCUMENT_BYTES) throw new BrowserFileError("FILE_TOO_LARGE", "Markdown files larger than 10 MiB are not supported.");
    const cached = this.snapshots.get(record.id);
    if (!force && cached && cached.file.workspaceId === record.workspaceId && cached.file.workspaceRelativePath === record.path && cached.file.mtimeMs === blob.lastModified && cached.size === blob.size) {
      cached.file = { ...cached.file, documentRoot, pathOwner: inferDocumentPathOwner(record.path, documentRoot) };
      this.snapshots.delete(record.id); this.snapshots.set(record.id, cached);
      return cached;
    }
    // Fatal decoding refuses non-UTF-8 input rather than corrupting it on the next save; preserve BOM.
    const markdown = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await blob.arrayBuffer());
    const metadata = readDocumentMetadata(markdown);
    const file: MarkdownFileSummary = {
      id: record.id, workspaceId: record.workspaceId, type: inferMarkdownFileType(record.path), filename: blob.name,
      directory: record.path.split("/").slice(0, -1).join("/"), relativePath: record.path, workspaceRelativePath: record.path,
      hash: await contentHash(markdown), mtimeMs: blob.lastModified, slug: inferSlug(record.path), sequenceNumber: inferSequenceNumber(record.path),
      documentRoot, pathOwner: inferDocumentPathOwner(record.path, documentRoot),
      ...(metadata.format.readable && metadata.documentId.status === "valid" ? { documentId: metadata.documentId.value! } : {}),
    };
    const result: Snapshot = { file, markdown, size: blob.size,
      document: file.type === "tickets" && cached?.file.type === file.type && cached.file.hash === file.hash ? cached.document : undefined,
      smoke: cached?.file.type === file.type && cached.file.hash === file.hash ? cached.smoke : undefined };
    this.cache(result);
    return result;
  }

  async markdown(workspaceId: string, id: string): Promise<MarkdownDocumentResponse> {
    const snapshot = await this.snapshot(await this.document(workspaceId, id), true);
    return { file: snapshot.file, markdown: snapshot.markdown, outline: parseMarkdownOutline(snapshot.markdown) };
  }
  async file(workspaceId: string, id: string): Promise<MarkdownFileSummary> {
    return this.fileSummary(await this.document(workspaceId, id), false);
  }
  async smoke(workspaceId: string, id: string, force = true) {
    const snapshot = await this.snapshot(await this.document(workspaceId, id), force);
    if (snapshot.file.type !== "smoke" && snapshot.file.type !== "smoke-run") throw new BrowserFileError("INVALID_DOCUMENT_TYPE", "Select a smoke definition or run document.");
    return { file: snapshot.file, document: snapshot.smoke ?? parseSmokeDocument(snapshot.markdown, snapshot.file.type) };
  }
  /** Explicit read request; relation discovery never consults another connected project. */
  async smokeIndex(workspaceId: string) {
    return (await this.smokeCollection(workspaceId)).index;
  }
  async smokeCollection(workspaceId: string) {
    const files = await this.files(workspaceId, true);
    const entries = await readInParallel(files, async file => ({ projectId: workspaceId, localId: file.id, path: file.relativePath,
      documentId: file.documentId, document: file.type === "smoke" || file.type === "smoke-run" ? (await this.smoke(workspaceId, file.id, false)).document : undefined }));
    return { files, entries, index: buildSmokeIndex(entries) };
  }

  private async smokeRunContext(workspaceId: string, fileId: string, createdPath?: string) {
    const project = await this.project(workspaceId);
    const root = await this.documentRoot(project);
    if (root.value === null) throw new BrowserFileError("OWNER_UNRESOLVED", "Check the document folder setting before creating a run.");
    const source = await this.markdown(workspaceId, fileId);
    const model = parseSmokeDocument(source.markdown, "smoke");
    if (source.file.type !== "smoke" || !model.valid || !model.format.writable || !model.documentId) throw new BrowserFileError("INVALID_SMOKE", "Correct the smoke definition before creating a run.");
    const collection = await this.smokeCollection(workspaceId);
    const files = collection.files.filter(file => file.relativePath !== createdPath);
    if (files.filter(file => file.documentId === model.documentId).length !== 1) throw new BrowserFileError("DUPLICATE_DOCUMENT_ID", "The document ID is shared by multiple files. Resolve the duplicate IDs before editing.");
    const runs = collection.entries.filter(entry => entry.path !== createdPath && entry.document?.run?.sourceId === model.documentId);
    if (runs.some(entry => !entry.document?.run?.number)) throw new BrowserFileError("INVALID_SMOKE", "Check the existing run numbers before creating a run.");
    const number = Math.max(0, ...runs.map(entry => entry.document!.run!.number!)) + 1;
    if (!Number.isSafeInteger(number)) throw new BrowserFileError("NUMBER_OVERFLOW", "The next document number cannot be represented exactly.");
    const parts = source.file.relativePath.split("/"); parts.pop();
    const pathOwner = inferDocumentPathOwner(source.file.relativePath, root.value);
    if (pathOwner.status === "invalid") throw new BrowserFileError("OWNER_UNRESOLVED", "Check the owner folder name before creating a run.");
    const owner = pathOwner.status === "owned" ? pathOwner.value : null;
    const scopeParts = owner ? parts.slice(0, parts.map(part => part.startsWith("@")).lastIndexOf(true) + 1) : parts;
    const directoryAt = async (segments: string[]) => {
      let current = project.handle;
      for (const part of segments) current = await current.getDirectoryHandle(part);
      return current;
    };
    const destination = await directoryAt(parts);
    const scope = await directoryAt(scopeParts);
    let maximum = 0, visited = 0;
    const scan = async (directory: FileSystemDirectoryHandle, prefix: string, depth: number) => {
      if (depth > 30) throw new BrowserFileError("SCAN_LIMIT", "Folder nesting is too deep to scan safely.");
      for await (const entry of directory.values()) {
        if (++visited > 20000) throw new BrowserFileError("SCAN_LIMIT", "The document numbering scope is too large. Use a smaller document folder.");
        const path = prefix ? prefix + "/" + entry.name : entry.name;
        if (path === createdPath) continue;
        if (entry.name === ".git" && (owner || depth > 0)) throw new BrowserFileError("NUMBER_SCOPE_UNAVAILABLE", "Document numbering cannot cross a repository boundary.");
        if (entry.kind === "directory") {
          if (owner && !entry.name.startsWith("@")) { await this.assertOwnedPath(project, path); await scan(entry as FileSystemDirectoryHandle, path, depth + 1); }
        } else if (/^\d+_.*\.md$/i.test(entry.name)) {
          const value = Number(entry.name.match(/^\d+/)![0]);
          if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new BrowserFileError("NUMBER_OVERFLOW", "The next document number cannot be represented exactly.");
          maximum = Math.max(maximum, value);
        }
      }
    };
    await scan(scope, scopeParts.join("/"), 0);
    const filename = `${String(maximum + 1).padStart(2, "0")}_${inferSlug(source.file.relativePath)}_smoke_run.md`;
    if (new TextEncoder().encode(filename).length > 240) throw new BrowserFileError("INVALID_NAME", "The new filename is too long. Shorten the smoke definition filename first.");
    const path = [...parts, filename].join("/");
    await this.assertOwnedPath(project, path);
    const contextHash = await contentHash(JSON.stringify({ source: [source.file.relativePath, source.file.hash, source.file.mtimeMs], root: root.value, owner, path, number }));
    return { project, source, model, files, destination, path, filename, owner, number, contextHash };
  }

  async prepareSmokeRun(workspaceId: string, sourceFileId: string): Promise<SmokeRunPlan> {
    if ((await this.recoveries()).some(record => record.workspaceId === workspaceId && (record.sourceFileId === sourceFileId || record.fileId === sourceFileId))) throw new BrowserFileError("RECOVERY_REQUIRED", "Review the pending recovery record before saving again.");
    const context = await this.smokeRunContext(workspaceId, sourceFileId);
    const body = { workspaceId, sourceFileId, source: context.source, path: context.path, owner: context.owner, number: context.number, documentId: crypto.randomUUID(), contextHash: context.contextHash };
    return { ...body, id: await contentHash(JSON.stringify(body)) };
  }

  async createSmokeRun(plan: SmokeRunPlan, fields: NewSmokeRunFields): Promise<MarkdownDocumentResponse> {
    const { id, ...body } = plan;
    if (id !== await contentHash(JSON.stringify(body))) throw new BrowserFileError("INVALID_PREVIEW", "Reload the run setup before creating the file.");
    // A shared creation lock also serializes numbering across overlapping folder registrations.
    return this.lock("document:create", () => this.lock("document:" + plan.sourceFileId, async () => {
      if ((await this.recoveries()).some(record => record.workspaceId === plan.workspaceId && (record.sourceFileId === plan.sourceFileId || record.fileId === plan.sourceFileId || record.path === plan.path))) throw new BrowserFileError("RECOVERY_REQUIRED", "Review the pending recovery record before saving again.");
      const verifyContext = async (created = false) => {
        const context = await this.smokeRunContext(plan.workspaceId, plan.sourceFileId, created ? plan.path : undefined);
        if (context.contextHash !== plan.contextHash) throw new BrowserFileError("STALE_FILE", "The document changed externally. Reload before saving.");
        if (context.files.some(file => file.documentId === plan.documentId)) throw new BrowserFileError("DUPLICATE_DOCUMENT_ID", "The document ID is shared by multiple files. Resolve the duplicate IDs before editing.");
        return context;
      };
      const context = await verifyContext();
      const intended = createSmokeRun(context.source.markdown, { ...fields, sourcePath: context.source.file.relativePath, number: plan.number, documentId: plan.documentId, owner: plan.owner, createdAt: new Date().toISOString() });
      if (new TextEncoder().encode(intended).length > MAX_DOCUMENT_BYTES) throw new BrowserFileError("FILE_TOO_LARGE", "Markdown files larger than 10 MiB are not supported.");
      if (await context.destination.queryPermission({ mode: "readwrite" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant write access from the folder connections menu.");
      const absent = async () => {
        for await (const entry of context.destination.values()) {
          if (entry.name.normalize("NFC").toLowerCase() === context.filename.normalize("NFC").toLowerCase()) throw new BrowserFileError("FILE_EXISTS", "The run file already exists. Reload the run setup.");
        }
      };
      await absent();
      const recovery: RecoveryRecord = { id: newId("r_"), fileId: newId("d_"), workspaceId: plan.workspaceId, path: plan.path, ticketId: "", operation: "smoke-create", sourceFileId: plan.sourceFileId,
        before: "", beforeHash: await contentHash(""), intended, intendedHash: await contentHash(intended), createdAt: new Date().toISOString() };
      await (this.storage.setDurable ?? this.storage.set).call(this.storage, "recovery:" + recovery.id, recovery);
      this.changed();
      let writable: FileSystemWritableFileStream | undefined;
      try {
        await absent();
        const handle = await context.destination.getFileHandle(context.filename, { create: true });
        const initial = await handle.getFile();
        if (initial.size) throw new BrowserFileError("FILE_EXISTS", "The run file already exists. Reload the run setup.");
        writable = await handle.createWritable({ keepExistingData: true });
        const fresh = await verifyContext(true);
        const current = await fresh.destination.getFileHandle(context.filename);
        const latest = await current.getFile();
        if (!await context.destination.isSameEntry(fresh.destination) || !await handle.isSameEntry(current) || latest.size || latest.lastModified !== initial.lastModified) throw new BrowserFileError("STALE_FILE", "The file changed just before saving; the write was cancelled.");
        await writable.write(intended); await writable.truncate(new TextEncoder().encode(intended).byteLength);
        await writable.close(); writable = undefined;
        // Read back through the reviewed path, never trust close() alone.
        const saved = await context.destination.getFileHandle(context.filename);
        if (!await saved.isSameEntry(handle) || (await context.project.handle.resolve(saved))?.join("/") !== plan.path) throw new BrowserFileError("WRITE_UNCERTAIN", "The saved content could not be verified. Review the recovery record.");
        const record = { id: recovery.fileId, workspaceId: plan.workspaceId, path: plan.path, handle: saved };
        const verified = await this.snapshot(record, true);
        if (verified.file.hash !== recovery.intendedHash) throw new BrowserFileError("WRITE_UNCERTAIN", "The saved content could not be verified. Review the recovery record.");
        // A concurrent read-only listing may already have registered this physical file.
        const identity = await this.documentIdentity(context.project, plan.path, saved);
        const result = { ...verified, file: { ...verified.file, id: identity.id } };
        this.forgetSnapshot(record.id); this.index.delete(record.id); this.cache(result);
        await this.storage.delete("recovery:" + recovery.id);
        this.invalidateListings(); this.changed();
        return { file: result.file, markdown: result.markdown, outline: parseMarkdownOutline(result.markdown) };
      } catch (error) {
        await writable?.abort().catch(() => undefined);
        this.forgetSnapshot(recovery.fileId); this.index.delete(recovery.fileId);
        this.invalidateListings(); this.changed();
        throw error;
      }
    }));
  }
  async tickets(workspaceId: string, id: string, force = true): Promise<TicketDocumentResponse> {
    const snapshot = await this.snapshot(await this.document(workspaceId, id), force);
    return { file: snapshot.file, document: snapshot.document ?? attachTicketSearch(parseTicketDocument(snapshot.markdown), snapshot.markdown) };
  }
  /** Display-only reuse of a just-checked listing. Writes always acquire fresh guards. */
  async listedTickets(workspaceId: string, file: MarkdownFileSummary): Promise<TicketDocumentResponse> {
    const cached = this.snapshots.get(file.id);
    if (file.workspaceId === workspaceId && cached?.document && cached.file.workspaceId === workspaceId &&
        cached.file.workspaceRelativePath === file.workspaceRelativePath && cached.file.hash === file.hash && cached.file.mtimeMs === file.mtimeMs) {
      return { file, document: cached.document };
    }
    return this.tickets(workspaceId, file.id, false);
  }
  async documentIdIndex(workspaceId: string) {
    // A tickets-only discovery cannot establish uniqueness across all Markdown.
    return indexDocumentIds((await this.files(workspaceId, true)).map((file) => ({
      projectId: workspaceId, localId: file.id, path: file.relativePath, documentId: file.documentId,
    })));
  }
  async documentSets(workspaceId: string): Promise<DocumentSetsResponse> {
    const sets = buildDocumentSets(await this.files(workspaceId));
    return { sets: sets.map((set) => {
      const progress = set.documents
        .filter((file) => file.type === "tickets")
        .map((file) => this.index.get(file.id)?.ticketProgress);
      const combined = sumDocumentSetTicketProgress(progress);
      return { ...set, ticketProgress: progress[0], allTicketsDone: combined
        ? Boolean(combined.totalTickets && combined.doneTickets === combined.totalTickets)
        : undefined };
    }) };
  }

  /** Only preparation may reload a missing cache entry; typing never reads files. */
  async prepareDocumentSearch(file: MarkdownFileSummary): Promise<void> {
    if (await this.documentSearch.get(file)) return;
    const cached = this.snapshots.get(file.id);
    if (cached?.file.workspaceId === file.workspaceId && cached.file.hash === file.hash && cached.file.workspaceRelativePath === file.workspaceRelativePath) {
      this.documentSearch.remember(createDocumentSearchEntry(file, cached.markdown, cached.document));
      return;
    }
    await this.snapshot(await this.document(file.workspaceId, file.id));
  }

  async previewMigration(workspaceId: string, fileId: string, selection: Omit<MigrationTarget, "path">, generatedIds?: Record<string, string>, signal?: AbortSignal): Promise<BrowserMigration> {
    signal?.throwIfAborted();
    const revision = this.listingRevision, project = await this.project(workspaceId);
    const documentRoot = await this.documentRoot(project), excluded = await this.excludedPaths(project);
    const outside = (path: string) => excluded.some((root) => !root || path === root || path.startsWith(root + "/"));
    const saved = await this.storage.get<DocumentRecord>("document:" + fileId);
    if (!saved || saved.workspaceId !== workspaceId) throw new BrowserFileError("FILE_NOT_FOUND", "The selected document is unavailable.");
    const relative = await project.handle.resolve(saved.handle);
    if (!relative?.length) throw new BrowserFileError("FILE_NOT_FOUND", "The document moved or was removed.");
    const path = relative.join("/");
    if (!/\.md$/i.test(path)) throw new BrowserFileError("FILE_NOT_FOUND", "The selected document is unavailable.");
    if (outside(path)) throw new BrowserFileError("RECONNECT_REQUIRED", "This document belongs to a more specific folder connection.");
    for (let i = 0; i < relative.length - 1; i++) {
      const name = relative[i]!, parent = relative.slice(0, i + 1).join("/");
      if (!documentRootBranch(parent, documentRoot.value) && (name.startsWith(".") || ignoredDirectories.has(name))) {
        throw new BrowserFileError("FILE_NOT_FOUND", "The selected document is unavailable.");
      }
    }
    let directory = project.handle;
    for (const part of relative.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(relative.at(-1)!);
    if (!(await handle.isSameEntry(saved.handle))) throw new BrowserFileError("STALE_FILE", "The document was replaced externally.");
    // Preserve the selected opaque identity after a manual move, without registering
    // or parsing every other file just to prepare a maintenance preview.
    const record = await this.documentIdentity(project, path, handle, async () => new Map([[path, saved]]));
    if (record.id !== fileId) throw new BrowserFileError("FILE_NOT_FOUND", "The selected document is unavailable.");
    const checkedFile = async (fileHandle: FileSystemFileHandle) => {
      signal?.throwIfAborted();
      const file = await fileHandle.getFile();
      if (file.size > MAX_DOCUMENT_BYTES) throw new BrowserFileError("FILE_TOO_LARGE", "Markdown files larger than 10 MiB are not supported.");
      return file;
    };
    const file = await checkedFile(handle), markdown = await readMigrationFile(file, true, signal);
    const guards = [{ id: fileId, path, hash: await contentHash(markdown), mtimeMs: file.lastModified }];
    const target = { ...selection, path }, documents: MigrationInput["documents"] = [{ path, markdown, writable: true }];
    // This root is a temporary namespace for relative-link arithmetic, never a physical path or stored identity.
    const input: MigrationInput = { root: "/project", documentRoot: documentRoot.value, documents, targets: [target], generatedIds, relativeReferencesOnly: true };
    const analysis = createMigrationAnalysis(signal);
    try {
      const prepared = await analysis.prepare(input);
      let preview = prepared.preview;
      if (prepared.readIds || prepared.readReferences) {
        let count = 0, bytes = markdown.length * 2, found = false;
        async function* walk(folder: FileSystemDirectoryHandle, parent: string, depth: number): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
          if (depth > 30) throw new BrowserFileError("SCAN_LIMIT", "Folder nesting is too deep to scan safely.");
          for await (const child of folder.values()) {
            signal?.throwIfAborted();
            const next = parent ? parent + "/" + child.name : child.name;
            if (outside(next)) continue;
            if (child.kind === "directory") {
              if (documentRootBranch(next, documentRoot.value) || (!child.name.startsWith(".") && !ignoredDirectories.has(child.name))) yield* walk(child, next, depth + 1);
            } else if (/\.md$/i.test(child.name)) {
              if (++count > 5000) throw new BrowserFileError("SCAN_LIMIT", "Too many Markdown files. Connect a smaller project folder.");
              yield { path: next, handle: child };
            }
          }
        }
        await forEachMigrationFile(walk(project.handle, "", 0), async (entry) => {
          if (entry.path === path) {
            if (!(await entry.handle.isSameEntry(handle))) throw new BrowserFileError("STALE_FILE", "The document was replaced externally.");
            found = true;
            return;
          }
          const source = await readMigrationFile(await checkedFile(entry.handle), prepared.readReferences, signal);
          bytes += source.length * 2;
          if (bytes > 128 * 1024 * 1024) throw new BrowserFileError("SCAN_LIMIT", "Too much Markdown for one migration preview. Use the document CLI with a smaller scope.");
          documents.push({ path: entry.path, markdown: source, writable: false });
        }, signal);
        if (!found) throw new BrowserFileError("FILE_NOT_FOUND", "The selected document is unavailable.");
        documents.sort((a, b) => a.path.localeCompare(b.path));
        preview = await analysis.preview({ ...input, generatedIds: prepared.preview.generatedIds });
      }
      signal?.throwIfAborted();
      if (revision !== this.listingRevision) throw new BrowserFileError("RECONNECT_REQUIRED", "Folder connections changed. Refresh the project list.");
      const body = { workspaceId, fileId, target, preview, guards, documentRoot };
      return { ...body, id: await contentHash(JSON.stringify(body)) };
    } finally { analysis.dispose(); }
  }

  async applyMigration(plan: BrowserMigration) {
    const { id, ...body } = plan;
    if (id !== await contentHash(JSON.stringify(body)) || !["ready", "noop"].includes(plan.preview.decision)) throw new BrowserFileError("INVALID_PREVIEW", "Preview the selected changes again before applying them.");
    const guard = plan.guards.find((entry) => entry.id === plan.fileId);
    if (!guard) throw new BrowserFileError("INVALID_PREVIEW", "The preview has no original document guard.");
    const verify = async () => {
      const { path: _path, ...selection } = plan.target;
      const fresh = await this.previewMigration(plan.workspaceId, plan.fileId, selection, plan.preview.generatedIds);
      // Fresh discovery still catches newly added backlinks. Unrelated file edits
      // need not invalidate an otherwise identical cleanup preview.
      if (fresh.id !== id) throw new BrowserFileError("STALE_FILE", "The document or its affected references changed. Preview the changes again.");
    };
    return this.lock("migration:" + plan.workspaceId, async () => {
      await this.write(plan.workspaceId, plan.fileId, "", { expectedHash: guard.hash, expectedMtimeMs: guard.mtimeMs }, async (source) => {
        await verify();
        return plan.preview.changes.find((change) => change.path === plan.target.path)?.after ?? source;
      }, { operation: "document-migration", verify });
      return this.markdown(plan.workspaceId, plan.fileId);
    });
  }

  async patch(workspaceId: string, fileId: string, ticketId: string, update: TicketChange): Promise<TicketDocumentResponse> {
    const saved = await this.write(workspaceId, fileId, ticketId, update, (markdown) => updateTicketStatusAndProgress(markdown, ticketId, { ...update, reason: update.reason ?? "" }));
    return { file: saved.file, document: saved.document ?? attachTicketSearch(parseTicketDocument(saved.markdown), saved.markdown) };
  }
  async append(workspaceId: string, fileId: string, ticketId: string, instruction: Instruction): Promise<TicketDocumentResponse> {
    if (!instruction.text.trim()) throw new BrowserFileError("EMPTY_INSTRUCTION", "Enter an instruction.");
    const saved = await this.write(workspaceId, fileId, ticketId, instruction, (markdown) => appendUserInstruction(markdown, ticketId, instruction.text.trim(), { kind: instruction.kind }));
    return { file: saved.file, document: saved.document ?? attachTicketSearch(parseTicketDocument(saved.markdown), saved.markdown) };
  }

  async editSmoke(workspaceId: string, fileId: string, guard: Guard, change: SmokeChange): Promise<MarkdownDocumentResponse> {
    if ((await this.recoveries()).some(record => record.fileId === fileId)) throw new BrowserFileError("RECOVERY_REQUIRED", "Review the pending recovery record before saving again.");
    const file = await this.file(workspaceId, fileId);
    if (file.type !== "smoke" && file.type !== "smoke-run") throw new BrowserFileError("INVALID_DOCUMENT", "Open a smoke definition or run before editing.");
    const kind = file.type;
    const saved = await this.write(workspaceId, fileId, change.kind === "case" ? change.caseId : "", guard,
      source => updateSmokeDocument(source, kind, change, new Date().toISOString()), { operation: "smoke-edit" });
    return { file: saved.file, markdown: saved.markdown, outline: parseMarkdownOutline(saved.markdown) };
  }

  private async write(workspaceId: string, fileId: string, ticketId: string, guard: Guard, transform: (source: string) => string | Promise<string>, operation?: { operation: "document-migration" | "smoke-edit"; verify?: () => Promise<void> }): Promise<Snapshot> {
    if (!guard.expectedHash || guard.expectedMtimeMs === undefined) throw new BrowserFileError("STALE_FILE", "Reload the document before saving.");
    return this.lock("document:" + fileId, async () => {
      if ((await this.recoveries()).some((record) => record.fileId === fileId)) throw new BrowserFileError("RECOVERY_REQUIRED", "Review the pending recovery record before saving again.");
      const record = await this.document(workspaceId, fileId);
      if (await record.handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant write access from the folder connections menu.");
      const before = await this.snapshot(record, true);
      if (before.file.hash !== guard.expectedHash || before.file.mtimeMs !== guard.expectedMtimeMs) throw new BrowserFileError("STALE_FILE", "The Markdown file changed externally. Reload it before saving.");
      const intended = await transform(before.markdown);
      if (intended === before.markdown) return before;
      if (new TextEncoder().encode(intended).byteLength > MAX_DOCUMENT_BYTES) throw new BrowserFileError("FILE_TOO_LARGE", "The document is too large to save safely.");
      // Migration verifies fresh IDs together with its references in transform()
      // and again after createWritable(). Ordinary edits retain their own ID guard.
      if (before.file.documentId && operation?.operation !== "document-migration") {
        const identity = (await this.documentIdIndex(workspaceId)).find((entry) => entry.documentId === before.file.documentId);
        if (!identity || identity.status !== "unique" || identity.documents[0]?.localId !== fileId) {
          throw new BrowserFileError("DUPLICATE_DOCUMENT_ID", "The document ID is shared by multiple files. Resolve the duplicate IDs before editing.");
        }
      }
      const recovery: RecoveryRecord = {
        id: newId("r_"), fileId, workspaceId, path: record.path, ticketId, before: before.markdown, intended,
        beforeHash: before.file.hash, intendedHash: await contentHash(intended), createdAt: new Date().toISOString(),
        ...(operation ? { operation: operation.operation } : {}),
      };
      // Fail closed: no original file mutation until the preimage and intended result are durable.
      await (operation?.operation === "smoke-edit" ? this.storage.setDurable ?? this.storage.set : this.storage.set).call(this.storage, "recovery:" + recovery.id, recovery);
      this.changed();
      let writable: FileSystemWritableFileStream | undefined;
      try {
        writable = await record.handle.createWritable({ keepExistingData: Boolean(operation) });
        await operation?.verify?.();
        const latest = await this.snapshot(await this.document(workspaceId, fileId), true);
        if (latest.file.hash !== before.file.hash || latest.file.mtimeMs !== before.file.mtimeMs) throw new BrowserFileError("STALE_FILE", "The file changed just before saving; the write was cancelled.");
        await writable.write(intended);
        if (operation) await writable.truncate(new TextEncoder().encode(intended).byteLength);
        await writable.close();
        writable = undefined;
        const result = await this.snapshot(await this.document(workspaceId, fileId), true);
        if (result.file.hash !== recovery.intendedHash) throw new BrowserFileError("WRITE_UNCERTAIN", "The saved content could not be verified. Review the recovery record.");
        await this.storage.delete("recovery:" + recovery.id);
        this.changed();
        return result;
      } catch (error) {
        await writable?.abort().catch(() => undefined);
        this.forgetSnapshot(fileId); this.index.delete(fileId);
        this.changed();
        throw error;
      }
    });
  }

  async recoveries(): Promise<RecoveryRecord[]> {
    return (await this.storage.entries<RecoveryRecord>("recovery:")).map((row) => row.value);
  }
  async recoveryDocument(record: RecoveryRecord): Promise<MarkdownDocumentResponse> {
    if (record.operation === "smoke-create") {
      const project = await this.project(record.workspaceId);
      await this.assertOwnedPath(project, record.path);
      const parts = record.path.split("/");
      let directory = project.handle;
      for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
      const handle = await directory.getFileHandle(parts.at(-1)!);
      const current = await this.snapshot({ id: record.fileId, workspaceId: record.workspaceId, path: record.path, handle }, true);
      return { file: current.file, markdown: current.markdown, outline: parseMarkdownOutline(current.markdown) };
    }
    const document = await this.storage.get<DocumentRecord>("document:" + record.fileId);
    return this.markdown(document?.workspaceId ?? record.workspaceId, record.fileId);
  }
  async reviewRecovery(record: RecoveryRecord): Promise<{ hash: string | null; status: "applied" | "unchanged" | "different" | "missing" }> {
    try {
      const current = await this.recoveryDocument(record);
      return { hash: current.file.hash, status: current.file.hash === record.intendedHash ? "applied" : current.file.hash === record.beforeHash ? "unchanged" : "different" };
    } catch (error) {
      if (record.operation === "smoke-create" && isErrorNamed(error, "NotFoundError")) return { hash: null, status: "missing" };
      throw error;
    }
  }
  async recoveryStatus(record: RecoveryRecord): Promise<"applied" | "unchanged" | "different"> {
    const current = await this.recoveryDocument(record);
    return current.file.hash === record.intendedHash ? "applied" : current.file.hash === record.beforeHash ? "unchanged" : "different";
  }
  async dismissRecovery(record: RecoveryRecord, expectedHash: string | null) {
    await this.lock(record.operation === "smoke-create" ? "document:create" : "document:" + record.fileId, async () => {
      const current = await this.reviewRecovery(record);
      if (current.hash !== expectedHash) throw new BrowserFileError("STALE_FILE", "The file changed during recovery review.");
      await this.storage.delete("recovery:" + record.id);
      this.changed();
    });
  }

  async restoreMigration(record: RecoveryRecord, expectedHash: string) {
    return this.lock("document:" + record.fileId, async () => {
      const saved = await this.storage.get<RecoveryRecord>("recovery:" + record.id);
      if (saved?.operation !== "document-migration" || JSON.stringify(saved) !== JSON.stringify(record) || await contentHash(saved.before) !== saved.beforeHash || await contentHash(saved.intended) !== saved.intendedHash) throw new BrowserFileError("INVALID_PREVIEW", "The recovery copy could not be verified.");
      const current = await this.recoveryDocument(saved);
      if (current.file.hash !== expectedHash || ![saved.beforeHash, saved.intendedHash].includes(expectedHash)) throw new BrowserFileError("STALE_FILE", "The current file differs from the recovery copies. Preserve the external changes and resolve it manually.");
      if (expectedHash !== saved.beforeHash) {
        const document = await this.document(current.file.workspaceId, saved.fileId);
        if (await document.handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant write access from the folder connections menu.");
        let writable: FileSystemWritableFileStream | undefined;
        try {
          writable = await document.handle.createWritable({ keepExistingData: true });
          const latest = await this.recoveryDocument(saved);
          if (latest.file.hash !== expectedHash || latest.file.mtimeMs !== current.file.mtimeMs) throw new BrowserFileError("STALE_FILE", "The file changed during recovery review.");
          await writable.write(saved.before); await writable.truncate(new TextEncoder().encode(saved.before).byteLength); await writable.close(); writable = undefined;
          if ((await this.recoveryDocument(saved)).file.hash !== saved.beforeHash) throw new BrowserFileError("WRITE_UNCERTAIN", "The restored content could not be verified. Keep the recovery copy.");
        } catch (error) { await writable?.abort().catch(() => undefined); throw error; }
      }
      await this.storage.delete("recovery:" + saved.id); this.changed();
    });
  }

  async boardOrder(): Promise<BoardOrder> {
    return (await this.storage.get<BoardOrder>("boardOrder")) ?? { keys: [] };
  }
  async saveBoardOrder(order: BoardOrder, expected: BoardOrder) {
    return this.lock("boardOrder", async () => {
      const latest = await this.boardOrder();
      if (JSON.stringify(latest.keys) !== JSON.stringify(expected.keys)) throw new BrowserFileError("STALE_ORDER", "Another tab changed the board order. Reload it before sorting again.");
      await this.storage.set("boardOrder", order);
      this.changed();
      return order;
    });
  }

  async localResource(workspaceId: string, fileId: string, href: string): Promise<{ file: File; path: string; documentId?: string }> {
    const source = await this.document(workspaceId, fileId);
    const project = await this.project(workspaceId);
    const decoded = decodeURIComponent(href.split(/[?#]/)[0] ?? "");
    if (!decoded || /^[a-z][a-z\d+.-]*:|^[/\\]/i.test(decoded) || decoded.includes("\\")) throw new BrowserFileError("RESOURCE_OUTSIDE_PROJECT", "This resource is outside the connected project.");
    const parts = source.path.split("/").slice(0, -1);
    for (const part of decoded.split("/")) {
      if (part === "..") { if (!parts.length) throw new BrowserFileError("RESOURCE_OUTSIDE_PROJECT", "Connect the resource folder first."); parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    let directory = project.handle;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(parts.at(-1)!);
    await this.assertOwnedPath(project, parts.join("/"));
    const documentId = /\.md$/i.test(handle.name) ? (await this.documentIdentity(project, parts.join("/"), handle)).id : undefined;
    return { file: await handle.getFile(), path: parts.join("/"), documentId };
  }

  async localFileEntry(workspaceId: string, fileId: string, href: string) {
    const source = await this.document(workspaceId, fileId);
    const path = relativeFilePath(source.path, href, true);
    if (!path || /(?:\/|(?:^|\/)\.{1,2})$/.test(decodeURIComponent(href.split(/[?#]/)[0] ?? ""))) return this.projectFiles.folderEntry(workspaceId, path);
    try {
      return await this.projectFiles.entry(workspaceId, path);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "TypeMismatchError")) throw error;
      return this.projectFiles.folderEntry(workspaceId, path);
    }
  }

  async linkContext(workspaceId: string, fileId: string): Promise<LinkContext> {
    const source = await this.document(workspaceId, fileId);
    const project = await this.project(workspaceId);
    return { scopeId: workspaceId, label: project.label, root: project.handle, path: source.path, documentId: source.id };
  }
}

export const browserRepository = new BrowserRepository();
export const browserLinkMappings = new LinkMappings(browserRepository.storage, () => browserRepository.connections());
