import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { open, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { documentPersistence, documentWriteFlags, syncDirectory, saveJournal, loadJournal } from "../lib/document-journal.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ak-journal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const journal = { plan: { id: "a".repeat(64) }, status: "prepared", preimage: "original document" };

test("Windows rejects invalid directories but does not call unsupported directory fsync", async () => {
  let closed = 0, flushed = 0;
  const handle = { stat: async () => ({ isDirectory: () => true }), sync: async () => { flushed++; throw Object.assign(new Error("unsupported directory flush"), { code: "EPERM" }); }, close: async () => { closed++; } };
  await syncDirectory("fixture", { platform: "win32", openDirectory: async () => handle });
  assert.equal(flushed, 0); assert.equal(closed, 1);
  handle.stat = async () => ({ isDirectory: () => false });
  await assert.rejects(syncDirectory("fixture", { platform: "win32", openDirectory: async () => handle }), { code: "DIRECTORY_REQUIRED" });
  assert.equal(closed, 2);
  await assert.rejects(syncDirectory("fixture", { platform: "win32", openDirectory: async () => { throw Object.assign(new Error("access denied"), { code: "EACCES" }); } }), { code: "EACCES" });
  assert.equal(documentWriteFlags(constants.O_RDWR, "win32") & constants.O_SYNC, constants.O_SYNC);
  assert.deepEqual(documentPersistence("win32"), { fileSync: "fsync", writeThrough: true, directorySync: "unavailable", powerLossRecovery: "not-guaranteed" });
});

for (const platform of ["darwin", "linux"]) test(`${platform} propagates directory flush failures and closes its handle`, async () => {
  let closed = false;
  const handle = { stat: async () => ({ isDirectory: () => true }), sync: async () => { throw Object.assign(new Error("storage failure"), { code: "EPERM" }); }, close: async () => { closed = true; } };
  await assert.rejects(syncDirectory("fixture", { platform, openDirectory: async () => handle }), { code: "EPERM" });
  assert.equal(closed, true);
  assert.equal(documentWriteFlags(constants.O_RDWR, platform), constants.O_RDWR);
});

test("a file flush failure cannot publish a replacement or discard the previous recovery journal", async t => {
  const directory = await fixture(t);
  await saveJournal(directory, journal);
  const file = path.join(directory, journal.plan.id + ".json"), original = await readFile(file, "utf8");
  let closed = false;
  await assert.rejects(saveJournal(directory, { ...journal, status: "applying" }, { openFile: async (...args) => {
    const handle = await open(...args);
    return { writeFile: handle.writeFile.bind(handle), sync: async () => { throw Object.assign(new Error("file flush failure"), { code: "EPERM" }); }, close: async () => { closed = true; await handle.close(); } };
  } }), { code: "EPERM" });
  assert.equal(closed, true);
  assert.equal(await readFile(file, "utf8"), original);
  assert.deepEqual(await loadJournal(directory, journal.plan.id), journal);
});

test("journal publication is not acknowledged when readback differs", async t => {
  const directory = await fixture(t);
  await assert.rejects(saveJournal(directory, journal, { readPublished: async () => "corrupted readback" }), { code: "JOURNAL_READBACK_MISMATCH" });
  // The preimage remains available for inspection; readback failure never deletes it.
  assert.deepEqual(await loadJournal(directory, journal.plan.id), journal);
});
