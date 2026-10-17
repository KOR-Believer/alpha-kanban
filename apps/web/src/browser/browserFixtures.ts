import type { BrowserStorage } from "./storage";

export const ledger = `# Browser test

## Status

- 현재 진행률: \`0 / 2 tickets\`

## Ticket List

${["TEST-01", "TEST-02"].map((id) => `### ${id}. Test ticket

Status: READY
Progress: 25%
Repository:
- test
Priority: P1
Type: Feature
Depends on:
- 없음
목표:
- goal
현재 문제:
- problem
구현 범위:
- scope
제외 범위:
- none
완료 기준:
- [x] old evidence
검증:
- [x] old check
사용자 지시:
- 2026-10-01: old direction
진행 메모:
- 2026-10-01: old note

`).join("")}
## Extra

Keep this unknown section.
`;

export class MemoryStorage implements BrowserStorage {
  records = new Map<string, unknown>();
  failRecovery = false;
  failDelete = false;
  async get<T>(key: string) { return this.records.get(key) as T | undefined; }
  async set<T>(key: string, value: T) {
    if (this.failRecovery && key.startsWith("recovery:")) throw new Error("QuotaExceededError");
    this.records.set(key, value);
  }
  async delete(key: string) {
    if (this.failDelete) throw new Error("Storage unavailable");
    this.records.delete(key);
  }
  async entries<T>(prefix: string) {
    return [...this.records.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: value as T }));
  }
}

export function testLocks() {
  const pending = new Map<string, Promise<unknown>>();
  return async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    const previous = pending.get(name) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    pending.set(name, next);
    try { return await next; }
    finally { if (pending.get(name) === next) pending.delete(name); }
  };
}

let inode = 0;
class FakeEntry {
  id = ++inode;
  read: PermissionState = "granted";
  write: PermissionState = "granted";
  parent?: FakeDirectory;
  constructor(public name: string) {}
  async isSameEntry(other: FileSystemHandle) { return this.id === (other as unknown as FakeEntry).id; }
  async queryPermission(options?: FileSystemHandlePermissionDescriptor): Promise<PermissionState> {
    if (this.parent && await this.parent.queryPermission(options) !== "granted") return "denied";
    return options?.mode === "readwrite" ? this.write : this.read;
  }
  async requestPermission(options?: FileSystemHandlePermissionDescriptor) { return this.queryPermission(options); }
}
export class FakeFile extends FakeEntry {
  readonly kind = "file";
  content: string;
  mtime = 1;
  writes = 0;
  reads = 0;
  bodyReads = 0;
  opens = 0;
  failClose = false;
  failAfterClose = false;
  onOpen?: () => void;
  onClose?: () => void;
  constructor(name: string, content = ledger) { super(name); this.content = content; }
  handle() { return this as unknown as FileSystemFileHandle; }
  async getFile() {
    this.reads++;
    if (this.failAfterClose && this.writes) throw new DOMException("Removed", "NotFoundError");
    if (await this.queryPermission() !== "granted") throw new DOMException("Denied", "NotAllowedError");
    const file = new File([this.content], this.name, { lastModified: this.mtime, type: "text/markdown" });
    const arrayBuffer = file.arrayBuffer.bind(file);
    file.arrayBuffer = () => { this.bodyReads++; return arrayBuffer(); };
    return file;
  }
  async createWritable() {
    this.opens++; this.onOpen?.();
    let next = "";
    return {
      write: async (value: string) => { next = value; },
      close: async () => {
        if (this.failClose) throw new Error("Close failed");
        this.writes++; this.content = next; this.mtime++; this.onClose?.();
      },
      abort: async () => undefined,
    };
  }
}
export class FakeDirectory extends FakeEntry {
  readonly kind = "directory";
  children = new Map<string, FakeFile | FakeDirectory>();
  handle() { return this as unknown as FileSystemDirectoryHandle; }
  directory(name: string) {
    const directory = new FakeDirectory(name); directory.parent = this; this.children.set(name, directory); return directory;
  }
  file(name: string, content = ledger) {
    const file = new FakeFile(name, content); file.parent = this; this.children.set(name, file); return file;
  }
  async *values() {
    if (await this.queryPermission() !== "granted") throw new DOMException("Denied", "NotAllowedError");
    for (const child of this.children.values()) yield child.handle();
  }
  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    const entry = this.children.get(name);
    if (entry instanceof FakeDirectory) return entry.handle();
    if (!entry && options?.create) return this.directory(name).handle();
    throw new DOMException("Missing directory", "NotFoundError");
  }
  async getFileHandle(name: string) {
    const entry = this.children.get(name);
    if (entry instanceof FakeFile) return entry.handle();
    throw new DOMException("Missing file", "NotFoundError");
  }
  async resolve(target: FileSystemHandle): Promise<string[] | null> {
    if (await this.isSameEntry(target)) return [];
    for (const child of this.children.values()) {
      if (await child.isSameEntry(target)) return [child.name];
      if (child instanceof FakeDirectory) {
        const relative = await child.resolve(target);
        if (relative) return [child.name, ...relative];
      }
    }
    return null;
  }
}
