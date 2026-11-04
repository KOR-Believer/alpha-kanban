import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build, createServer } from "../../apps/web/node_modules/vite/dist/node/index.js";
import { markdownWorkerPlugins } from "../../apps/web/worker.config.ts";
import { previewDocumentMigrations } from "../../packages/shared/src/documentMigration.mjs";

test("the development server also resolves the DOM-free decoder for worker dependencies", async () => {
  const root = fileURLToPath(new URL("../../apps/web/", import.meta.url));
  const cacheDir = await mkdtemp(resolve(tmpdir(), "ak-maintenance-dev-"));
  let server;
  try {
    server = await createServer({ root, cacheDir, configFile: resolve(root, "vite.config.ts"), logLevel: "silent", server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
    const decoder = await server.environments.client.pluginContainer.resolveId("decode-named-character-reference");
    const path = decoder?.id.split("?")[0];
    assert.ok(path?.endsWith("/decode-named-character-reference/index.js"));
    assert.doesNotMatch(await readFile(path, "utf8"), /document\./);
  } finally {
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("the bundled analysis worker starts without DOM and preserves entity/anchor cleanup", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const out = await mkdtemp(resolve(tmpdir(), "ak-maintenance-worker-"));
  try {
    await build({ configFile: false, root, logLevel: "silent", worker: { plugins: markdownWorkerPlugins },
      resolve: { alias: { "@alpha-kanban/shared/documentMigration": resolve(root, "packages/shared/src/documentMigration.mjs") } },
      build: { outDir: out, lib: { entry: resolve(root, "apps/web/src/browser/migrationAnalysis.ts"), formats: ["es"], fileName: "analysis" } },
    });
    const asset = (await readdir(resolve(out, "assets"))).find(name => /^migrationWorker-.*\.js$/.test(name));
    assert.ok(asset, "the worker is emitted as a separate build asset");
    const code = await readFile(resolve(out, "assets", asset), "utf8");
    const replies = [], self = { postMessage: message => replies.push(message) };
    runInNewContext(code, { self, crypto, URL, TextEncoder, TextDecoder }, { timeout: 5_000 });
    const path = "docs/01_probe_plan.md", markdown = "# A &amp; B\n\n## Progress Board\n\n| Ticket | Status | Progress | Repository | Depends on |\n| --- | --- | --- | --- | --- |\n| OLD-01 | TODO | 0% | demo | - |\n\n## A &amp; B\nKeep\n";
    const input = { root: "/project", documents: [{ path, markdown, writable: true }, { path: "README.md", markdown: "# Index\n[heading](docs/01_probe_plan.md#a--b)\n", writable: false }], targets: [{ path, assignId: true, cleanupLegacy: true }], generatedIds: { [path]: "11111111-1111-4111-8111-111111111111" }, relativeReferencesOnly: true };
    self.onmessage({ data: { id: 7, operation: "preview", input } });
    assert.deepEqual(JSON.parse(JSON.stringify(replies[0])), { id: 7, result: previewDocumentMigrations(input) });
  } finally { await rm(out, { recursive: true, force: true }); }
});
