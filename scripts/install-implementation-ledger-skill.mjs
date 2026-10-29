#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const skillName = "implementation-ledger";
const sourceDir = path.join(repoRoot, "skills", skillName);
const codexHome = process.env.CODEX_HOME
  ? path.resolve(process.env.CODEX_HOME)
  : path.join(os.homedir(), ".codex");
const targetDir = path.join(codexHome, "skills", skillName);
const legacyTargetDir = path.join(codexHome, "skills", "plan-ticketing");

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
      continue;
    }
    throw new Error("Cannot install non-regular skill entry: " + entry.name);
  }
}

async function main() {
  const skillFile = path.join(sourceDir, "SKILL.md");
  if (!(await pathExists(skillFile))) {
    throw new Error(`Could not find bundled ${skillName} skill at ${skillFile}`);
  }

  if (await pathExists(targetDir)) {
    throw new Error(`An installation already exists at ${targetDir}. Compare and back it up with your agent before replacing it. No files were changed.`);
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  // Prepare outside Codex's skills scan before making a new installation visible.
  const staging = await fs.mkdtemp(path.join(codexHome, ".ledger-install-"));
  try {
    await copyDirectory(sourceDir, staging);
    if (await pathExists(targetDir)) throw new Error("The target appeared during preparation. No existing installation was changed.");
    await fs.rename(staging, targetDir);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}\nPrepared files retained at ${staging}.`);
  }

  console.log(`Installed ${skillName} skill to ${targetDir}`);
  if (await pathExists(legacyTargetDir)) {
    console.log(`Legacy skill remains unchanged at ${legacyTargetDir}.`);
  }
  console.log("Restart Codex so the skill list refreshes.");
  console.log("File copy completed; Codex recognition has not been checked.");
  console.log("Installed directory (copy this text):\n" + targetDir);
  console.log("Optional: register this folder to compare and confirm updates in Alpha Kanban:\nhttps://kanban.giveit2.me/intro#updates");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
