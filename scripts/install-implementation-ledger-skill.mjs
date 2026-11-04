#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { createSkillDistribution } from "./lib/skill-distribution.mjs";
import { installSkill, inspectInstallation } from "./lib/install-skill.mjs";

try {
  const { values, positionals } = parseArgs({ options: { target: { type: "string" }, inspect: { type: "boolean" } } });
  if (positionals.length || values.target === "") throw new Error("Use --target DIRECTORY and optional --inspect.");
  const codexDirectory = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  const target = path.resolve(values.target ?? path.join(codexDirectory, "skills/implementation-ledger"));
  const distribution = await createSkillDistribution();
  if (values.inspect) console.log(JSON.stringify(await inspectInstallation(target, distribution), null, 2));
  else {
    const result = await installSkill({ target, distribution });
    console.log("Installed implementation-ledger skill to " + result.target + "\nVerified bundle: " + result.version + "\nReceipt: " + result.receipt);
    console.log("Restart Codex so the skill list refreshes. File bytes were verified; Codex recognition has not been checked.");
    console.log("Optional: register this exact folder to compare and confirm updates:\nhttps://kanban.giveit2.me/about#updates");
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
