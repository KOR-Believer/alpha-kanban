import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/package-link-smoke.mjs <smoke-folder> <new-zip-file>");
const root = resolve(source);
const entries = {};
const include = ["app-a", "app-b", "fixtures", "boundary-fixtures", "implementation-ledger", "serve.mjs", "verify.mjs", "native-cli.mjs", "native-interrupt.mjs", "native-ab.html", "native-ab.js", "native-boundaries.html", "native-boundaries.js", "README.md", "RETEST.md", "original-hashes.json"];
async function collect(path) {
  const file = resolve(root, path);
  const info = await lstat(file);
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
  if (info.isDirectory()) {
    for (const name of (await readdir(file)).sort()) await collect(`${path}/${name}`);
  } else if (info.isFile()) entries[path] = new Uint8Array(await readFile(file));
  else throw new Error(`Unsupported file: ${path}`);
}
for (const path of include) await collect(path);
const originals = JSON.parse(new TextDecoder().decode(entries["original-hashes.json"]));
for (const [path, expected] of Object.entries(originals)) {
  if (!entries[path] || createHash("sha256").update(entries[path]).digest("hex") !== expected) throw new Error(`Fixture changed: ${path}`);
}
// Only the allowlist above travels to another PC. Never package browser profiles,
// native journals, test results or logs containing the source machine's paths.
const archive = zipSync(entries, { level: 6 });
await writeFile(resolve(destination), archive, { flag: "wx" });
console.log(JSON.stringify({ file: resolve(destination), files: Object.keys(entries).length, bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") }, null, 2));
