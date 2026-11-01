import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEDGER_CONTRACT } from "../../skills/implementation-ledger/scripts/lib/ledger-contract.mjs";
import { validateBundle } from "../../apps/web/src/skills/bundle.ts";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const skillSource = path.join(repoRoot, "skills/implementation-ledger");
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function collectSkill(directory = skillSource) {
  const files = [];
  async function walk(current, prefix = "") {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), name + "/");
      else if (entry.isFile()) {
        const bytes = await readFile(path.join(current, entry.name));
        const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        files.push({ path: name, content, sha256: sha256(bytes) });
      } else throw new Error("Skill distributions contain only regular files: " + name);
    }
  }
  await walk(directory); return files;
}
export async function createSkillDistribution() {
  const files = await collectSkill();
  const skillText = files.find((file) => file.path === "SKILL.md")?.content;
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skillText ?? "")?.[1];
  if (!header) throw new Error("Missing skill front matter.");
  for (const [key, value] of Object.entries({ version: LEDGER_CONTRACT.skillRevision, "read-formats": LEDGER_CONTRACT.readFormats.join(","), "write-formats": LEDGER_CONTRACT.writeFormats.join(","), "new-document-format": LEDGER_CONTRACT.newDocumentFormat, "update-url": LEDGER_CONTRACT.updateUrl })) {
    const matches = header.split(/\r?\n/).filter((line) => line.trimStart().startsWith(`${key}:`));
    if (matches.length !== 1 || matches[0] !== `  ${key}: "${value}"`) throw new Error("Skill contract metadata mismatch: " + key);
  }
  for (const required of ["SKILL.md", "agents/openai.yaml", "references/ledger-format.md", "references/document-context.md", "references/compatibility.md", "references/document-operations.md", "assets/tickets-template.md", "assets/plan-template.md", "assets/inventory-template.md", "scripts/check-ledger.mjs", "scripts/ticket-md.mjs", "scripts/document-context.mjs", "scripts/document-cli.mjs", "licenses/document-cli.txt", "scripts/lib/ledger-contract.mjs", "scripts/lib/ledger-format.mjs", "scripts/lib/document-header.mjs", "scripts/lib/document-metadata.mjs", "scripts/lib/document-context.mjs", "scripts/lib/document-owner.mjs", "scripts/lib/document-settings.mjs", "scripts/lib/context-error.mjs"]) {
    if (!files.some((file) => file.path === required)) throw new Error("Missing bundled skill file: " + required);
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const git = (...args) => execFileSync("git", ["-C", repoRoot, ...args], { env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("A complete source commit is required.");
  const source = { repository: "https://github.com/KOR-Believer/alpha-kanban", commit, kind: git("status", "--porcelain", "--untracked-files=normal") ? "worktree" : "commit" };
  const version = sha256(files.map((file) => "implementation-ledger/" + file.path + file.content).join("")).slice(0, 12);
  const bundle = { schema: 1, name: "implementation-ledger", version, files, known: JSON.parse(await readFile(path.join(repoRoot, "scripts/skill-releases.json"), "utf8")), source, ledger: LEDGER_CONTRACT };
  const payloadSha256 = sha256(JSON.stringify(bundle));
  await validateBundle(bundle, version, payloadSha256);
  return { bundle, payloadSha256 };
}
