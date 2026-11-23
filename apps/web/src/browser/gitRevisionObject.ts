import type { FsClient, PromiseFsClient, readBlob, readCommit, readTree } from "isomorphic-git";
import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";

type GitReader = { readBlob: typeof readBlob; readCommit: typeof readCommit; readTree: typeof readTree };
const MiB = 1024 * 1024;
export const GIT_READ_LIMIT = "This Git object exceeds the local reading limit.";
// These two errors are issued only after the commit and regular-file entry are verified.
export const GIT_BLOB_LIMIT = "The cited file is too large to preview.";
export const GIT_BLOB_STORE_LIMIT = "Reading the cited file exceeds the local Git object limit.";
export function isCitedFileLimit(message: string) {
  return message === GIT_BLOB_LIMIT || message === GIT_BLOB_STORE_LIMIT;
}
export const COMMIT_MISSING = "This repository does not contain the cited commit.";
export const FILE_MISSING = "This file is missing from the cited commit.";
export const GIT_UNREADABLE = "The Git objects could not be read.";
const MISSING = () => Object.assign(new Error("Missing Git object"), { code: "ENOENT" });

// Expose only loose objects and indexed packs. The Git library never gets a
// filesystem with write methods or access to refs, hooks, config, or the worktree.
export function objectFileSystem(root: FileSystemDirectoryHandle): PromiseFsClient {
  let total = 0;
  async function directory(parts: string[]) {
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return dir;
  }
  function translate(error: unknown): never {
    if (error instanceof Error && ["NotFoundError", "TypeMismatchError"].includes(error.name)) throw MISSING();
    throw error;
  }
  async function readFile(path: string) {
    if (typeof path !== "string" || !/^\/git\/objects\/(?:[a-f0-9]{2}\/[a-f0-9]{38}|pack\/pack-[a-f0-9]{40}\.(?:idx|pack))$/.test(path)) throw MISSING();
    const parts = path.slice(5).split("/");
    const name = parts.pop()!;
    try {
      const file = await (await (await directory(parts)).getFileHandle(name)).getFile();
      total += file.size;
      if (file.size > (name.endsWith(".pack") ? 128 : 16) * MiB || total > 192 * MiB) throw new Error(GIT_READ_LIMIT);
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) { return translate(error); }
  }
  async function readdir(path: string) {
    if (path !== "/git/objects/pack") throw MISSING();
    try {
      const names: string[] = [];
      for await (const name of (await directory(["objects", "pack"])).keys()) {
        if (/^pack-[0-9a-f]{40}\.idx$/.test(name)) names.push(name);
        if (names.length > 512) throw new Error(GIT_READ_LIMIT);
      }
      return names;
    } catch (error) { return translate(error); }
  }
  const denied = async () => { throw new Error("Read-only Git object store."); };
  return { promises: { readFile, readdir, stat: denied, lstat: denied, readlink: denied, mkdir: denied, rmdir: denied, writeFile: denied, unlink: denied, symlink: denied } };
}

export async function readRevisionObject(git: GitReader, fs: FsClient, target: RevisionTarget) {
  if (!/^[0-9a-f]{40}$/.test(target.commit)) throw new Error("This Git object format is not supported by the browser.");
  const parts = target.path.split("/");
  if (parts.length > 128 || parts.some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git" || /[\\\0]/.test(p))) throw new Error(FILE_MISSING);
  const options = { fs, gitdir: "/git", cache: {} };
  let tree: string;
  try {
    const { oid, commit } = await git.readCommit({ ...options, oid: target.commit });
    if (oid !== target.commit) throw new Error(COMMIT_MISSING);
    tree = commit.tree;
  } catch (e) {
    if ((e as { code?: string }).code === "NotFoundError") throw new Error(COMMIT_MISSING);
    throw e;
  }
  for (const [i, part] of parts.entries()) {
    const result = await git.readTree({ ...options, oid: tree });
    const entry = result.tree.find(e => e.path === part);
    if (!entry || (i === parts.length - 1 ? !["100644", "100755"].includes(entry.mode) : entry.type !== "tree")) throw new Error(FILE_MISSING);
    tree = entry.oid;
  }
  const { blob } = await git.readBlob({ ...options, oid: tree }).catch((error: unknown) => {
    if (error instanceof Error && error.message === GIT_READ_LIMIT) throw new Error(GIT_BLOB_STORE_LIMIT);
    throw error;
  });
  if (blob.byteLength > 10 * MiB) throw new Error(GIT_BLOB_LIMIT);
  return blob;
}
