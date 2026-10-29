import { execFileSync } from "node:child_process";
import { mkdir, writeFile, cp, rename, symlink, chmod } from "node:fs/promises";
import { resolve, dirname } from "node:path";

// Disposable fixtures only. No personal CODEX_HOME or installed skills are read.
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/playwright/skill-native-" + Date.now());
const source = "0d48dc929ae5d45f20f258f7036b219450fa491f";
const prefix = "skills/implementation-ledger/";
const folder = resolve(output, "installed-ledger");
const files = execFileSync("git", ["ls-tree", "-r", "--name-only", source, "--", prefix], { cwd: root, encoding: "utf8" }).trim().split("\n");
await mkdir(output, { recursive: true });
for (const file of files) {
  if (!file.startsWith(prefix) || file.includes("..")) throw new Error("Unexpected fixture path");
  const destination = resolve(folder, file.slice(prefix.length));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, execFileSync("git", ["show", `${source}:${file}`], { cwd: root }));
}
await mkdir(resolve(output, "empty"));
await cp(folder, resolve(output, "linked-ledger"), { recursive: true });
const outside = resolve(output, "outside-SKILL.md");
await rename(resolve(output, "linked-ledger/SKILL.md"), outside);
await symlink(outside, resolve(output, "linked-ledger/SKILL.md"));
const hidden = resolve(output, "isolated-home/.codex/skills/implementation-ledger");
await cp(folder, hidden, { recursive: true });
await chmod(resolve(hidden, "SKILL.md"), 0o750);
await chmod(resolve(hidden, "scripts/check-ledger.mjs"), 0o755);
if (process.platform === "darwin") {
  execFileSync("xattr", ["-w", "org.alpha-kanban.smoke", "preserve-on-update", resolve(hidden, "SKILL.md")]);
}
console.log(JSON.stringify({ output, folder, hidden, linked: resolve(output, "linked-ledger"), empty: resolve(output, "empty"), source }, null, 2));
