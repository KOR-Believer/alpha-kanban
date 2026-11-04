import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const base = import.meta.dirname;
const originals = JSON.parse(await readFile(resolve(base, "original-hashes.json"), "utf8"));
const files = [];
for (const [path, expected] of Object.entries(originals)) {
  let actual;
  try { actual = createHash("sha256").update(await readFile(resolve(base, path))).digest("hex"); } catch { actual = null; }
  files.push({ path, unchanged: actual === expected, expected, actual });
}
const result = { platform: process.platform, node: process.version, checkedAt: new Date().toISOString(), passed: files.every((file) => file.unchanged), files };
await writeFile(resolve(base, `preservation-${process.platform}.json`), JSON.stringify(result, null, 2) + "\n");
console.log(`${result.passed ? "PASS" : "FAIL"}: ${files.filter((file) => file.unchanged).length}/${files.length} original fixture files unchanged`);
process.exitCode = result.passed ? 0 : 1;
