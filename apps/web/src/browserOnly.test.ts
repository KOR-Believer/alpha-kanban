import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("browser-only distribution", () => {
  it("uses the browser app for default commands and keeps existing aliases and origins", () => {
    const workspace = JSON.parse(read("package.json"));
    const web = JSON.parse(read("apps/web/package.json"));
    for (const [command, port] of [["dev", "5187"], ["preview", "4187"]]) {
      expect(workspace.scripts[command!]).toContain(`--filter @alpha-kanban/web ${command}`);
      expect(web.scripts[command!]).toContain(`--port ${port}`);
    }
    expect(web.scripts.build).toBe("vite build");
    expect(workspace.scripts.build).toContain("--filter @alpha-kanban/web build");
    for (const manifest of [workspace, web]) {
      for (const command of ["dev", "build", "preview"]) {
        expect(manifest.scripts[`${command}:browser`]).toBe(`pnpm ${command}`);
      }
      expect(JSON.stringify(manifest)).not.toMatch(/@alpha-kanban\/server|concurrently|@tiptap\//);
    }
    expect(existsSync(new URL("apps/server/package.json", root))).toBe(false);
    expect(read("tsconfig.json")).not.toContain("apps/server");
    const config = read("apps/web/vite.config.ts");
    expect(config).toContain('command === "build"');
    expect(config).toContain('outDir: "dist-browser"');
    expect(config).not.toMatch(/proxy:|VITE_STORAGE_MODE/);
  });

  it("has no API, SSE, storage-mode switch or embedded runner in shipped application source", () => {
    const sourceRoot = new URL("apps/web/src/", root);
    const sourcePaths = readdirSync(sourceRoot, { recursive: true }) as string[];
    for (const path of sourcePaths.filter((path) => /\.tsx?$/.test(path) && !path.includes(".test."))) {
      const source = readFileSync(new URL(path, sourceRoot), "utf8");
      expect(source, fileURLToPath(new URL(path, sourceRoot))).not.toMatch(/\/api\/|\bEventSource\b|\brequestJson\b|\bIS_BROWSER_LOCAL\b|\bENABLE_EMBEDDED_AI\b|@tiptap\//);
    }
    expect(read("packages/shared/src/index.ts")).not.toMatch(/codexRun|codexChat|healthResponse|alphaKanbanState/);
  });
});
