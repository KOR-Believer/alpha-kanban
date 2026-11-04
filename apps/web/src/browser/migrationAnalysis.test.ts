import { afterEach, describe, expect, it, vi } from "vitest";
import { createMigrationAnalysis, type MigrationAnalysisRequest } from "./migrationAnalysis";
import { prepareDocumentMigration, previewDocumentMigrations, type MigrationInput } from "@alpha-kanban/shared/documentMigration";

const input: MigrationInput = { root: "/project", documents: [{ path: "docs/test_plan.md", markdown: "# Test\n\n## Goal\nKeep\n", writable: true }], targets: [{ path: "docs/test_plan.md", assignId: true }] };
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { preventDefault: () => void }) => void;
  onmessageerror?: () => void;
  messages: MigrationAnalysisRequest[] = [];
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  postMessage(message: MigrationAnalysisRequest) { this.messages.push(message); }
  reply() { const message = this.messages.at(-1)!; this.onmessage?.({ data: { id: message.id, result: message.operation === "prepare" ? prepareDocumentMigration(message.input) : previewDocumentMigrations(message.input) } }); }
}
afterEach(() => { vi.unstubAllGlobals(); TestWorker.instances = []; });
describe("isolated migration analysis", () => {
  it("uses one worker for both stages and disposes it", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const analysis = createMigrationAnalysis(), first = analysis.prepare(input), worker = TestWorker.instances[0]!;
    worker.reply(); const prepared = await first;
    const secondInput = { ...input, generatedIds: prepared.preview.generatedIds }, second = analysis.preview(secondInput);
    worker.reply(); expect(await second).toEqual(previewDocumentMigrations(secondInput));
    expect(TestWorker.instances).toHaveLength(1); analysis.dispose(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates a pending worker on cancel and ignores late results", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const controller = new AbortController(), analysis = createMigrationAnalysis(controller.signal);
    const pending = expect(analysis.prepare(input)).rejects.toMatchObject({ name: "AbortError" });
    const worker = TestWorker.instances[0]!; controller.abort(); worker.reply(); await pending;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(analysis.preview(input)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("surfaces worker load errors and permits a fresh explicit attempt", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const first = createMigrationAnalysis(), failed = expect(first.prepare(input)).rejects.toThrow("Document analysis could not finish");
    TestWorker.instances[0]!.onerror?.({ preventDefault() {} }); await failed;
    await expect(first.preview(input)).rejects.toThrow("Document analysis could not finish");
    const second = createMigrationAnalysis(), pending = second.prepare(input);
    TestWorker.instances[1]!.reply(); expect((await pending).preview.decision).toBe("ready"); second.dispose();
  });
  it("does not create a worker for an already cancelled operation", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const controller = new AbortController(); controller.abort();
    const analysis = createMigrationAnalysis(controller.signal);
    await expect(analysis.prepare(input)).rejects.toMatchObject({ name: "AbortError" });
    analysis.dispose(); expect(TestWorker.instances).toHaveLength(0);
  });
});
