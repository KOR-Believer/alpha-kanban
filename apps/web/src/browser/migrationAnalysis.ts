import { prepareDocumentMigration, previewDocumentMigrations, type MigrationInput, type MigrationPreparation, type MigrationPreview } from "@alpha-kanban/shared/documentMigration";

export type MigrationAnalysisRequest = { id: number; operation: "prepare" | "preview"; input: MigrationInput };
export type MigrationAnalysisResponse = { id: number; result?: MigrationPreparation | MigrationPreview; error?: { message: string; name: string; code?: string } };

/** One worker per operation, disposed on success, failure, cancellation or unmount. */
export function createMigrationAnalysis(signal?: AbortSignal) {
  let worker: Worker | undefined;
  let sequence = 0, stopped: Error | undefined;
  const pending = new Map<number, { resolve: (value: MigrationPreparation | MigrationPreview) => void; reject: (error: Error) => void }>();
  const dispose = (error: Error = new DOMException("Aborted", "AbortError")) => {
    stopped ??= error;
    signal?.removeEventListener("abort", abort);
    worker?.terminate();
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  const abort = () => dispose();
  signal?.addEventListener("abort", abort, { once: true });
  const run = async (operation: MigrationAnalysisRequest["operation"], input: MigrationInput) => {
    signal?.throwIfAborted();
    if (stopped) throw stopped;
    // The same pure engine also serves Node-based adapter tests. Supported browsers
    // use the worker; a failed worker must surface an error, not block the UI silently.
    if (typeof Worker === "undefined") {
      return operation === "prepare" ? prepareDocumentMigration(input) : previewDocumentMigrations(input);
    }
    if (!worker) {
      worker = new Worker(new URL("./migrationWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<MigrationAnalysisResponse>) => {
        const { id, result, error } = event.data, task = pending.get(id);
        if (!task) return;
        pending.delete(id);
        if (error) task.reject(Object.assign(new Error(error.message), { name: error.name, code: error.code }));
        else if (result) task.resolve(result);
        else task.reject(new Error("Document analysis could not finish. Try the preview again."));
      };
      worker.onerror = (event) => { event.preventDefault(); dispose(new Error("Document analysis could not finish. Try the preview again.")); };
      worker.onmessageerror = () => dispose(new Error("Document analysis could not finish. Try the preview again."));
    }
    const id = ++sequence;
    return new Promise<MigrationPreparation | MigrationPreview>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { worker!.postMessage({ id, operation, input } satisfies MigrationAnalysisRequest); }
      catch (error) { pending.delete(id); reject(error); }
    });
  };
  return {
    prepare: (input: MigrationInput) => run("prepare", input) as Promise<MigrationPreparation>,
    preview: (input: MigrationInput) => run("preview", input) as Promise<MigrationPreview>,
    dispose,
  };
}
