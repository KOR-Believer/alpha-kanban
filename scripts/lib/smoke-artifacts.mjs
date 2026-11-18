import { lstat, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const repositoryOutput = resolve(import.meta.dirname, "../../output");

// Call only after the owning server/browser has closed and evidence is saved.
// Never remove an entire run: reports, captures and fixtures remain available.
export async function removeSmokeScratch(output, names, { root = repositoryOutput, keep = process.env.AK_KEEP_SMOKE_ARTIFACTS === "1" } = {}) {
  if (keep) return;
  const base = resolve(root);
  const run = resolve(output);
  const inside = relative(base, run);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("Scratch output must be inside output/");
  if (await realpath(base) !== base || await realpath(run) !== run) throw new Error("Refusing symlinked scratch output");
  // Validate the entire list before deleting anything.
  const targets = [];
  for (const name of names) {
    if (!name || name === "." || name === ".." || /[/\\]/.test(name) || isAbsolute(name)) throw new Error("Scratch names must be direct children");
    const target = resolve(run, name);
    try {
      const entry = await lstat(target);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Refusing non-directory scratch target");
      targets.push(target);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const target of targets) await rm(target, { recursive: true, force: true });
}
