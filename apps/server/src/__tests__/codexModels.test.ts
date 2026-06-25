import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { listCodexModels, parseCodexModelCatalog } from "../codexModels";

describe("codexModels", () => {
  let tempRoot: string | undefined;
  let originalFallbacks: string | undefined;
  let originalPath: string | undefined;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
      tempRoot = undefined;
    }
    if (originalFallbacks === undefined) {
      delete process.env.ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS;
    } else {
      process.env.ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS = originalFallbacks;
      originalFallbacks = undefined;
    }
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
      originalPath = undefined;
    }
  });

  it("normalizes the Codex CLI model catalog without leaking large instruction fields", () => {
    const models = parseCodexModelCatalog(
      JSON.stringify({
        models: [
          {
            slug: "gpt-5.5",
            display_name: "GPT-5.5",
            base_instructions: "large bundled instructions",
            default_reasoning_level: "high",
            supported_reasoning_levels: [
              { effort: "low", description: "fast checks" },
              { effort: "xhigh" },
            ],
            additional_speed_tiers: ["fast"],
            service_tiers: [{ id: "priority", name: "Fast" }],
            visibility: "default",
            supported_in_api: true,
          },
        ],
      }),
    );

    expect(models).toEqual([
      {
        slug: "gpt-5.5",
        displayName: "GPT-5.5",
        description: undefined,
        defaultReasoning: "high",
        supportedReasoning: [
          { effort: "low", description: "fast checks" },
          { effort: "xhigh", description: undefined },
        ],
        additionalSpeedTiers: ["fast"],
        supportsFast: true,
        serviceTiers: [{ id: "priority", name: "Fast", description: undefined }],
        visibility: "default",
        supportedInApi: true,
      },
    ]);
    expect(models[0]).not.toHaveProperty("base_instructions");
  });

  it("falls back to the bundled catalog when the live catalog command fails", async () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-codex-models-"));
    const fakeCodex = path.join(tempRoot, "fake-codex.mjs");
    writeFileSync(
      fakeCodex,
      [
        "#!/usr/bin/env node",
        "const argv = process.argv.slice(2);",
        "if (argv[0] === 'debug' && argv[1] === 'models' && !argv.includes('--bundled')) {",
        "  process.exit(7);",
        "}",
        "console.log(JSON.stringify({ models: [{ slug: 'gpt-5.4-mini', display_name: 'GPT-5.4 mini', supported_reasoning_levels: [], additional_speed_tiers: [], service_tiers: [] }] }));",
      ].join("\n"),
    );
    chmodSync(fakeCodex, 0o755);

    const response = await listCodexModels(fakeCodex);

    expect(response.source).toBe("bundled");
    expect(response.models).toHaveLength(1);
    expect(response.models[0]).toMatchObject({
      slug: "gpt-5.4-mini",
      supportsFast: false,
    });
  });

  it("uses configured fallback commands when codex is not usable from PATH", async () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-codex-models-"));
    originalFallbacks = process.env.ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS;
    originalPath = process.env.PATH;

    const failingCodex = path.join(tempRoot, "codex");
    writeFileSync(
      failingCodex,
      [
        "#!/usr/bin/env node",
        "console.error('path codex is not usable');",
        "process.exit(127);",
      ].join("\n"),
    );
    chmodSync(failingCodex, 0o755);

    const fallbackCodex = path.join(tempRoot, "fallback-codex.mjs");
    writeFileSync(
      fallbackCodex,
      [
        "#!/usr/bin/env node",
        "console.log(JSON.stringify({ models: [{ slug: 'gpt-5.5', display_name: 'GPT-5.5', supported_reasoning_levels: [], additional_speed_tiers: ['fast'], service_tiers: [] }] }));",
      ].join("\n"),
    );
    chmodSync(fallbackCodex, 0o755);

    process.env.PATH = [tempRoot, originalPath].filter(Boolean).join(path.delimiter);
    process.env.ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS = fallbackCodex;

    const response = await listCodexModels("codex");

    expect(response.source).toBe("live");
    expect(response.models).toHaveLength(1);
    expect(response.models[0]).toMatchObject({
      slug: "gpt-5.5",
      supportsFast: true,
    });
  });
});
