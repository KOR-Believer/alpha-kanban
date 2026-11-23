import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { BrowserFileError, browserLinkMappings, browserRepository } from "./repository";
import { hasGitRemote, inspectRepo, type RepoCandidate, type RepoScan } from "./gitDiscovery";
import { choiceKey, revisionProjectId } from "./revisionConnections";
import { gitDirectoryUnavailable, readHistoricalFile } from "./gitRevisionFiles";
import { isCitedFileLimit } from "./gitRevisionObject";
import { readLinkedFile } from "./linkPaths";

export const repositoryMismatch = "This folder belongs to a different repository.";
export const repositoryPermission = "Allow read access to the Git repository.";
function matchingRepositories(scan: RepoScan, target: RevisionTarget) {
  const hint = target.repo;
  const confirmed = hint ? scan.repos.filter(repo => hasGitRemote(repo, hint)) : scan.repos;
  return { scan: { ...scan, repos: confirmed },
    automatic: scan.complete && confirmed.length === 1 ? confirmed[0]!.handle : undefined };
}

export async function revisionSelection(scope: string, target: RevisionTarget, signal: AbortSignal, options: {
  choose?: boolean; refresh?: boolean; onProgress?: (scan: RepoScan) => void;
} = {}): Promise<{ handle?: FileSystemDirectoryHandle; saved?: FileSystemDirectoryHandle; scan?: RepoScan }> {
  const saved = await browserRepository.storage.get<FileSystemDirectoryHandle>(choiceKey(scope, target));
  signal.throwIfAborted();
  if (saved && !options.choose) return { handle: saved, saved };
  const projectId = revisionProjectId(scope);
  let sourceRootId: string | undefined;
  if (projectId && browserLinkMappings.autoDiscover) {
    try { sourceRootId = (await browserRepository.projectConnection(projectId)).id; }
    catch (error) {
      if (!(error instanceof BrowserFileError && error.code === "RECONNECT_REQUIRED")) throw error;
    }
  }
  signal.throwIfAborted();
  const result = await browserLinkMappings.scan({ signal, refresh: options.refresh, continuous: true,
    revision: { sourceRootId, preferredRemote: options.choose ? undefined : target.repo },
    onProgress: scan => options.onProgress?.(matchingRepositories(scan, target).scan) });
  signal.throwIfAborted();
  const { scan, automatic } = matchingRepositories(result, target);
  return { handle: options.choose ? undefined : automatic, saved, scan };
}

export async function verifiedRevisionRepo(handle: FileSystemDirectoryHandle, target: RevisionTarget, signal: AbortSignal) {
  if (await handle.queryPermission({ mode: "read" }) !== "granted") throw new Error(repositoryPermission);
  signal.throwIfAborted();
  let repo = await inspectRepo({ id: "chosen", name: handle.name, handle }, handle, "");
  if (!repo?.gitDirectory) {
    for (const connection of await browserRepository.connections()) {
      signal.throwIfAborted();
      if (await connection.handle.queryPermission({ mode: "read" }) !== "granted") continue;
      const parts = await connection.handle.resolve(handle);
      if (!parts?.length) continue;
      const wider = await inspectRepo(connection, handle, parts.join("/"), true);
      if (wider?.gitDirectory) { repo = wider; break; }
    }
  }
  if (!repo?.gitDirectory) throw new Error(gitDirectoryUnavailable);
  if (target.repo && repo.remotes.length && !hasGitRemote(repo, target.repo)) throw new Error(repositoryMismatch);
  return repo;
}

export async function revisionContents(repo: RepoCandidate, target: RevisionTarget, current: boolean, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!current) return readHistoricalFile(repo, target, signal);
  const { file } = await readLinkedFile(repo.handle, target.path);
  signal.throwIfAborted();
  return file;
}

export type OpenRevisionFile = { repo: RepoCandidate; file: File; markdown?: string; markdownError?: string };
export type RevisionReadResult = { document?: OpenRevisionFile; limitedFile?: { repo: RepoCandidate; message: string }; message?: string };

export async function readRevisionDocument(repo: RepoCandidate, target: RevisionTarget, current: boolean, signal: AbortSignal): Promise<OpenRevisionFile> {
  // A current-file link must also belong to the cited Git history.
  const cited = revisionContents(repo, target, false, signal);
  if (!current) return openFile(repo, await cited, signal);
  try { await cited; }
  catch (error) {
    if (!(error instanceof Error && isCitedFileLimit(error.message))) throw error;
  }
  return openFile(repo, await revisionContents(repo, target, true, signal), signal);
}

async function openFile(repo: RepoCandidate, file: File, signal: AbortSignal): Promise<OpenRevisionFile> {
  let markdown: string | undefined, markdownError: string | undefined;
  if (/\.(?:md|markdown)$/i.test(file.name)) {
    if (file.size > 10 * 1024 * 1024) markdownError = "This file is too large to preview. Download it to open with another app.";
    else try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { markdownError = "This file is not readable UTF-8 text. Download it to open with another app."; }
  }
  signal.throwIfAborted();
  return { repo, file, markdown, markdownError };
}
