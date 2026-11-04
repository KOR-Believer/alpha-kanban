#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { resolveReleaseChannel } from "../apps/web/release-channel.mjs";

export async function checkBrowserRelease(directory, env = process.env) {
  const config = resolveReleaseChannel(env);
  const json = async (name) => JSON.parse(await readFile(resolve(directory, name), "utf8"));
  const release = await json("release.json");
  const downloads = await json("downloads/manifest.json");
  for (const value of [release, downloads]) {
    if (value.channel !== config.channel || value.canonicalOrigin !== config.origin) throw new Error("Built assets and deployment channel do not match.");
  }
  if (release.app !== "alpha-kanban" || release.protocol !== 1 || !/^[a-f0-9]{16}$/.test(release.buildId) || !["app", "recovery", "retired"].includes(release.mode)) throw new Error("Invalid built release.");
  if (!/^[a-f0-9]{12}$/.test(downloads.version) || downloads.archive !== `implementation-ledger-${downloads.version}.zip` || downloads.version !== release.skillBundle || downloads.payloadSha256 !== release.skillPayload || downloads.archiveSha256 !== release.skillArchive) throw new Error("Packaged skill and app do not match.");
  for (const [name, expected] of [[downloads.archive, downloads.archiveSha256], [`implementation-ledger-${downloads.version}.json`, downloads.payloadSha256]]) {
    const digest = createHash("sha256").update(await readFile(resolve(directory, "downloads", name))).digest("hex");
    if (digest !== expected) throw new Error("Packaged skill digest does not match.");
  }
  const guide = await readFile(resolve(directory, "downloads/INSTALL.txt"), "utf8");
  if (!guide.includes(config.origin + "/about#updates")) throw new Error("Installation guide belongs to another channel.");
  const repair = await readFile(resolve(directory, "repair.js"), "utf8");
  if (!repair.includes(`const releaseChannel = "${config.channel}";`) || repair.includes('"__RELEASE_CHANNEL__"')) throw new Error("Repair channel was not compiled.");
  if (release.mode === "app") {
    const manifest = await json("manifest.webmanifest");
    if (manifest.name !== config.name || manifest.id !== "/" || manifest.scope !== "/" || manifest.start_url !== "/") throw new Error("Manifest and release do not match.");
    const inventory = await json("offline-assets.json");
    const marker = await json("offline-ready.json");
    if ([inventory, marker].some((value) => value.channel !== config.channel || value.buildId !== release.buildId)) throw new Error("Offline inventory belongs to another release.");
    for (const asset of inventory.assets) {
      if (typeof asset.url !== "string" || asset.url.startsWith("/") || asset.url.split("/").includes("..")) throw new Error("Invalid asset path.");
      const integrity = "sha256-" + createHash("sha256").update(await readFile(resolve(directory, asset.url))).digest("base64");
      if (integrity !== asset.integrity) throw new Error("Offline asset integrity mismatch: " + asset.url);
    }
  } else {
    const worker = await readFile(resolve(directory, "sw.js"), "utf8");
    if (!worker.includes(`const channel = "${config.channel}";`) || !worker.includes(`const buildId = "${release.buildId}";`)) throw new Error("Rescue worker and release do not match.");
  }
  return release;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = resolve(process.argv[2] ?? "apps/web/dist-browser");
  const release = await checkBrowserRelease(directory);
  console.log(`Verified ${release.channel} ${release.mode} build ${release.buildId}.`);
}
