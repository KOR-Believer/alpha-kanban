import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const originals = JSON.parse(await readFile(resolve(root, "original-hashes.json"), "utf8"));
const changed = [], missing = [], added = [], ignoredMetadata = [];
async function findAdded(directory) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await findAdded(path);
    else if (!(path in originals)) {
      if ([".DS_Store", "Thumbs.db", "desktop.ini"].includes(entry.name)) ignoredMetadata.push(path);
      else added.push(path);
    }
  }
}
await findAdded("fixtures");
for (const [path, hash] of Object.entries(originals)) {
  try { if (createHash("sha256").update(await readFile(resolve(root, path))).digest("hex") !== hash) changed.push(path); }
  catch { missing.push(path); }
}
const result = { time: new Date().toISOString(), platform: process.platform, checked: Object.keys(originals).length, changed, missing, added, ignoredMetadata, unchanged: !changed.length && !missing.length && !added.length };
await writeFile(resolve(root, "fixture-verification.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
