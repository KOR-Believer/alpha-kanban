import type {
  MarkdownDocumentResponse, MarkdownFileSummary, TicketDocumentResponse, TicketInstructionKind,
  TicketProgress, TicketStatus, WorkspaceSummary, WorkspacesResponse, BoardOrder, DocumentSetTicketProgress, DocumentSetsResponse,
} from "@alpha-kanban/shared";
import { buildDocumentSets, inferMarkdownFileType, inferSequenceNumber, inferSlug, parseMarkdownOutline, sumDocumentSetTicketProgress } from "@alpha-kanban/shared/documents";
import { appendUserInstruction, parseTicketDocument, updateTicketStatusAndProgress } from "@alpha-kanban/shared/ticketMarkdown";
import { IndexedDbStorage, type BrowserStorage } from "./storage";
import { appActivity } from "../pwa/activity";

export class BrowserFileError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "BrowserFileError"; }
}

export type Connection = { id: string; kind: "root" | "project"; handle: FileSystemDirectoryHandle; name: string };
type ProjectRecord = { id: string; handle: FileSystemDirectoryHandle; connectionId: string; label: string; parent: string; lastOpenedAt?: string };
type DocumentRecord = { id: string; workspaceId: string; path: string; handle: FileSystemFileHandle };
type Snapshot = { file: MarkdownFileSummary; markdown: string; size: number };
type IndexedSnapshot = { file: MarkdownFileSummary; size: number; ticketProgress?: DocumentSetTicketProgress };
export type RecoveryRecord = {
  id: string; fileId: string; workspaceId: string; path: string; ticketId: string;
  before: string; intended: string; beforeHash: string; intendedHash: string; createdAt: string;
};
type Guard = { expectedHash?: string; expectedMtimeMs?: number };
export type TicketChange = Guard & { status?: TicketStatus; progress?: TicketProgress; reason?: string };
export type Instruction = Guard & { kind: TicketInstructionKind; text: string };
type Lock = <T>(name: string, action: () => Promise<T>) => Promise<T>;
const ignoredDirectories = new Set([".git", "node_modules", ".alpha-kanban", ".next", "dist", "dist-browser", "build"]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_DISCOVERY_INTERVAL_MS = 60_000;

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
  private listings = new Map<string, { records: DocumentRecord[]; scannedAt: number }>();
  private listingRevision = 0;
  private changeListeners = new Set<() => void>();
  private channel?: BroadcastChannel;

  constructor(readonly storage: BrowserStorage = new IndexedDbStorage(), private readonly lock: Lock = browserLock, private readonly cacheBytes = 64 * 1024 * 1024) {}

  private clearSnapshots() { this.snapshots.clear(); this.index.clear(); this.snapshotBytes = 0; this.invalidateListings(); }

  invalidateListings() { this.listings.clear(); this.listingRevision++; }

  private forgetSnapshot(id: string) {
    const previous = this.snapshots.get(id);
    if (previous) this.snapshotBytes -= previous.markdown.length * 2;
    this.snapshots.delete(id);
  }

  private cache(snapshot: Snapshot) {
    this.forgetSnapshot(snapshot.file.id);
    const bytes = snapshot.markdown.length * 2;
    if (bytes <= this.cacheBytes) {
      while (this.snapshotBytes + bytes > this.cacheBytes && this.snapshots.size) this.forgetSnapshot(this.snapshots.keys().next().value!);
      this.snapshots.set(snapshot.file.id, snapshot); this.snapshotBytes += bytes;
    }
    const ticketProgress = snapshot.file.type === "tickets" ? parseTicketDocument(snapshot.markdown).status : undefined;
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
        let hasDocs = false;
        try { await handle.getDirectoryHandle("docs"); hasDocs = true; } catch { /* Root-level Markdown also remains browsable. */ }
        visible.set(updated.id, this.workspaceSummary(updated, true, hasDocs));
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

  private workspaceSummary(project: ProjectRecord, isAvailable: boolean, hasDocs = false): WorkspaceSummary {
    return {
      id: project.id, label: project.label, root: project.parent === project.label ? project.label : project.parent + "/" + project.label,
      isAvailable, hasDocs, lastOpenedAt: project.lastOpenedAt,
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
    const excluded = await this.excludedPaths(project);
    if (excluded.includes("")) return [];
    const listing = this.listings.get(listingKey);
    if (!force && listing && Date.now() - listing.scannedAt < DOCUMENT_DISCOVERY_INTERVAL_MS) {
      try {
        const files: MarkdownFileSummary[] = [];
        let moved = false;
        for (const record of listing.records) {
          if (excluded.some((root) => record.path === root || record.path.startsWith(root + "/"))) continue;
          const relative = await project.handle.resolve(record.handle);
          if (!relative || relative.join("/") !== record.path) { moved = true; break; }
          files.push(await this.fileSummary(record, false));
        }
        if (!moved) return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      } catch (error) {
        if (!isErrorNamed(error, "NotFoundError")) throw error;
        // A removed handle needs discovery now, not another minute of stale cards.
      }
    }
    const files: MarkdownFileSummary[] = [];
    const records: DocumentRecord[] = [];
    let identities: Promise<Map<string, DocumentRecord>> | undefined;
    const identityIndex = () => identities ??= this.resolveDocumentIdentities(project);
    const walk = async (directory: FileSystemDirectoryHandle, path: string, depth: number) => {
      if (depth > 30) throw new BrowserFileError("SCAN_LIMIT", "Folder nesting is too deep to scan safely.");
      for await (const handle of directory.values()) {
        const relative = path ? path + "/" + handle.name : handle.name;
        if (excluded.some((root) => relative === root || relative.startsWith(root + "/"))) continue;
        if (handle.kind === "directory") {
          if (!handle.name.startsWith(".") && !ignoredDirectories.has(handle.name)) await walk(handle, relative, depth + 1);
        } else if (/\.md$/i.test(handle.name)) {
          if (ticketsOnly && inferMarkdownFileType(relative) !== "tickets") continue;
          if (files.length >= 5000) throw new BrowserFileError("SCAN_LIMIT", "Too many Markdown files. Connect a smaller project folder.");
          const record = await this.documentIdentity(project, relative, handle, identityIndex);
          records.push(record);
          files.push(await this.fileSummary(record, force));
        }
      }
    };
    await walk(project.handle, "", 0);
    if (revision === this.listingRevision) this.listings.set(listingKey, { records, scannedAt: Date.now() });
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async resolveDocumentIdentities(project: ProjectRecord): Promise<Map<string, DocumentRecord>> {
    const documents = (await this.storage.entries<DocumentRecord>("document:")).map((row) => row.value);
    // Index persisted handles by their current path once per scan, including moves
    // across projects. Newly discovered files never join a pairwise comparison loop.
    const identities = new Map<string, DocumentRecord>();
    for (const record of documents) {
      try {
        const relative = await project.handle.resolve(record.handle);
        if (relative?.length) identities.set(relative.join("/"), record);
      } catch (error) {
        if (!isErrorNamed(error, "NotFoundError") && !isErrorNamed(error, "NotAllowedError")) throw error;
      }
    }
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

  private async fileSummary(record: DocumentRecord, force: boolean): Promise<MarkdownFileSummary> {
    const blob = await record.handle.getFile();
    const indexed = this.index.get(record.id);
    if (!force && indexed && indexed.file.workspaceId === record.workspaceId && indexed.file.workspaceRelativePath === record.path && indexed.file.mtimeMs === blob.lastModified && indexed.size === blob.size) return indexed.file;
    return (await this.snapshot(record, true, blob)).file;
  }

  private async snapshot(record: DocumentRecord, force = false, blob?: File): Promise<Snapshot> {
    blob ??= await record.handle.getFile();
    if (blob.size > MAX_DOCUMENT_BYTES) throw new BrowserFileError("FILE_TOO_LARGE", "Markdown files larger than 10 MiB are not supported.");
    const cached = this.snapshots.get(record.id);
    if (!force && cached && cached.file.workspaceId === record.workspaceId && cached.file.workspaceRelativePath === record.path && cached.file.mtimeMs === blob.lastModified && cached.size === blob.size) {
      this.snapshots.delete(record.id); this.snapshots.set(record.id, cached);
      return cached;
    }
    // Fatal decoding refuses non-UTF-8 input rather than corrupting it on the next save; preserve BOM.
    const markdown = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await blob.arrayBuffer());
    const file: MarkdownFileSummary = {
      id: record.id, workspaceId: record.workspaceId, type: inferMarkdownFileType(record.path), filename: blob.name,
      directory: record.path.split("/").slice(0, -1).join("/"), relativePath: record.path, workspaceRelativePath: record.path,
      hash: await contentHash(markdown), mtimeMs: blob.lastModified, slug: inferSlug(record.path), sequenceNumber: inferSequenceNumber(record.path),
    };
    const result = { file, markdown, size: blob.size };
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
  async tickets(workspaceId: string, id: string, force = true): Promise<TicketDocumentResponse> {
    const snapshot = await this.snapshot(await this.document(workspaceId, id), force);
    return { file: snapshot.file, document: parseTicketDocument(snapshot.markdown) };
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

  patch(workspaceId: string, fileId: string, ticketId: string, update: TicketChange) {
    return this.write(workspaceId, fileId, ticketId, update, (markdown) => updateTicketStatusAndProgress(markdown, ticketId, { ...update, reason: update.reason ?? "" }));
  }
  append(workspaceId: string, fileId: string, ticketId: string, instruction: Instruction) {
    if (!instruction.text.trim()) throw new BrowserFileError("EMPTY_INSTRUCTION", "Enter an instruction.");
    return this.write(workspaceId, fileId, ticketId, instruction, (markdown) => appendUserInstruction(markdown, ticketId, instruction.text.trim(), { kind: instruction.kind }));
  }

  private async write(workspaceId: string, fileId: string, ticketId: string, guard: Guard, transform: (source: string) => string): Promise<TicketDocumentResponse> {
    if (!guard.expectedHash || guard.expectedMtimeMs === undefined) throw new BrowserFileError("STALE_FILE", "Reload the document before saving.");
    return this.lock("document:" + fileId, async () => {
      if ((await this.recoveries()).some((record) => record.fileId === fileId)) throw new BrowserFileError("RECOVERY_REQUIRED", "Review the pending recovery record before saving again.");
      const record = await this.document(workspaceId, fileId);
      if (await record.handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new BrowserFileError("PERMISSION_REQUIRED", "Grant write access from the folder connections menu.");
      const before = await this.snapshot(record, true);
      if (before.file.hash !== guard.expectedHash || before.file.mtimeMs !== guard.expectedMtimeMs) throw new BrowserFileError("STALE_FILE", "The Markdown file changed externally. Reload it before saving.");
      const intended = transform(before.markdown);
      if (intended === before.markdown) return { file: before.file, document: parseTicketDocument(intended) };
      const recovery: RecoveryRecord = {
        id: newId("r_"), fileId, workspaceId, path: record.path, ticketId, before: before.markdown, intended,
        beforeHash: before.file.hash, intendedHash: await contentHash(intended), createdAt: new Date().toISOString(),
      };
      // Fail closed: no original file mutation until the preimage and intended result are durable.
      await this.storage.set("recovery:" + recovery.id, recovery);
      this.changed();
      let writable: FileSystemWritableFileStream | undefined;
      try {
        writable = await record.handle.createWritable({ keepExistingData: false });
        const latest = await this.snapshot(await this.document(workspaceId, fileId), true);
        if (latest.file.hash !== before.file.hash || latest.file.mtimeMs !== before.file.mtimeMs) throw new BrowserFileError("STALE_FILE", "The file changed just before saving; the write was cancelled.");
        await writable.write(intended);
        await writable.close();
        writable = undefined;
        const result = await this.snapshot(await this.document(workspaceId, fileId), true);
        if (result.file.hash !== recovery.intendedHash) throw new BrowserFileError("WRITE_UNCERTAIN", "The saved content could not be verified. Review the recovery record.");
        await this.storage.delete("recovery:" + recovery.id);
        this.changed();
        return { file: result.file, document: parseTicketDocument(result.markdown) };
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
    const document = await this.storage.get<DocumentRecord>("document:" + record.fileId);
    return this.markdown(document?.workspaceId ?? record.workspaceId, record.fileId);
  }
  async recoveryStatus(record: RecoveryRecord): Promise<"applied" | "unchanged" | "different"> {
    const current = await this.recoveryDocument(record);
    return current.file.hash === record.intendedHash ? "applied" : current.file.hash === record.beforeHash ? "unchanged" : "different";
  }
  async dismissRecovery(record: RecoveryRecord, expectedHash: string) {
    await this.lock("document:" + record.fileId, async () => {
      const current = await this.recoveryDocument(record);
      if (current.file.hash !== expectedHash) throw new BrowserFileError("STALE_FILE", "The file changed during recovery review.");
      await this.storage.delete("recovery:" + record.id);
      this.changed();
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
}

export const browserRepository = new BrowserRepository();
