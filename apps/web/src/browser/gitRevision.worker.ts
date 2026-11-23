import { Buffer } from "buffer/index.js";
import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { objectFileSystem, readRevisionObject, COMMIT_MISSING, FILE_MISSING, GIT_READ_LIMIT, isCitedFileLimit, GIT_UNREADABLE } from "./gitRevisionObject";

type Message = { directory: FileSystemDirectoryHandle; target: RevisionTarget; library: string };
// isomorphic-git uses Node-compatible byte operations even in its browser build.
Object.assign(self, { Buffer });
self.onmessage = async ({ data }: MessageEvent<Message>) => {
  try {
    // The main thread supplies the build-owned, same-origin distribution URL.
    await import(/* @vite-ignore */ data.library);
    const git = (self as unknown as { git: typeof import("isomorphic-git") }).git;
    const blob = await readRevisionObject(git, objectFileSystem(data.directory), data.target);
    const buffer = new Uint8Array(blob).buffer;
    self.postMessage({ buffer }, { transfer: [buffer] });
  } catch (failure) {
    const error = failure instanceof Error ? failure : undefined;
    const known = [COMMIT_MISSING, FILE_MISSING, GIT_READ_LIMIT, "This Git object format is not supported by the browser."];
    const message = error?.name === "NotAllowedError" ? "Allow read access to the Git repository."
      : error && (isCitedFileLimit(error.message) || known.includes(error.message)) ? error.message : GIT_UNREADABLE;
    self.postMessage({ error: message });
  }
};
