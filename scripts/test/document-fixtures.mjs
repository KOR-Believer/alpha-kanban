import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createDocumentPlan } from "../lib/document-plan.mjs";

export function gitTest(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
  return execFileSync("git", ["-C", cwd, "-c", "user.name=Document Test", "-c", "user.email=document-test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
export async function put(file, content) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
export async function makeFixture(t) {
  const temporary = await mkdtemp(path.join(tmpdir(), "ak-document-"));
  const base = await realpath(temporary), root = path.join(base, "project"), home = path.join(base, "home");
  await mkdir(root); await mkdir(home);
  gitTest(root, "init", "-b", "main");
  await put(path.join(root, "README.md"), "# Project\n");
  gitTest(root, "add", "README.md"); gitTest(root, "commit", "-m", "fixture");
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, root, home, put: (relative, content) => put(path.join(root, relative), content),
    plan: (request) => createDocumentPlan(request, { cwd: root, home }) };
}
export async function reviewed(f, request) {
  const first = await f.plan(request);
  return f.plan({ ...request, acknowledgements: first.issues.filter((issue) => issue.severity === "review").map((issue) => issue.fingerprint) });
}
export const moveRequest = (from = "docs/a.md", to = "docs/nested/a.md") => ({ schema: 1, operation: "move", scope: ["docs"], moves: [{ from, to }] });
