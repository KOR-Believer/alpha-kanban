import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("installs only into a fresh isolated home and reports the real path without claiming discovery", () => {
  const home = realpathSync(mkdtempSync(resolve(tmpdir(), "alpha-kanban-skill-install-")));
  const target = resolve(home, "skills/implementation-ledger");
  const script = resolve(import.meta.dirname, "../../../../scripts/install-implementation-ledger-skill.mjs");
  try {
    const output = execFileSync(process.execPath, [script, "--target", target], { encoding: "utf8" });
    expect(output).toContain(target);
    expect(output).toContain("recognition has not been checked");
    expect(output).toContain("https://kanban.giveit2.me/intro#updates");
    expect(readdirSync(target)).toEqual(expect.arrayContaining(["SKILL.md", "references", "assets", "scripts", "agents"]));
    const source = readFileSync(resolve(target, "SKILL.md"), "utf8");
    writeFileSync(resolve(target, "SKILL.md"), source + "\nPersonal rule\n");
    expect(() => execFileSync(process.execPath, [script, "--target", target], { stdio: "pipe" })).toThrow();
    expect(readFileSync(resolve(target, "SKILL.md"), "utf8")).toBe(source + "\nPersonal rule\n");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
