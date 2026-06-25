import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  CodexModelCatalogItem,
  CodexModelsResponse,
  CodexReasoningLevel,
  CodexServiceTier,
} from "@alpha-kanban/shared";

import { formatCodexCommandError, resolveCodexCommandCandidates } from "./codexCommand";

const execFileAsync = promisify(execFile);

export async function listCodexModels(codexCommand: string): Promise<CodexModelsResponse> {
  const attempts: string[] = [];
  const commandCandidates = await resolveCodexCommandCandidates(codexCommand);

  for (const command of commandCandidates) {
    const liveResult = await readCodexModelCatalog(command, [], attempts);
    if (liveResult) {
      return {
        models: liveResult,
        source: "live",
        generatedAt: new Date().toISOString(),
      };
    }

    const bundledResult = await readCodexModelCatalog(command, ["--bundled"], attempts);
    if (bundledResult) {
      return {
        models: bundledResult,
        source: "bundled",
        generatedAt: new Date().toISOString(),
      };
    }
  }

  const lastAttempt = attempts.at(-1);
  throw new Error(
    [
      "Could not read Codex model catalog from CLI.",
      lastAttempt ? `Last attempt: ${lastAttempt}` : undefined,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

async function readCodexModelCatalog(
  codexCommand: string,
  extraArgs: string[],
  attempts: string[],
): Promise<CodexModelCatalogItem[] | undefined> {
  const args = ["debug", "models", ...extraArgs];
  try {
    const { stdout } = await execFileAsync(
      codexCommand,
      args,
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return parseCodexModelCatalog(stdout);
  } catch (error) {
    attempts.push(`${codexCommand} ${args.join(" ")}: ${formatCodexCommandError(error)}`);
    return undefined;
  }
}

export function parseCodexModelCatalog(rawJson: string): CodexModelCatalogItem[] {
  const parsed = JSON.parse(rawJson) as unknown;
  const models = isRecord(parsed) && Array.isArray(parsed.models) ? parsed.models : [];

  return models.flatMap((model): CodexModelCatalogItem[] => {
    if (!isRecord(model)) {
      return [];
    }

    const slug = asString(model.slug);
    if (!slug) {
      return [];
    }

    const displayName = asString(model.display_name) ?? slug;
    const additionalSpeedTiers = asStringArray(model.additional_speed_tiers);
    const serviceTiers = normalizeServiceTiers(model.service_tiers);

    return [
      {
        slug,
        displayName,
        description: asString(model.description),
        defaultReasoning: asString(model.default_reasoning_level),
        supportedReasoning: normalizeReasoningLevels(model.supported_reasoning_levels),
        additionalSpeedTiers,
        supportsFast:
          additionalSpeedTiers.includes("fast") ||
          serviceTiers.some((tier) => tier.id === "priority" || tier.name.toLowerCase() === "fast"),
        serviceTiers,
        visibility: asString(model.visibility),
        supportedInApi:
          typeof model.supported_in_api === "boolean" ? model.supported_in_api : undefined,
      },
    ];
  });
}

function normalizeReasoningLevels(value: unknown): CodexReasoningLevel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): CodexReasoningLevel[] => {
    if (!isRecord(item)) {
      return [];
    }
    const effort = asString(item.effort);
    if (!effort) {
      return [];
    }
    return [{ effort, description: asString(item.description) }];
  });
}

function normalizeServiceTiers(value: unknown): CodexServiceTier[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): CodexServiceTier[] => {
    if (!isRecord(item)) {
      return [];
    }
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) {
      return [];
    }
    return [{ id, name, description: asString(item.description) }];
  });
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
