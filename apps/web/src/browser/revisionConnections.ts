import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { LocalLinkError } from "./linkPaths";
import { browserRepository, type Connection } from "./repository";

const prefix = "git-revision:v1:";
export const linkConnectionsQueryKey = ["saved-link-connections"] as const;
export const choiceKey = (scope: string, target: RevisionTarget) => prefix + encodeURIComponent(scope) + ":" + encodeURIComponent(target.repo ?? target.commit);
export const revisionProjectId = (scope: string) => scope.match(/^\/w\/([^/]+)\/?$/)?.[1];

export type RevisionConnection = {
  key: string;
  scope: string;
  projectName?: string;
  repository: string;
  folder: string;
  handle: FileSystemDirectoryHandle;
};

async function folderLabel(handle: FileSystemDirectoryHandle, roots: Connection[]) {
  let nearest: string[] | undefined;
  for (const root of roots) {
    try {
      const path = await root.handle.resolve(handle);
      if (path && (!nearest || path.length + 1 < nearest.length)) nearest = [root.name, ...path];
    } catch { /* The stored handle name remains available after permission loss. */ }
  }
  return nearest?.join("/") ?? handle.name;
}

export async function listRevisionConnections(): Promise<RevisionConnection[]> {
  const rows = await browserRepository.storage.entries<FileSystemDirectoryHandle>(prefix);
  if (!rows.length) return [];
  const [projects, connections] = await Promise.all([
    browserRepository.storage.entries<{ label: string; parent?: string }>("project:"), browserRepository.connections(),
  ]);
  const names = new Map(projects.map(({ key, value: { label, parent } }) =>
    [key.slice("project:".length), parent && parent !== label ? parent + "/" + label : label]));
  const roots = connections.filter(connection => connection.kind === "root");
  return Promise.all(rows.map(async ({ key, value: handle }) => {
    // Older builds already stored a directory handle here. The key identifies its source and target.
    const [scope, repository] = key.slice(prefix.length).split(":").map(decodeURIComponent) as [string, string];
    const projectId = revisionProjectId(scope);
    return { key, scope, projectName: projectId && (names.get(projectId) ?? projectId),
      repository, folder: await folderLabel(handle, roots), handle };
  }));
}

// A dialog may stay open while another tab selects a different clone.
export async function updateRevisionConnection(key: string, expected: FileSystemDirectoryHandle | undefined, next?: FileSystemDirectoryHandle, signal?: AbortSignal) {
  await navigator.locks.request("alpha-kanban:" + key, async () => {
    const current = await browserRepository.storage.get<FileSystemDirectoryHandle>(key);
    if (!current && !next) return;
    if (current && next && await current.isSameEntry(next)) return;
    if ((current || expected) && !(current && expected && await current.isSameEntry(expected))) {
      throw new LocalLinkError("changed", "This connection changed in another window. Open the link again.");
    }
    signal?.throwIfAborted();
    try {
      if (next) await browserRepository.storage.set(key, next);
      else if (current) await browserRepository.storage.delete(key);
    } catch { throw new LocalLinkError("storage", "The link connection could not be saved. Your previous connection is unchanged."); }
  });
}
