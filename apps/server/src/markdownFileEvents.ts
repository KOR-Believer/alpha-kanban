import type {
  MarkdownFileChangeEvent,
  MarkdownFileSummary,
} from "@alpha-kanban/shared";

import type { MarkdownFileStore } from "./files";

type MarkdownFileChangeListener = (event: MarkdownFileChangeEvent) => void;

type FileSnapshot = Pick<
  MarkdownFileSummary,
  "absolutePath" | "hash" | "mtimeMs" | "workspaceRelativePath"
>;

type WatchEntry = {
  fileStore: MarkdownFileStore;
  isScanning: boolean;
  listeners: Set<MarkdownFileChangeListener>;
  snapshot: Map<string, FileSnapshot>;
  timer?: NodeJS.Timeout;
};

type MarkdownFileEventHubOptions = {
  pollIntervalMs?: number;
};

export class MarkdownFileEventHub {
  private readonly entries = new Map<string, WatchEntry>();
  private readonly pollIntervalMs: number;

  constructor(options: MarkdownFileEventHubOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 750;
  }

  async subscribe(
    fileStore: MarkdownFileStore,
    listener: MarkdownFileChangeListener,
  ): Promise<() => void> {
    const entry = await this.entryFor(fileStore);
    entry.listeners.add(listener);

    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        this.stop(fileStore.workspaceId);
      }
    };
  }

  private async entryFor(fileStore: MarkdownFileStore): Promise<WatchEntry> {
    const existing = this.entries.get(fileStore.workspaceId);
    if (existing) {
      return existing;
    }

    const entry: WatchEntry = {
      fileStore,
      isScanning: false,
      listeners: new Set(),
      snapshot: await this.snapshot(fileStore),
    };
    entry.timer = setInterval(() => {
      void this.scan(entry);
    }, this.pollIntervalMs);
    entry.timer.unref?.();
    this.entries.set(fileStore.workspaceId, entry);

    return entry;
  }

  private stop(workspaceId: string): void {
    const entry = this.entries.get(workspaceId);
    if (!entry) {
      return;
    }

    if (entry.timer) {
      clearInterval(entry.timer);
    }
    this.entries.delete(workspaceId);
  }

  private async scan(entry: WatchEntry): Promise<void> {
    if (entry.isScanning || entry.listeners.size === 0) {
      return;
    }

    entry.isScanning = true;
    try {
      const nextSnapshot = await this.snapshot(entry.fileStore);
      const events = await this.diff(entry.fileStore, entry.snapshot, nextSnapshot);
      entry.snapshot = nextSnapshot;

      for (const event of events) {
        for (const listener of entry.listeners) {
          listener(event);
        }
      }
    } catch {
      // Keep the SSE stream alive. A later poll can recover after transient filesystem errors.
    } finally {
      entry.isScanning = false;
    }
  }

  private async diff(
    fileStore: MarkdownFileStore,
    previous: Map<string, FileSnapshot>,
    next: Map<string, FileSnapshot>,
  ): Promise<MarkdownFileChangeEvent[]> {
    const events: MarkdownFileChangeEvent[] = [];

    for (const [fileId, nextFile] of next) {
      const previousFile = previous.get(fileId);
      if (
        previousFile &&
        previousFile.hash === nextFile.hash &&
        previousFile.mtimeMs === nextFile.mtimeMs
      ) {
        continue;
      }

      const event = await fileStore.describeFileChange(nextFile.absolutePath);
      if (event) {
        events.push(event);
      }
    }

    for (const [fileId, previousFile] of previous) {
      if (next.has(fileId)) {
        continue;
      }

      const event = await fileStore.describeFileChange(previousFile.absolutePath);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  private async snapshot(fileStore: MarkdownFileStore): Promise<Map<string, FileSnapshot>> {
    const files = await fileStore.listFiles();
    return new Map(
      files.map((file) => [
        file.id,
        {
          absolutePath: file.absolutePath,
          hash: file.hash,
          mtimeMs: file.mtimeMs,
          workspaceRelativePath: file.workspaceRelativePath,
        },
      ]),
    );
  }
}
