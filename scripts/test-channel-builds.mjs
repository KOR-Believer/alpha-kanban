#!/usr/bin/env node
// Build the exact same working-tree snapshot twice without replacing local dev assets.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, symlink, rm, stat, chmod } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { promisify } from "node:util";
import { RELEASE_CHANNELS } from "../apps/web/release-channel.mjs";
import { checkBrowserRelease } from "./check-browser-release.mjs";
import { unzipSync } from "fflate";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/channel-builds-" + Date.now());
await mkdir(output, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AK_") && !key.startsWith("CF_PAGES") && !key.startsWith("GIT_")));
// These snapshots intentionally reuse dependencies. Never let pnpm reinstall a symlink target.
env.pnpm_config_verify_deps_before_run = "false";
const git = async (...args) => (await exec("git", args, { cwd: root, env, maxBuffer: 8 * 1024 * 1024 })).stdout;
const names = (await git("ls-files", "--cached", "--others", "--exclude-standard", "-z")).split("\0").filter(Boolean);
const snapshot = await Promise.all([...new Set(names)].map(async (name) => {
  try { return { name, content: await readFile(resolve(root, name)), mode: (await stat(resolve(root, name))).mode }; }
  catch (error) { if (error.code === "ENOENT") return { name }; throw error; }
}));
const releases = {};
const icons = {};
for (const config of Object.values(RELEASE_CHANNELS)) {
  const workspace = resolve(output, config.channel);
  await exec("git", ["clone", "--shared", "--quiet", root, workspace], { env });
  for (const { name, content, mode } of snapshot) {
    const target = resolve(workspace, name);
    if (!content) { await rm(target, { force: true }); continue; }
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); await chmod(target, mode);
  }
  for (const scope of ["", "apps/web", "packages/shared"]) await symlink(resolve(root, scope, "node_modules"), resolve(workspace, scope, "node_modules"), "junction");
  console.log(`Building isolated ${config.channel} snapshot...`);
  const build = await exec("pnpm", ["build"], { cwd: workspace, env: { ...env, AK_RELEASE_CHANNEL: config.channel }, maxBuffer: 12 * 1024 * 1024 });
  await writeFile(resolve(output, `${config.channel}.log`), build.stdout + build.stderr);
  const directory = resolve(workspace, "apps/web/dist-browser");
  const targetEnv = { AK_RELEASE_CHANNEL: config.channel, AK_DEPLOY_PROJECT: config.pagesProject, AK_DEPLOY_BRANCH: config.branch };
  const release = await checkBrowserRelease(directory, targetEnv);
  const html = await readFile(resolve(directory, "index.html"), "utf8");
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.webmanifest"), "utf8"));
  assert(html.includes(`data-release-channel="${config.channel}"`));
  assert(html.includes(`<title>${config.channel === "canary" ? "[Canary] " : ""}Alpha Kanban</title>`));
  assert.equal((html.match(/name="theme-color"/g) ?? []).length, 1);
  assert.equal(html.match(/name="theme-color" content="([^"]+)"/)[1], manifest.theme_color);
  assert.equal(manifest.background_color, manifest.theme_color);
  const guide = await readFile(resolve(directory, "downloads/INSTALL.txt"), "utf8");
  const archive = unzipSync(await readFile(resolve(directory, `downloads/implementation-ledger-${release.skillBundle}.zip`)));
  assert.equal(Buffer.from(archive["INSTALL.txt"]).toString("utf8"), guide);
  assert(guide.includes(`Provided by: ${config.name} (${config.channel})`));
  assert(guide.includes(`${config.origin}/downloads/implementation-ledger-${release.skillBundle}.json`));
  assert(guide.includes(`${config.origin}/downloads/implementation-ledger-${release.skillBundle}.zip`));
  assert(guide.includes(`Payload SHA-256: ${release.skillPayload}`));
  assert(!guide.includes("/tree/master"));
  const payload = JSON.parse(await readFile(resolve(directory, `downloads/implementation-ledger-${release.skillBundle}.json`), "utf8"));
  for (const file of payload.files) assert.equal(Buffer.from(archive["implementation-ledger/" + file.path]).toString("utf8"), file.content);
  if (config.channel === "canary") {
    assert(guide.includes("정식 스킬로 돌아가려면"));
    assert(guide.includes("To return to the stable skill"));
  }
  assert(html.includes(config.channel === "canary" ? "/icons/favicon-32.png" : "/icons/app-192.png"));
  icons[config.channel] = await readFile(resolve(directory, "icons/app-192.png"));
  const authored = JSON.parse(await readFile(resolve(workspace, "apps/web", config.historyFile), "utf8"));
  assert.deepEqual(release.history, authored);
  const other = config.channel === "stable" ? "canary" : "stable";
  await assert.rejects(checkBrowserRelease(directory, { AK_RELEASE_CHANNEL: other }), /channel/);
  await assert.rejects(exec("pnpm", ["--filter", "@alpha-kanban/web", "build"], {
    cwd: workspace, env: { ...env, AK_RELEASE_CHANNEL: other }, maxBuffer: 2 * 1024 * 1024,
  }), (error) => /Packaged assets belong to another channel/.test(error.stderr + error.stdout));
  releases[config.channel] = release;
  console.log(`PASS ${config.channel}: release, history, manifest, repair, complete offline assets and pinned skill hashes; other-channel target and stale packaging rejected.`);
}
assert.notEqual(releases.stable.buildId, releases.canary.buildId);
assert(!icons.stable.equals(icons.canary), "Channel app icons must be distinct");
assert.equal(releases.stable.skillBundle, releases.canary.skillBundle);
assert.equal(releases.stable.skillPayload, releases.canary.skillPayload);
assert.notEqual(releases.stable.skillArchive, releases.canary.skillArchive, "Channel installation guides differ outside the identical installed skill folder");
assert(!releases.canary.history.some((row) => releases.stable.history.some((stable) => row.id === stable.id)));
await writeFile(resolve(output, "report.json"), JSON.stringify({ releases, checks: "isolated builds, hashes, histories, mismatched deployment targets", output }, null, 2));
console.log(`PASS distinct app builds with identical skill contents. Artifacts: ${output}`);
