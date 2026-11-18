import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeSmokeScratch } from "../lib/smoke-artifacts.mjs";

test("scratch cleanup preserves evidence, respects keep and refuses escapes/symlinks", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ak-artifacts-")));
  try {
    const run = join(root, "run");
    await mkdir(join(run, "build"), { recursive: true });
    await writeFile(join(run, "report.json"), "evidence");
    await writeFile(join(run, "build", "asset"), "generated");
    await mkdir(join(root, "dependencies"));
    await writeFile(join(root, "dependencies", "keep"), "shared");
    await symlink(join(root, "dependencies"), join(run, "build", "node_modules"));
    await removeSmokeScratch(run, ["build"], { root, keep: true });
    await access(join(run, "build", "asset"));
    await assert.rejects(removeSmokeScratch(run, ["build", "../outside"], { root, keep: false }));
    await access(join(run, "build", "asset"));
    await symlink(join(run, "build"), join(run, "alias"));
    await assert.rejects(removeSmokeScratch(run, ["alias"], { root, keep: false }));
    await assert.rejects(removeSmokeScratch(root, ["run"], { root, keep: false }));
    await removeSmokeScratch(run, ["build"], { root, keep: false });
    await assert.rejects(access(join(run, "build")), { code: "ENOENT" });
    assert.equal(await readFile(join(run, "report.json"), "utf8"), "evidence");
    assert.equal(await readFile(join(root, "dependencies", "keep"), "utf8"), "shared");
  } finally { await rm(root, { recursive: true, force: true }); }
});
