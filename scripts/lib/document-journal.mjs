import { open, mkdir, readFile, rename, unlink, readdir, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fail, hashObject, maybeStat } from "./document-fs.mjs";

export async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function operationDirectory(context, create = false) {
  const directory = path.join(context.gitDirectory, "alpha-kanban-document-operations");
  if (create) { await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; }); await syncDirectory(context.gitDirectory); }
  const stat = await maybeStat(directory);
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && (Number(stat.uid) !== process.getuid() || (stat.mode & 0o077n) !== 0n))) fail("JOURNAL_BOUNDARY", "The operation store is not a private real directory owned by this user.");
  return directory;
}

export async function saveJournal(directory, journal) {
  const temporary = path.join(directory, `.journal-${randomUUID()}.tmp`);
  const envelope = { checksum: hashObject(journal), journal };
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(envelope)); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path.join(directory, journal.plan.id + ".json")); await syncDirectory(directory); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

export async function loadJournal(directory, id) {
  if (!/^[a-f0-9]{64}$/.test(id ?? "")) fail("INVALID_OPERATION_ID", "An exact operation ID is required.");
  if (!directory) fail("JOURNAL_NOT_FOUND", "No local operation journal exists.");
  const file = path.join(directory, id + ".json");
  const info = await maybeStat(file);
  if (!info || !info.isFile() || info.isSymbolicLink()) fail("JOURNAL_NOT_FOUND", "The operation journal is missing or unsafe.");
  let envelope;
  try { envelope = JSON.parse(await readFile(file, "utf8")); } catch { fail("JOURNAL_DAMAGED", "The journal cannot be decoded; preserve it for manual recovery."); }
  if (!envelope.journal || envelope.checksum !== hashObject(envelope.journal) || envelope.journal.plan?.id !== id) fail("JOURNAL_DAMAGED", "The journal checksum does not match; preserve it for manual recovery.");
  return envelope.journal;
}
export async function journalIds(directory) {
  return directory ? (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => name.slice(0, -5)).sort() : [];
}

export async function lockInfo(directory) {
  if (!directory) return null;
  try {
    const file = path.join(directory, "active.lock"), info = await maybeStat(file);
    if (!info) return null;
    if (!info.isFile() || info.isSymbolicLink()) fail("LOCK_DAMAGED", "The lock must be a real file.");
    const record = JSON.parse(await readFile(file, "utf8"));
    if (!Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.token !== "string" || typeof record.host !== "string") fail("LOCK_DAMAGED", "The lock identity is invalid.");
    return record;
  }
  catch (error) { if (error.code === "ENOENT") return null; fail("LOCK_DAMAGED", "The lock record cannot be read safely."); }
}
export async function withOperationLock(directory, action) {
  const file = path.join(directory, "active.lock");
  const record = { token: randomUUID(), pid: process.pid, host: os.hostname() };
  let handle;
  try { handle = await open(file, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") fail("OPERATION_LOCKED", "Another operation or an interrupted process owns this worktree lock.", { lock: await lockInfo(directory) }); throw error; }
  const inode = String((await handle.stat()).ino);
  try {
    await handle.writeFile(JSON.stringify(record)); await handle.sync(); await syncDirectory(directory);
    return await action();
  } finally {
    await handle.close();
    const current = await lockInfo(directory);
    if (current?.token === record.token && String((await lstat(file)).ino) === inode) { await unlink(file); await syncDirectory(directory); }
  }
}
export async function unlockInterruptedOperation(directory, token) {
  const record = await lockInfo(directory);
  if (!record || record.token !== token || record.host !== os.hostname()) fail("LOCK_MISMATCH", "The explicit lock token or host does not match.");
  try { process.kill(record.pid, 0); fail("LOCK_ACTIVE", "The owning process is still running."); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  const file = path.join(directory, "active.lock"), before = await lstat(file);
  if ((await lockInfo(directory))?.token !== token || (await lstat(file)).ino !== before.ino) fail("LOCK_MISMATCH", "The lock changed while checking it.");
  await unlink(file); await syncDirectory(directory);
  return { status: "unlocked", token };
}
