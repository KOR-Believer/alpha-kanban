import type { MarkdownFileChangeEvent, MarkdownFileSummary } from "@alpha-kanban/shared";
import { BrowserFileError, browserRepository } from "./repository";

export function subscribeFileEvents(
  workspaceId: string,
  onChange: (event: MarkdownFileChangeEvent) => void,
  onUnavailable: () => void,
  selectedFile?: MarkdownFileSummary,
): () => void {
  if (!selectedFile) return () => undefined;
  let active = true;
  let running = false;
  let previous: MarkdownFileSummary | undefined = selectedFile;
  const poll = async () => {
    if (!active || running || document.visibilityState === "hidden") return;
    running = true;
    try {
      // Observe the open document independently of slow sidebar discovery.
      const { file } = await browserRepository.markdown(workspaceId, selectedFile.id);
      if (!active) return;
      if (previous?.hash !== file.hash || previous.mtimeMs !== file.mtimeMs) onChange({
        eventType: "changed", workspaceId, fileId: file.id, file, relativePath: file.relativePath,
        workspaceRelativePath: file.workspaceRelativePath, observedAt: new Date().toISOString(),
      });
      previous = file;
    } catch (error) {
      if (!active) return;
      if ((error instanceof BrowserFileError && error.code === "FILE_NOT_FOUND") ||
          (error instanceof Error && error.name === "NotFoundError")) {
        if (previous) onChange({
          eventType: "removed", workspaceId, fileId: previous.id, relativePath: previous.relativePath,
          workspaceRelativePath: previous.workspaceRelativePath, observedAt: new Date().toISOString(),
        });
        previous = undefined;
      } else onUnavailable();
    }
    finally { running = false; }
  };
  void poll();
  const interval = window.setInterval(() => void poll(), 15_000);
  const stop = browserRepository.subscribe(() => void poll());
  window.addEventListener("focus", poll);
  document.addEventListener("visibilitychange", poll);
  return () => {
    active = false; stop(); window.clearInterval(interval);
    window.removeEventListener("focus", poll);
    document.removeEventListener("visibilitychange", poll);
  };
}
