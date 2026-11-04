import { DEFAULT_DOCUMENT_ROOT, parseSettings } from "@alpha-kanban/shared/documentSettings";
import type { Connection } from "./repository";

export type DocumentRootSetting = { value: string | null; source: string | null; error?: string };

async function readRoot(handle: FileSystemDirectoryHandle, source: string): Promise<DocumentRootSetting | undefined> {
  try {
    const file = await (await handle.getFileHandle(".ak.config")).getFile();
    if (file.size > 64 * 1024) throw new Error(".ak.config exceeds 64 KiB.");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    const setting = parseSettings(text, "config", source, "root");
    return setting.present ? { value: setting.value as string, source } : undefined;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") return undefined;
    return { value: null, source, error: error instanceof Error ? error.message : "Cannot read .ak.config." };
  }
}

/** Only explicitly granted project/workspace handles; no parent, home or user lookup. */
export async function resolveBrowserDocumentRoot(project: FileSystemDirectoryHandle, connections: Connection[]): Promise<DocumentRootSetting> {
  const own = await readRoot(project, "project/.ak.config");
  if (own) return own;
  for (const connection of connections) {
    if (connection.kind !== "root") continue;
    try {
      // Same folder identity regardless of whether this project was connected
      // directly or discovered as a workspace child. Names are never identities.
      const relative = await connection.handle.resolve(project);
      if (relative?.length !== 1) continue;
      const source = connection.id + "/.ak.config";
      if (await connection.handle.queryPermission({ mode: "read" }) !== "granted") return { value: null, source, error: "Workspace access is unavailable." };
      const inherited = await readRoot(connection.handle, source);
      if (inherited) return inherited;
    } catch { /* This handle cannot establish a containing workspace. */ }
  }
  return { value: DEFAULT_DOCUMENT_ROOT, source: null };
}

export function documentRootBranch(relative: string, root: string | null): boolean {
  return root !== null && (relative === root || root.startsWith(relative + "/"));
}
