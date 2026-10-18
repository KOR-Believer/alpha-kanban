import path from "node:path";

// Shared across service instances in this API process, not a cross-process lock.
const pending = new Map<string, Promise<unknown>>();

export function withPathLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pending.set(key, next);
  const cleanup = () => { if (pending.get(key) === next) pending.delete(key); };
  void next.then(cleanup, cleanup);
  return next;
}
