import { i18n, t } from "./index";

const errorMessages: Record<string, string> = {
  BAD_REQUEST: "Check the entered values.", INTERNAL_ERROR: "The server encountered an error.", HTTP_ERROR: "The request could not be completed.",
  FILE_NOT_FOUND: "The file could not be found.", FORBIDDEN_PATH: "This path is not allowed. Check the project roots.",
  STALE_FILE: "The document changed externally. Reload before saving.", NEEDS_REPAIR: "The ticket format needs repair. Check the document.",
  TICKET_NOT_FOUND: "The ticket could not be found.", WORKSPACE_ALREADY_EXISTS: "A folder with this project name already exists.",
  WORKSPACE_CREATE_FAILED: "Could not create the project.", WORKSPACE_NOT_FOUND: "The project could not be found.",
  WORKSPACE_OUTSIDE_ALLOWLIST: "This path is not allowed. Check the project roots.", WORKSPACE_ROOT_INVALID: "The project root is invalid or inaccessible.",
  WORKSPACE_UNAVAILABLE: "The project is unavailable. Check its folder and permissions.",
  CODEX_CHAT_MESSAGE_NOT_FOUND: "The chat message could not be found.", CODEX_DOCUMENT_RUN_ACTIVE: "A run is already active for this document.",
  CODEX_RUN_NOT_FOUND: "The run could not be found.", CODEX_RUN_NOT_RUNNING: "This run is no longer active.", CODEX_SCOPE_NOT_ALLOWED: "This scope is not allowed for the selected mode.",
};

export function errorSummary(error: Error): string {
  if ("code" in error && typeof error.code === "string" && errorMessages[error.code]) return t(errorMessages[error.code]!);
  if (/failed to fetch|fetch failed|networkerror|network request failed/i.test(error.message)) return t("Cannot connect to the server. Check that it is running.");
  return i18n.exists(error.message) ? t(error.message) : t("The request could not be completed.");
}

export function errorDetails(error: Error): string {
  return "code" in error ? `${error.code}: ${error.message}` : error.message;
}
