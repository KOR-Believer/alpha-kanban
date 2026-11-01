import { i18n, t } from "./index";

const errorMessages: Record<string, string> = {
  FILE_NOT_FOUND: "The file could not be found.",
  STALE_FILE: "The document changed externally. Reload before saving.", NEEDS_REPAIR: "The ticket format needs repair. Check the document.",
  TICKET_NOT_FOUND: "The ticket could not be found.",
  UNSUPPORTED_FORMAT: "This document format is not supported. View the Markdown and use a tool that supports its format to edit it.",
  INVALID_FORMAT: "The document format needs repair. View the Markdown and correct the format before editing tickets.",
  DUPLICATE_DOCUMENT_ID: "The document ID is shared by multiple files. Resolve the duplicate IDs before editing.",
};

export function errorSummary(error: Error): string {
  if ("code" in error && typeof error.code === "string" && errorMessages[error.code]) return t(errorMessages[error.code]!);
  return i18n.exists(error.message) ? t(error.message) : t("The request could not be completed.");
}

export function errorDetails(error: Error): string {
  return "code" in error ? `${error.code}: ${error.message}` : error.message;
}
