import { BROWSER_DATABASE_NAME, IndexedDbStorage, type BrowserStorage } from "../browser/storage";
import { appActivity } from "../pwa/activity";
import { isLedgerSkill, MAX_BYTES, MAX_FILE_BYTES, MAX_FILES, safeSkillPath, skillHash, validateBundle, type SkillBundle, type SkillFile } from "./bundle";
import { sameSkillFiles as same } from "./installation";
import { notifyAppUpdateAcknowledged } from "./appUpdateNotice";

type SnapshotFile = SkillFile & { mtime: number };
export type SkillConnection = { id: string; name: string; handle: FileSystemDirectoryHandle };
export type SkillReview = {
  connection: SkillConnection; files: SnapshotFile[]; bundle: SkillBundle;
  state: "current" | "update" | "custom" | "review"; changes: Array<{ path: string; kind: "add" | "change" | "remove" }>;
};
export type SkillRecovery = {
  id: string; connection: SkillConnection; before: SnapshotFile[]; intended: SkillFile[];
  createdAt: string; state: "pending" | "applied" | "restored";
  operation?: "update" | "reinstall";
  created?: Array<{ path: string; handle: FileSystemFileHandle }>;
};
type Fingerprint = Pick<SnapshotFile, "path" | "sha256" | "mtime">;
export type AppSkillUpdate = {
  id: string; fromBuild: string; buildId: string; version: string; digest: string;
  connectionId: string; files: Fingerprint[];
  state: "approved" | "writing" | "applied" | "blocked";
  error?: string; recoveryId?: string; acknowledged?: boolean;
};
const CONNECTION = "skill-update:connection";
const RECOVERY = "skill-update:recovery:";
const APP_UPDATE = "skill-update:app-update";
const LOCK = "alpha-kanban:skill-update-v1";
const CHANGED = "The skill changed outside this app. Compare it again before updating.";
type Lock = <T>(name: string, action: () => Promise<T>) => Promise<T>;
const browserLock: Lock = (name, action) => {
  if (!navigator.locks) throw new Error("Open this page in desktop Chrome over HTTPS or localhost.");
  return navigator.locks.request(name, action);
};
async function permission(handle: FileSystemDirectoryHandle, mode: FileSystemPermissionMode) {
  if (await handle.queryPermission({ mode }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
}
async function fileHandle(root: FileSystemDirectoryHandle, path: string, create = false) {
  if (!safeSkillPath(path)) throw new Error("Invalid skill path.");
  const parts = path.split("/"); const name = parts.pop()!;
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return { directory, name, handle: await directory.getFileHandle(name, { create }) };
}
async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<SnapshotFile | undefined> {
  try {
    const { handle } = await fileHandle(root, path);
    const file = await handle.getFile();
    if (file.size > MAX_FILE_BYTES) throw new Error("The skill folder is too large to manage here. Use the agent request instead.");
    const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    return { path, content, mtime: file.lastModified, sha256: await skillHash(content) };
  } catch (error) { if (error instanceof DOMException && error.name === "NotFoundError") return undefined; throw error; }
}
/** Read the selected folder's own header only; never search its parent or children. */
export async function verifySkillDirectory(root: FileSystemDirectoryHandle) {
  await permission(root, "read");
  const skill = await readFile(root, "SKILL.md");
  if (!skill || !isLedgerSkill(skill.content)) throw new Error("Select the installed implementation-ledger folder containing SKILL.md.");
}
async function snapshot(root: FileSystemDirectoryHandle, requireSkill = true) {
  if (requireSkill) await verifySkillDirectory(root);
  else await permission(root, "read");
  const files: SnapshotFile[] = []; let size = 0, entries = 0;
  async function walk(directory: FileSystemDirectoryHandle, prefix = "", depth = 0) {
    if (depth > 5) throw new Error("Invalid skill path.");
    for await (const entry of directory.values()) {
      if (++entries > MAX_FILES * 2) throw new Error("The skill folder is too large to manage here. Use the agent request instead.");
      const path = prefix + entry.name;
      if (!safeSkillPath(path)) throw new Error("Invalid skill path.");
      if (entry.kind === "directory") await walk(entry as FileSystemDirectoryHandle, path + "/", depth + 1);
      else {
        const file = await readFile(root, path);
        if (!file) throw new Error(CHANGED);
        size += new TextEncoder().encode(file.content).length;
        files.push(file);
        if (size > MAX_BYTES || files.length > MAX_FILES) throw new Error("The skill folder is too large to manage here. Use the agent request instead.");
      }
    }
  }
  await walk(root);
  if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length) throw new Error("Invalid skill path.");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function checkReinstallPaths(root: FileSystemDirectoryHandle, target: SkillFile[]) {
  const paths = new Map<string, { path: string; kind: FileSystemHandleKind }>();
  function add(path: string, kind: FileSystemHandleKind) {
    const previous = paths.get(path.toLowerCase());
    if (previous && (previous.path !== path || previous.kind !== kind)) {
      throw new Error("The installed skill's file and folder paths conflict with this bundle. Ask your agent to compare them.");
    }
    paths.set(path.toLowerCase(), { path, kind });
  }
  for (const file of target) {
    const parts = file.path.split("/");
    parts.forEach((_, index) => add(parts.slice(0, index + 1).join("/"), index === parts.length - 1 ? "file" : "directory"));
  }
  let entries = 0;
  async function walk(directory: FileSystemDirectoryHandle, prefix = "", depth = 0) {
    if (depth > 5) throw new Error("Invalid skill path.");
    for await (const entry of directory.values()) {
      if (++entries > MAX_FILES * 2) throw new Error("The skill folder is too large to manage here. Use the agent request instead.");
      const path = prefix + entry.name;
      if (!safeSkillPath(path)) throw new Error("Invalid skill path.");
      add(path, entry.kind);
      if (entry.kind === "directory") await walk(entry as FileSystemDirectoryHandle, path + "/", depth + 1);
    }
  }
  // Include empty directories and directory casing: neither appears in a file-only snapshot.
  await walk(root);
}
function unchanged(a: Fingerprint[], b: Fingerprint[]) { return same(a, b) && a.every((file) => b.find((other) => other.path === file.path)?.mtime === file.mtime); }
export function skillError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Allow access to the registered skill folder to continue.";
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "The backup could not be saved. Free browser storage before trying again.";
  return error instanceof Error ? error.message : "Skill operation failed. Review the backup before trying again.";
}

export class SkillRepository {
  constructor(private readonly storage: BrowserStorage = new IndexedDbStorage(BROWSER_DATABASE_NAME, "strict"), private readonly lock: Lock = browserLock,
    private readonly target: { version: string; digest?: string; compatible?: boolean } = { version: __APP_RELEASE__.skillBundle, digest: __APP_RELEASE__.skillPayload, compatible: __APP_RELEASE__.history?.at(-1)?.skill?.compatibility !== "unknown" }) {}
  connection() { return this.storage.get<SkillConnection>(CONNECTION); }
  appUpdate() { return this.storage.get<AppSkillUpdate>(APP_UPDATE); }
  async recoveries() { return (await this.storage.entries<SkillRecovery>(RECOVERY)).map((row) => row.value); }
  async connect(handle: FileSystemDirectoryHandle) {
    return this.lock(LOCK, () => appActivity.run(async () => {
      if ((await this.recoveries()).some((record) => record.state === "pending")) throw new Error("Review the unfinished skill update before changing its connection.");
      await snapshot(handle);
      const current = await this.connection();
      if (current && await handle.isSameEntry(current.handle)) return current;
      const connection: SkillConnection = { id: crypto.randomUUID(), name: handle.name, handle };
      await this.storage.set(CONNECTION, connection);
      return connection;
    }));
  }
  async disconnect() {
    await this.lock(LOCK, () => this.storage.delete(CONNECTION));
  }
  async inspect(connection: SkillConnection, bundle: SkillBundle): Promise<SkillReview> {
    await validateBundle(bundle, this.target.version, this.target.digest);
    const files = await snapshot(connection.handle);
    const state = same(files, bundle.files) ? "current" : this.target.compatible === false ? "review" : bundle.known.some((release) => same(files, release.files)) ? "update" : "custom";
    const changes: SkillReview["changes"] = [];
    for (const file of bundle.files) {
      const existing = files.find((item) => item.path === file.path);
      if (!existing || existing.sha256 !== file.sha256) changes.push({ path: file.path, kind: existing ? "change" : "add" });
    }
    for (const file of files) if (!bundle.files.some((item) => item.path === file.path)) changes.push({ path: file.path, kind: "remove" });
    return { connection, bundle, files, state, changes };
  }
  async apply(review: SkillReview) {
    return this.lock(LOCK, () => appActivity.run(() => this.applyReview(review), true));
  }
  // Only the explicit reinstall flow calls this; normal and PWA updates still require a known snapshot.
  async reinstall(review: SkillReview) {
    return this.lock(LOCK, () => appActivity.run(() => this.applyReview(review, crypto.randomUUID(), "reinstall"), true));
  }
  private async checkReview(review: SkillReview, operation: "update" | "reinstall" = "update") {
    if (operation === "reinstall" && !this.target.digest) throw new Error("Skill information is unavailable. Use the agent request instead.");
    await validateBundle(review.bundle, this.target.version, this.target.digest);
    await permission(review.connection.handle, "readwrite");
    const connection = await this.connection();
    if (!connection || connection.id !== review.connection.id || !await connection.handle.isSameEntry(review.connection.handle)) throw new Error(CHANGED);
    if ((await this.recoveries()).some((record) => record.state === "pending")) throw new Error("Review the unfinished skill update before changing its connection.");
    const current = await this.inspect(connection, review.bundle);
    if (!unchanged(current.files, review.files)) throw new Error(CHANGED);
    if (operation === "update" && current.state !== "update") throw new Error("Personal or unrecognized files will not be overwritten. Ask your agent to compare them.");
    if (operation === "reinstall") {
      if (current.state === "review") throw new Error("Ask your AI tool to review compatibility before changing your skill or documents.");
      await checkReinstallPaths(connection.handle, review.bundle.files);
    }
    return current;
  }
  private async applyReview(review: SkillReview, id: string = crypto.randomUUID(), operation: "update" | "reinstall" = "update") {
    const current = await this.checkReview(review, operation);
    const connection = current.connection;
    const recovery: SkillRecovery = { id, connection, before: current.files, intended: review.bundle.files, createdAt: new Date().toISOString(), state: "pending", operation };
    await this.storage.set(RECOVERY + recovery.id, recovery);
    if (!unchanged(await snapshot(connection.handle), recovery.before)) throw new Error(CHANGED);
    if (operation === "reinstall") await checkReinstallPaths(connection.handle, recovery.intended);
    await this.replace(recovery, false);
    await this.storage.set(RECOVERY + recovery.id, { ...recovery, state: "applied" });
    return recovery.id;
  }
  async approveAppUpdate(review: SkillReview, fromBuild: string, buildId: string) {
    return this.lock(LOCK, () => appActivity.run(async () => {
      if (this.target.compatible !== true || !this.target.digest || !/^[a-f0-9]{16}$/.test(buildId) || !/^[a-f0-9]{16}$/.test(fromBuild) || buildId === fromBuild) throw new Error("Ask your AI tool to review compatibility before changing your skill or documents.");
      const previous = await this.storage.get<AppSkillUpdate>(APP_UPDATE);
      if (previous?.state === "writing") throw new Error("Review the unfinished skill update before changing its connection.");
      const current = await this.checkReview(review);
      const approval: AppSkillUpdate = { id: crypto.randomUUID(), fromBuild, buildId, version: this.target.version, digest: this.target.digest,
        connectionId: current.connection.id, files: current.files.map(({ path, sha256, mtime }) => ({ path, sha256, mtime })), state: "approved" };
      await this.storage.set(APP_UPDATE, approval);
      return approval.id;
    }));
  }
  async cancelAppUpdate(id?: string) {
    await this.lock(LOCK, async () => {
      await appActivity.whenResumed();
      // Hold activity through the read as well: a late AK_PREPARE must not freeze the subsequent deletion.
      await appActivity.run(async () => {
        const approval = await this.storage.get<AppSkillUpdate>(APP_UPDATE);
        if (approval && (!id || approval.id === id) && approval.state === "approved") await this.storage.delete(APP_UPDATE);
      });
    });
  }
  async acknowledgeAppUpdate(id: string) {
    await this.lock(LOCK, async () => {
      const approval = await this.storage.get<AppSkillUpdate>(APP_UPDATE);
      if (approval?.id === id && ["applied", "blocked"].includes(approval.state)) {
        await this.storage.set(APP_UPDATE, { ...approval, acknowledged: true });
        notifyAppUpdateAcknowledged(id);
      }
    });
  }
  async completeAppUpdate(buildId: string, load: () => Promise<SkillBundle>): Promise<AppSkillUpdate | undefined> {
    return this.lock(LOCK, () => appActivity.run(async () => {
      let approval = await this.storage.get<AppSkillUpdate>(APP_UPDATE);
      if (!approval || approval.fromBuild === buildId || approval.acknowledged) return;
      if (["applied", "blocked"].includes(approval.state)) return approval;
      try {
        if (approval.state === "writing") throw new Error("Skill files could not be verified. Review the saved backup before retrying.");
        if (approval.state !== "approved" || approval.buildId !== buildId || approval.version !== this.target.version || approval.digest !== this.target.digest || this.target.compatible !== true) throw new Error("The prepared update changed. Review its notes again before applying.");
        const connection = await this.connection();
        if (!connection || connection.id !== approval.connectionId) throw new Error(CHANGED);
        const review = await this.inspect(connection, await load());
        if (!unchanged(review.files, approval.files)) throw new Error(CHANGED);
        await this.checkReview(review);
        // Claim once under the shared skill lock. A crash here requires explicit review, never an automatic retry.
        approval = { ...approval, state: "writing", recoveryId: crypto.randomUUID() };
        await this.storage.set(APP_UPDATE, approval);
        await this.applyReview(review, approval.recoveryId);
        approval = { ...approval, state: "applied" };
      } catch (error) {
        approval = { ...approval, state: "blocked", error: skillError(error) };
      }
      await this.storage.set(APP_UPDATE, approval);
      return approval;
    }, true));
  }
  async restore(id: string) {
    return this.lock(LOCK, () => appActivity.run(async () => {
      const recovery = await this.storage.get<SkillRecovery>(RECOVERY + id);
      if (!recovery) throw new Error("Skill backup is unavailable.");
      if ((await this.recoveries()).some((record) => record.id !== id && record.state === "pending")) throw new Error("Review the unfinished skill update before changing its connection.");
      await permission(recovery.connection.handle, "readwrite");
      // A durable intent remains until all files have passed readback, including after a restart.
      await this.storage.set(RECOVERY + id, { ...recovery, state: "pending" });
      await this.replace(recovery, true);
      await this.storage.set(RECOVERY + id, { ...recovery, state: "restored" });
    }, true));
  }
  private async replace(recovery: SkillRecovery, restoring: boolean) {
    const root = recovery.connection.handle;
    const from = restoring ? recovery.intended : recovery.before;
    const target = restoring ? recovery.before : recovery.intended;
    // Validate the durable copies again before recovery; a corrupt journal is not write authority.
    for (const files of [from, target]) {
      let bytes = 0;
      if (!files.length || files.length > MAX_FILES || new Set(files.map((file) => file.path.toLowerCase())).size !== files.length) throw new Error("Skill backup is unavailable.");
      for (const file of files) {
        const length = new TextEncoder().encode(file.content).length; bytes += length;
        if (!safeSkillPath(file.path) || length > MAX_FILE_BYTES || bytes > MAX_BYTES || await skillHash(file.content) !== file.sha256) throw new Error("Skill backup is unavailable.");
      }
      if (!isLedgerSkill(files.find((file) => file.path === "SKILL.md")?.content ?? "")) throw new Error("Skill backup is unavailable.");
    }
    const allowed = [...new Set([...from, ...target].map((file) => file.path))];
    const initial = await snapshot(root, false);
    if (initial.some((file) => !allowed.includes(file.path))) throw new Error(CHANGED);
    // Even recovery never overwrites contents that match neither recorded copy.
    for (const path of allowed) {
      const actual = initial.find((file) => file.path === path);
      const before = from.find((file) => file.path === path);
      const after = target.find((file) => file.path === path);
      const created = recovery.created?.find((file) => file.path === path);
      const abandonedEmpty = restoring && created && actual?.content === "" && await created.handle.isSameEntry((await fileHandle(root, path)).handle);
      if (!abandonedEmpty && (actual ? actual.sha256 !== before?.sha256 && actual.sha256 !== after?.sha256 : before && after)) throw new Error(CHANGED);
    }
    for (const path of allowed) {
      const baseline = initial.find((file) => file.path === path);
      const latest = await readFile(root, path);
      if (latest?.sha256 !== baseline?.sha256 || latest?.mtime !== baseline?.mtime) throw new Error(CHANGED);
      const desired = target.find((file) => file.path === path);
      if (desired?.sha256 === latest?.sha256) continue;
      if (desired) {
        const { handle } = await fileHandle(root, path, true);
        if (!latest) {
          if ((await handle.getFile()).size !== 0) throw new Error(CHANGED);
          recovery.created = [...(recovery.created ?? []).filter((file) => file.path !== path), { path, handle }];
          await this.storage.set(RECOVERY + recovery.id, { ...recovery, state: "pending" });
        }
        // Copy the existing file into the swap file to retain native attributes.
        const writable = await handle.createWritable({ keepExistingData: true });
        try {
          const afterOpen = await readFile(root, path);
          if (latest && (afterOpen?.sha256 !== latest.sha256 || afterOpen.mtime !== latest.mtime)) throw new Error(CHANGED);
          if (!latest && afterOpen?.content !== "") throw new Error(CHANGED);
          await writable.write(desired.content);
          await writable.truncate(new TextEncoder().encode(desired.content).byteLength);
          await writable.close();
        } catch (error) { await writable.abort().catch(() => undefined); throw error; }
        if ((await readFile(root, path))?.sha256 !== desired.sha256) throw new Error("Skill files could not be verified. Review the saved backup before retrying.");
      } else if (latest) {
        const { directory, name } = await fileHandle(root, path);
        await directory.removeEntry(name);
      }
    }
    if (!same(await snapshot(root, false), target)) throw new Error("Skill files could not be verified. Review the saved backup before retrying.");
  }
}
export const skillRepository = new SkillRepository();
