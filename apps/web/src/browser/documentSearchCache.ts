import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { matchesSearchEntry, type DocumentSearchEntry } from "../documentSearch";
import type { BrowserStorage } from "./storage";

/** Disposable, local display data. Never a source of file identity or write guards. */
export class DocumentSearchCache {
  private memory = new Map<string, DocumentSearchEntry>();
  private bytes = 0;
  private pending = new Map<string, Promise<void>>();
  constructor(private storage: BrowserStorage, private budget = 16 * 1024 * 1024) {}
  private key(id: string) { return "document-search:v1:" + id; }
  private size(entry: DocumentSearchEntry) { return (entry.text.length + entry.folded.length) * 2 + entry.tickets.length * 96; }
  clearMemory() { this.memory.clear(); this.bytes = 0; }
  private retain(entry: DocumentSearchEntry) {
    const old = this.memory.get(entry.id);
    if (old) { this.bytes -= this.size(old); this.memory.delete(entry.id); }
    const size = this.size(entry);
    if (size > this.budget) return;
    while (this.bytes + size > this.budget && this.memory.size) {
      const first = this.memory.values().next().value!;
      this.memory.delete(first.id); this.bytes -= this.size(first);
    }
    this.memory.set(entry.id, entry); this.bytes += size;
  }
  remember(entry: DocumentSearchEntry) {
    const old = this.memory.get(entry.id);
    if (old?.hash === entry.hash && old.path === entry.path && old.workspaceId === entry.workspaceId) return;
    this.retain(entry);
    // Serialize revisions of one document so an older async write cannot win.
    const write = (this.pending.get(entry.id) ?? Promise.resolve())
      .then(() => this.storage.set(this.key(entry.id), entry)).catch(() => undefined);
    this.pending.set(entry.id, write);
    void write.finally(() => { if (this.pending.get(entry.id) === write) this.pending.delete(entry.id); });
  }
  async get(file: MarkdownFileSummary): Promise<DocumentSearchEntry | undefined> {
    const cached = this.memory.get(file.id);
    if (matchesSearchEntry(cached, file)) { this.retain(cached); return cached; }
    await this.pending.get(file.id);
    try {
      const entry = await this.storage.get<DocumentSearchEntry>(this.key(file.id));
      if (matchesSearchEntry(entry, file)) { this.retain(entry); return entry; }
    } catch { /* The caller reports an incomplete search and offers preparation again. */ }
    return undefined;
  }
}
