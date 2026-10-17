import { spawn } from "node:child_process";

const mode = process.argv[2];
if (!["recovery", "retired"].includes(mode)) throw new Error("Expected recovery or retired.");
const child = spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build:browser"], {
  cwd: new URL("..", import.meta.url), stdio: "inherit", env: { ...process.env, AK_PWA_MODE: mode },
});
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
