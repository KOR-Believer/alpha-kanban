import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CODEX_APP_COMMAND = "/Applications/Codex.app/Contents/Resources/codex";
const CODEX_COMMAND_FALLBACKS_ENV = "ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS";

export async function resolveCodexCommandCandidates(codexCommand: string): Promise<string[]> {
  const candidates = [codexCommand];

  if (codexCommand === "codex") {
    candidates.push(...configuredFallbackCommands());

    const shellResolvedCodex = await resolveCommandFromLoginShell(codexCommand);
    if (shellResolvedCodex) {
      candidates.push(shellResolvedCodex);
    }

    if (existsSync(CODEX_APP_COMMAND)) {
      candidates.push(CODEX_APP_COMMAND);
    }
  }

  return [...new Set(candidates)];
}

export async function resolveCodexCommand(codexCommand: string): Promise<string> {
  if (codexCommand !== "codex") {
    return codexCommand;
  }

  const candidates = await resolveCodexCommandCandidates(codexCommand);
  for (const candidate of candidates) {
    if (await canStartCodexCommand(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? codexCommand;
}

export function formatCodexCommandError(error: unknown): string {
  if (!isRecord(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const message =
    error instanceof Error ? error.message : asString(error.message) ?? "unknown error";
  const stderr = asString(error.stderr)?.trim();
  return stderr ? `${message}; stderr: ${stderr.slice(0, 300)}` : message;
}

function configuredFallbackCommands(): string[] {
  return (process.env[CODEX_COMMAND_FALLBACKS_ENV] ?? "")
    .split(path.delimiter)
    .map((command) => command.trim())
    .filter(Boolean);
}

async function resolveCommandFromLoginShell(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "/bin/zsh",
      ["-lc", `command -v ${shellQuote(command)}`],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    const resolved = stdout.trim().split(/\r?\n/)[0]?.trim();
    return resolved && path.isAbsolute(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

async function canStartCodexCommand(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
