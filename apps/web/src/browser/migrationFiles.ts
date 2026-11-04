import { hasCompleteMigrationHeader } from "@alpha-kanban/shared/documentMigration";

export const MIGRATION_READ_CONCURRENCY = 6;
const HEADER_CHUNK_BYTES = 4096;

/** No cached body or mtime assumptions. Grow through long front matter/headers. */
export async function readMigrationFile(file: File, full: boolean, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  if (full) {
    const bytes = await file.arrayBuffer();
    signal?.throwIfAborted();
    return decoder.decode(bytes);
  }
  let text = "";
  for (let offset = 0; offset < file.size; offset += HEADER_CHUNK_BYTES) {
    signal?.throwIfAborted();
    const end = Math.min(file.size, offset + HEADER_CHUNK_BYTES);
    text += decoder.decode(await file.slice(offset, end).arrayBuffer(), { stream: end < file.size });
    signal?.throwIfAborted();
    if (end === file.size) return text;
    // Never mistake a chunk boundary for the end of a field or front matter.
    const boundary = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r")) + 1;
    const completeLines = text.slice(0, boundary);
    if (hasCompleteMigrationHeader(completeLines)) return completeLines;
  }
  return text;
}

/** Bound file I/O and drain in-flight reads on failure; no orphaned rejections. */
export async function forEachMigrationFile<T>(items: AsyncIterable<T>, visit: (item: T) => Promise<void>, signal?: AbortSignal) {
  const active = new Set<Promise<void>>();
  let failure: unknown;
  try {
    for await (const item of items) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      const task = visit(item).catch((error) => { failure ??= error; }).finally(() => active.delete(task));
      active.add(task);
      if (active.size >= MIGRATION_READ_CONCURRENCY) await Promise.race(active);
    }
  } finally { await Promise.all(active); }
  if (failure) throw failure;
  signal?.throwIfAborted();
}
