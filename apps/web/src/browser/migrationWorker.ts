import { prepareDocumentMigration, previewDocumentMigrations } from "@alpha-kanban/shared/documentMigration";
import type { MigrationAnalysisRequest, MigrationAnalysisResponse } from "./migrationAnalysis";

self.onmessage = (event: MessageEvent<MigrationAnalysisRequest>) => {
  const { id, operation, input } = event.data;
  let response: MigrationAnalysisResponse;
  try {
    response = { id, result: operation === "prepare" ? prepareDocumentMigration(input) : previewDocumentMigrations(input) };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    response = { id, error: { message: error.message, name: error.name, ...("code" in error ? { code: String(error.code) } : {}) } };
  }
  self.postMessage(response);
};
