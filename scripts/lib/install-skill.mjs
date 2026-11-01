import { lstat, mkdir, mkdtemp, open, readFile, link, rm, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { collectSkill, sha256 } from "./skill-distribution.mjs";
import { validateBundle } from "../../apps/web/src/skills/bundle.ts";

async function exists(file) { try { return await lstat(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function parents(file) {
  const parts = path.resolve(file).split(path.sep); let current = path.parse(path.resolve(file)).root;
  for (const part of parts.slice(1)) {
    current = path.join(current, part); const info = await exists(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error("Install parents must be real directories: " + current);
  }
}
async function durable(file, bytes) {
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory) { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } }
async function syncTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isDirectory()) await syncTree(path.join(directory, entry.name));
  await syncDirectory(directory);
}
const manifest = (files) => files.map(({ path, sha256 }) => ({ path, sha256 }));

export async function inspectInstallation(target, distribution) {
  await validateBundle(distribution.bundle, distribution.bundle.version, distribution.payloadSha256);
  if (!await exists(target)) return { status: "missing", target };
  try {
    const files = await collectSkill(target);
    return { status: JSON.stringify(manifest(files)) === JSON.stringify(manifest(distribution.bundle.files)) ? "matching" : "different", target, files: manifest(files) };
  } catch (error) { return { status: "unverified", target, reason: error.message }; }
}

/** Fresh installation only. Existing installations use the guarded compare/update workflow. */
export async function installSkill({ target, distribution, fault }) {
  const { bundle, payloadSha256 } = distribution;
  await validateBundle(bundle, bundle.version, payloadSha256);
  target = path.resolve(target);
  if (await exists(target)) throw new Error("An installation already exists at " + target + ". Compare and back it up before replacing it. No files were changed.");
  const suffix = [path.basename(target)]; let ancestor = path.dirname(target);
  while (!await exists(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  target = path.join(await realpath(ancestor), ...suffix);
  const parent = path.dirname(target);
  await parents(parent); await mkdir(parent, { recursive: true }); await parents(parent);
  // Prepared SKILL.md stays outside the skills scan; exclusive linking cannot replace a raced destination.
  const staging = await mkdtemp(path.join(path.dirname(parent), ".ledger-install-"));
  const receipt = path.join(staging, "receipt.json"), prepared = path.join(staging, "prepared");
  await mkdir(prepared);
  let claimed = false;
  try {
    for (const file of bundle.files) {
      const destination = path.join(prepared, file.path); await mkdir(path.dirname(destination), { recursive: true });
      await durable(destination, file.content);
      if (sha256(await readFile(destination)) !== file.sha256) throw new Error("Prepared file hash mismatch: " + file.path);
    }
    const record = { schema: 1, target, version: bundle.version, payloadSha256, source: bundle.source, ledger: bundle.ledger, files: manifest(bundle.files) };
    await durable(receipt, JSON.stringify(record, null, 2)); await syncTree(prepared); await syncDirectory(staging);
    await fault?.("prepared", { target, staging });
    if ((await lstat(prepared)).dev !== (await lstat(parent)).dev) throw new Error("Staging and target must use the same filesystem for exclusive publication.");
    await parents(parent); await mkdir(target); claimed = true;
    const targetIdentity = await lstat(target);
    for (const file of bundle.files.filter((file) => file.path !== "SKILL.md")) {
      const destination = path.join(target, file.path);
      await parents(path.dirname(destination)); await mkdir(path.dirname(destination), { recursive: true });
      await durable(destination, file.content);
      if (sha256(await readFile(destination)) !== file.sha256) throw new Error("Installed file hash mismatch: " + file.path);
      await fault?.("file", { target, staging, path: file.path });
    }
    const expected = manifest(bundle.files.filter((file) => file.path !== "SKILL.md"));
    if (JSON.stringify(manifest(await collectSkill(target))) !== JSON.stringify(expected)) throw new Error("The target changed during preparation.");
    const current = await lstat(target);
    if (current.isSymbolicLink() || current.ino !== targetIdentity.ino || current.dev !== targetIdentity.dev || await realpath(target) !== target) throw new Error("The target directory was replaced.");
    await fault?.("before-publish", { target, staging });
    if (JSON.stringify(manifest(await collectSkill(prepared))) !== JSON.stringify(manifest(bundle.files))) throw new Error("Prepared files changed before publication.");
    await parents(target);
    const publishIdentity = await lstat(target);
    if (publishIdentity.ino !== targetIdentity.ino || publishIdentity.dev !== targetIdentity.dev) throw new Error("The target changed before publication.");
    await syncTree(target);
    await link(path.join(prepared, "SKILL.md"), path.join(target, "SKILL.md"));
    await syncDirectory(target);
    await fault?.("published", { target, staging });
    if ((await inspectInstallation(target, distribution)).status !== "matching") throw new Error("Final installation verification failed.");
    const receiptDirectory = path.join(path.dirname(parent), ".ledger-install-receipts");
    await parents(receiptDirectory); await mkdir(receiptDirectory, { recursive: true });
    const savedReceipt = path.join(receiptDirectory, path.basename(staging) + ".json");
    await durable(savedReceipt, JSON.stringify(record, null, 2)); await syncDirectory(receiptDirectory);
    await rm(staging, { recursive: true });
    return { target, receipt: savedReceipt, version: bundle.version, source: bundle.source };
  } catch (error) {
    throw new Error(error.message + "\n" + (claimed ? "The new target may be incomplete; do not treat it as a completed installation. " : "No existing installation was changed. ") + "Prepared files and verification receipt are retained at " + staging + ". Compare before any explicit recovery.");
  }
}
