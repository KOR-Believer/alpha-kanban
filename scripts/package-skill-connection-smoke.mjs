import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, cp, lstat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

// Ship only a built app and synthetic installations. Never read personal skills/profiles.
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, process.argv[2] ?? `output/playwright/skill-connection-${Date.now()}`);
await mkdir(output, { recursive: false });
await cp(resolve(root, "apps/web/dist-browser"), resolve(output, "app"), { recursive: true });
const release = JSON.parse(await readFile(resolve(output, "app/release.json"), "utf8"));
const bundle = JSON.parse(await readFile(resolve(output, `app/downloads/implementation-ledger-${release.skillBundle}.json`), "utf8"));
const known = bundle.known[0];
if (!known) throw new Error("A reviewed older snapshot is required.");
const old = known.files.map(({ path, sha256 }) => {
  const content = execFileSync("git", ["show", `${known.source}:skills/implementation-ledger/${path}`], { cwd: root });
  if (createHash("sha256").update(content).digest("hex") !== sha256) throw new Error(`Unexpected fixture hash: ${path}`);
  return { path, content };
});
const hashes = {};
async function fixture(path, content) {
  await mkdir(dirname(resolve(output, path)), { recursive: true });
  await writeFile(resolve(output, path), content);
  hashes[path] = createHash("sha256").update(content).digest("hex");
}
for (const group of ["drop", "picker", "custom", "parent/skills"]) {
  for (const file of old) await fixture(`fixtures/${group}/implementation-ledger/${file.path}`, file.content);
}
const skill = old.find(file => file.path === "SKILL.md").content.toString();
await fixture("fixtures/custom/implementation-ledger/personal-note.md", "# Synthetic customization\n\nKeep this file during registration.\n");
await fixture("fixtures/wrong/implementation-ledger/SKILL.md", "---\nname: other-skill\ndescription: Synthetic negative fixture\n---\n# Other skill\n");
await fixture("fixtures/file/SKILL.md", skill);
await fixture("fixtures/multiple/implementation-ledger-a/SKILL.md", skill);
await fixture("fixtures/multiple/implementation-ledger-b/SKILL.md", skill);
await mkdir(resolve(output, "fixtures/empty"), { recursive: true });
await writeFile(resolve(output, "original-hashes.json"), JSON.stringify(hashes, null, 2));
await cp(resolve(root, "scripts/fixtures/skill-connection-smoke"), output, { recursive: true });
await writeFile(resolve(output, "build.json"), JSON.stringify({ build: release.buildId, channel: release.channel, skillBundle: release.skillBundle }, null, 2));
await writeFile(resolve(output, "run-windows.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nnode serve.mjs\r\npause\r\n');
await writeFile(resolve(output, "verify-windows.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nnode verify.mjs\r\npause\r\n');
const entries = {};
async function collect(path = "") {
  for (const entry of await readdir(resolve(output, path))) {
    const key = path ? `${path}/${entry}` : entry;
    const info = await lstat(resolve(output, key));
    if (info.isSymbolicLink()) throw new Error("No symlinks in portable tests.");
    if (info.isDirectory()) { entries[key + "/"] = new Uint8Array(); await collect(key); }
    else entries[key] = new Uint8Array(await readFile(resolve(output, key)));
  }
}
await collect();
const archive = zipSync(entries, { level: 6 });
await writeFile(output + ".zip", archive, { flag: "wx" });
console.log(JSON.stringify({ output, archive: output + ".zip", bytes: archive.length, files: Object.keys(hashes).length, skillBundle: release.skillBundle }, null, 2));
