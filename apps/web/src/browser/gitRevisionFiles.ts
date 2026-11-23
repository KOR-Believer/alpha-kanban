import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import libraryUrl from "../../node_modules/isomorphic-git/index.umd.min.js?url";
import type { RepoCandidate } from "./gitDiscovery";

export const gitDirectoryUnavailable = "Choose a checkout with accessible Git objects, such as the main repository.";
const mime: Record<string, string> = { png: "image/png", gif: "image/gif", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", avif: "image/avif", md: "text/markdown", markdown: "text/markdown" };

export function readHistoricalFile(repo: RepoCandidate, target: RevisionTarget, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  if (!repo.gitDirectory) return Promise.reject(new Error(gitDirectoryUnavailable));
  const directory = repo.gitDirectory;
  // Pack buffers belong to one short-lived worker at a time across this origin.
  return navigator.locks.request("alpha-kanban:git-object-read", { signal }, () => read(directory, target, signal));
}

function read(directory: FileSystemDirectoryHandle, target: RevisionTarget, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./gitRevision.worker.ts", import.meta.url), { type: "module", name: "alpha-kanban-git-reader" });
    const timeout = window.setTimeout(() => fail(new Error("Reading this Git object took too long.")), 20000);
    function finish() { clearTimeout(timeout); worker.terminate(); signal.removeEventListener("abort", abort); }
    function fail(error: unknown) { finish(); reject(error); }
    function abort() { fail(new DOMException("Cancelled", "AbortError")); }
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{buffer?: ArrayBuffer; error?: string}>) => {
      if (!data.buffer) return fail(new Error(data.error || "The Git objects could not be read."));
      finish();
      const name = target.path.split("/").at(-1)!;
      resolve(new File([data.buffer], name, { type: mime[name.split(".").at(-1)!.toLowerCase()] ?? "" }));
    };
    worker.onerror = () => fail(new Error("The Git objects could not be read."));
    try { worker.postMessage({ directory, target, library: new URL(libraryUrl, location.origin).href }); }
    catch (error) { fail(error); }
  });
}
