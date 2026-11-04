import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeDirectory, FakeFile, MemoryStorage, testLocks } from "../browser/browserFixtures";
import { appActivity } from "../pwa/activity";
import { isLedgerSkill, safeSkillPath, skillHash, validateBundle, type SkillBundle } from "./bundle";
import { SkillRepository } from "./repository";

const skill = "---\nname: implementation-ledger\ndescription: test\n---\n";
async function files(input: Record<string, string>) {
  return Promise.all(Object.entries(input).map(async ([path, content]) => ({ path, content, sha256: await skillHash(content) })));
}
async function fixture() {
  const before = await files({ "SKILL.md": skill + "old", "references/format.md": "old rules", "obsolete.md": "old file" });
  const target = await files({ "SKILL.md": skill + "new", "references/format.md": "new rules", "assets/new.md": "new template" });
  const bundle: SkillBundle = { schema: 1, name: "implementation-ledger", version: (await skillHash(target.map((file) => "implementation-ledger/" + file.path + file.content).join(""))).slice(0, 12), files: target,
    known: [{ source: "a".repeat(40), files: before.map(({ path, sha256 }) => ({ path, sha256 })) }] };
  const digest = await skillHash(JSON.stringify(bundle));
  const root = new FakeDirectory("arbitrary-installed-name");
  const existing = root.file("SKILL.md", before[0]!.content);
  const reference = root.directory("references").file("format.md", "old rules");
  root.file("obsolete.md", "old file");
  const storage = new MemoryStorage();
  const lock = testLocks();
  const config = { version: bundle.version, digest, compatible: true };
  const repository = new SkillRepository(storage, lock, config);
  const connection = await repository.connect(root.handle());
  return { before, bundle, digest, root, existing, reference, storage, lock, config, repository, connection };
}
afterEach(() => { vi.restoreAllMocks(); appActivity.resume(); });

describe("sequential channel replacement", () => {
  it("returns to stable without a canary backup and restores each origin's own complete preimage", async () => {
    const f = await fixture();
    await f.repository.apply(await f.repository.inspect(f.connection, f.bundle));
    const content = f.bundle.files.map((file) => ({ ...file, content: file.content + "\nCanary fixture" }));
    const canaryFiles = await files(Object.fromEntries(content.map((file) => [file.path, file.content])));
    const canary: SkillBundle = { ...f.bundle, files: canaryFiles, known: [], version: (await skillHash(canaryFiles.map((file) => "implementation-ledger/" + file.path + file.content).join(""))).slice(0, 12) };
    const stableApp = new SkillRepository(new MemoryStorage(), testLocks(), f.config);
    const canaryApp = new SkillRepository(new MemoryStorage(), testLocks(), { version: canary.version, digest: await skillHash(JSON.stringify(canary)), compatible: true });
    const stableConnection = await stableApp.connect(f.root.handle()), canaryConnection = await canaryApp.connect(f.root.handle());
    f.root.file("personal.md", "Personal rules preserved only in the backup");
    const before = await canaryApp.inspect(canaryConnection, canary);
    const staleStable = await stableApp.inspect(stableConnection, f.bundle);
    expect(before.state).toBe("custom");
    await expect(canaryApp.apply(before)).rejects.toThrow("Personal or unrecognized");
    await expect(canaryApp.approveAppUpdate(before, "a".repeat(16), "b".repeat(16))).rejects.toThrow("Personal or unrecognized");
    const canaryBackup = await canaryApp.reinstall(before);
    expect((await stableApp.inspect(stableConnection, f.bundle)).state).toBe("custom");
    expect(await stableApp.recoveries()).toEqual([]);
    await expect(stableApp.reinstall(staleStable)).rejects.toThrow("changed outside");
    const stableReview = await stableApp.inspect(stableConnection, f.bundle);
    await expect(stableApp.apply(stableReview)).rejects.toThrow("Personal or unrecognized");
    const stableBackup = await stableApp.reinstall(stableReview);
    expect((await stableApp.inspect(stableConnection, f.bundle)).state).toBe("current");
    expect((await stableApp.recoveries())[0]!.before).toEqual(stableReview.files);
    expect((await canaryApp.recoveries())[0]!.before).toEqual(before.files);
    await stableApp.restore(stableBackup);
    expect((await canaryApp.inspect(canaryConnection, canary)).state).toBe("current");
    await canaryApp.restore(canaryBackup);
    const restored = await canaryApp.inspect(canaryConnection, canary);
    expect(restored.files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(before.files.map(({ path, sha256 }) => ({ path, sha256 })));
    await stableApp.disconnect(); await canaryApp.disconnect();
    expect((await stableApp.recoveries())[0]!.state).toBe("restored");
    expect((await canaryApp.recoveries())[0]!.state).toBe("restored");
  });
});

describe("registered skill updates", () => {
  it("rejects empty, parent and other skill folders without writing files", async () => {
    const { repository } = await fixture();
    for (const root of [new FakeDirectory("empty"), new FakeDirectory("skills"), new FakeDirectory("other")]) {
      if (root.name === "other") root.file("SKILL.md", "---\nname: other\n---\n");
      if (root.name === "skills") root.directory("implementation-ledger").file("SKILL.md", skill);
      const count = root.children.size;
      await expect(repository.connect(root.handle())).rejects.toThrow("Select the installed");
      expect(root.children.size).toBe(count);
    }
  });
  it("registers by SKILL.md, reuses identity, separates storage and never writes on comparison", async () => {
    const { root, existing, repository, connection, bundle, storage } = await fixture();
    expect((await repository.connect(root.handle())).id).toBe(connection.id);
    expect((await repository.inspect(connection, bundle)).state).toBe("update");
    expect(existing.opens).toBe(0);
    expect([...storage.records.keys()]).toEqual(["skill-update:connection"]);
  });
  it("backs up the full folder before any write, applies all changes, then restores the original", async () => {
    const { repository, connection, bundle, existing, root, storage, before } = await fixture();
    existing.onOpen = () => {
      expect([...storage.records.keys()].some((key) => key.startsWith("skill-update:recovery:"))).toBe(true);
      expect(appActivity.prepare()).toBe(false);
    };
    const id = await repository.apply(await repository.inspect(connection, bundle));
    expect((await repository.inspect(connection, bundle)).state).toBe("current");
    expect(root.children.has("obsolete.md")).toBe(false);
    expect((await repository.recoveries())[0]!.state).toBe("applied");
    await repository.restore(id);
    const review = await repository.inspect(connection, bundle);
    expect(review.files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(before.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => a.path.localeCompare(b.path)));
    expect((await repository.recoveries())[0]!.state).toBe("restored");
    await repository.disconnect();
    expect(await repository.connection()).toBeUndefined();
    expect(await repository.recoveries()).toHaveLength(1);
    expect(existing.content).toBe(skill + "old");
  });
  it.each(["content", "mtime", "extra", "missing"])("rejects stale %s changes before writing", async (kind) => {
    const { repository, connection, bundle, existing, root } = await fixture();
    const review = await repository.inspect(connection, bundle);
    if (kind === "content") existing.content += "personal";
    if (kind === "mtime") existing.mtime++;
    if (kind === "extra") root.file("personal.md", "mine");
    if (kind === "missing") root.children.delete("SKILL.md");
    await expect(repository.apply(review)).rejects.toThrow();
    expect(existing.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
  });
  it("copies native file data on update and restore, truncating shorter UTF-8 replacements", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    const original = skill + "긴 원본 내용입니다";
    existing.content = original;
    bundle.known[0]!.files.find((file) => file.path === "SKILL.md")!.sha256 = await skillHash(original);
    const config = { version: bundle.version, digest: await skillHash(JSON.stringify(bundle)) };
    const storage = new MemoryStorage();
    const updatedRepository = new SkillRepository(storage, testLocks(), config);
    const saved = await updatedRepository.connect(connection.handle);
    const open = vi.spyOn(existing, "createWritable");
    const id = await updatedRepository.apply(await updatedRepository.inspect(saved, bundle));
    expect(existing.content).toBe(skill + "new");
    expect(open).toHaveBeenLastCalledWith({ keepExistingData: true });
    await updatedRepository.restore(id);
    expect(existing.content).toBe(original);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith({ keepExistingData: true });
    expect(await repository.recoveries()).toHaveLength(0);
  });
  it("does not classify personal modifications as an official upgrade", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    existing.content += " my rules";
    const review = await repository.inspect(connection, bundle);
    expect(review.state).toBe("custom");
    await expect(repository.apply(review)).rejects.toThrow("Personal or unrecognized");
    expect(existing.opens).toBe(0);
  });
  it("does not discard a UTF-8 BOM when comparing installed file hashes", async () => {
    const { repository, connection, bundle, reference, existing } = await fixture();
    reference.content = "\uFEFF" + reference.content;
    const review = await repository.inspect(connection, bundle);
    expect(review.state).toBe("custom");
    expect(review.files.find((file) => file.path === "references/format.md")?.content).toBe(reference.content);
    await expect(repository.apply(review)).rejects.toThrow("Personal or unrecognized");
    expect(existing.opens).toBe(0);
    expect(reference.opens).toBe(0);
  });
  it("never writes when the durable backup fails or write permission is missing", async () => {
    const { repository, connection, bundle, existing, storage, root } = await fixture();
    const review = await repository.inspect(connection, bundle);
    vi.spyOn(storage, "set").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await expect(repository.apply(review)).rejects.toThrow("Full");
    root.write = "denied";
    await expect(repository.apply(review)).rejects.toThrow("Allow access");
    expect(existing.opens).toBe(0);
  });
  it("keeps a durable partial failure, blocks retry after restart and allows explicit recovery", async () => {
    const { repository, connection, bundle, reference, storage, lock, config, existing, root } = await fixture();
    reference.failClose = true;
    await expect(repository.apply(await repository.inspect(connection, bundle))).rejects.toThrow("Close failed");
    expect(root.children.has("obsolete.md")).toBe(false);
    const restarted = new SkillRepository(storage, lock, config);
    const record = (await restarted.recoveries())[0]!;
    expect(record.state).toBe("pending");
    await expect(restarted.apply(await restarted.inspect(connection, bundle))).rejects.toThrow("unfinished");
    reference.failClose = false;
    await restarted.restore(record.id);
    expect(existing.content).toBe(skill + "old");
    expect(reference.content).toBe("old rules");
  });
  it("refuses to overwrite external changes during writes or recovery", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    existing.onOpen = () => { existing.content = skill + "external"; existing.mtime++; };
    await expect(repository.apply(await repository.inspect(connection, bundle))).rejects.toThrow("changed outside");
    expect(existing.writes).toBe(0);
    const record = (await repository.recoveries())[0]!;
    existing.onOpen = undefined;
    await expect(repository.restore(record.id)).rejects.toThrow("changed outside");
    expect(existing.content).toBe(skill + "external");
  });
  it("can recover an empty newly-created file after close fails", async () => {
    const { repository, connection, bundle, root } = await fixture();
    const assets = root.directory("assets");
    const original = assets.getFileHandle.bind(assets);
    vi.spyOn(assets, "getFileHandle").mockImplementation(async (name, options) => {
      const handle = await original(name, options);
      if (options?.create) (handle as unknown as FakeFile).failClose = true;
      return handle;
    });
    await expect(repository.apply(await repository.inspect(connection, bundle))).rejects.toThrow("Close failed");
    const record = (await repository.recoveries())[0]!;
    expect(record.created).toHaveLength(1);
    await repository.restore(record.id);
    expect(assets.children.has("new.md")).toBe(false);
    expect((await repository.inspect(connection, bundle)).state).toBe("update");
  });
  it("serializes duplicate updates across clients and never updates twice", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    const review = await repository.inspect(connection, bundle);
    const results = await Promise.allSettled([repository.apply(review), repository.apply(review)]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(existing.writes).toBe(1);
  });
  it("detects a failure after close and never calls that a verified update", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    existing.failAfterClose = true;
    await expect(repository.apply(await repository.inspect(connection, bundle))).rejects.toThrow("could not be verified");
    expect((await repository.recoveries())[0]!.state).toBe("pending");
  });
});

describe("explicit skill reinstall", () => {
  it("reinstalls an unknown snapshot only through the separate entry, backs up extra files and restores everything", async () => {
    const { repository, connection, bundle, existing, root } = await fixture();
    existing.content += " canary with personal rules";
    root.file("personal.md", "사용자 추가 내용");
    const review = await repository.inspect(connection, bundle);
    expect(review.state).toBe("custom");
    expect(await repository.recoveries()).toHaveLength(0);
    await expect(repository.apply(review)).rejects.toThrow("Personal or unrecognized");
    await expect(repository.approveAppUpdate(review, "a".repeat(16), "b".repeat(16))).rejects.toThrow("Personal or unrecognized");
    existing.onOpen = () => expect(appActivity.prepare()).toBe(false);
    const id = await repository.reinstall(review);
    const backup = (await repository.recoveries())[0]!;
    expect(backup.operation).toBe("reinstall");
    expect(backup.before).toEqual(review.files);
    expect(backup.state).toBe("applied");
    expect((await repository.inspect(connection, bundle)).state).toBe("current");
    expect(root.children.has("personal.md")).toBe(false);
    await repository.restore(id);
    const restored = await repository.inspect(connection, bundle);
    expect(restored.files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(review.files.map(({ path, sha256 }) => ({ path, sha256 })));
    expect(restored.state).toBe("custom");
    await repository.disconnect();
    expect(await repository.recoveries()).toHaveLength(1);
  });

  it.each(["content", "mtime", "extra", "missing", "connection"])("rejects a stale reinstall after %s changes", async (kind) => {
    const { repository, connection, bundle, existing, root } = await fixture();
    existing.content += " canary";
    const review = await repository.inspect(connection, bundle);
    if (kind === "content") existing.content += " new rule";
    if (kind === "mtime") existing.mtime++;
    if (kind === "extra") root.file("personal.md", "mine");
    if (kind === "missing") root.children.delete("SKILL.md");
    if (kind === "connection") await repository.disconnect();
    await expect(repository.reinstall(review)).rejects.toThrow();
    expect(existing.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
  });

  it.each(["permission", "quota", "digest", "unbound", "compatibility"])("retains the original when reinstall fails its %s guard", async (kind) => {
    const { repository, connection, bundle, existing, root, storage, lock, config } = await fixture();
    existing.content += " canary";
    const original = existing.content;
    const review = await repository.inspect(connection, bundle);
    let target = repository;
    if (kind === "permission") root.write = "denied";
    if (kind === "quota") vi.spyOn(storage, "set").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    if (kind === "digest") review.bundle.known = [];
    if (kind === "unbound") target = new SkillRepository(storage, lock, { ...config, digest: undefined });
    if (kind === "compatibility") target = new SkillRepository(storage, lock, { ...config, compatible: false });
    await expect(target.reinstall(review)).rejects.toThrow();
    expect(existing.content).toBe(original); expect(existing.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
  });

  it.each(["case", "file-directory", "directory-case", "empty-directory-case", "empty-directory-file"])("rejects a %s path collision before writing a reinstall", async (kind) => {
    const { repository, connection, bundle, existing, root } = await fixture();
    if (kind === "case") root.directory("assets").file("NEW.md", "personal");
    if (kind === "file-directory") root.file("assets", "personal file at a target directory path");
    if (kind === "directory-case") root.directory("Assets").file("personal.md", "personal");
    if (kind === "empty-directory-case") root.directory("Assets");
    if (kind === "empty-directory-file") root.directory("assets").directory("new.md");
    await expect(repository.reinstall(await repository.inspect(connection, bundle))).rejects.toThrow("paths conflict");
    expect(existing.opens).toBe(0); expect(await repository.recoveries()).toHaveLength(0);
  });

  it("persists the full backup before writing and rechecks external edits made during that backup", async () => {
    const { repository, connection, bundle, existing, storage } = await fixture();
    existing.content += " canary";
    const review = await repository.inspect(connection, bundle);
    const save = storage.set.bind(storage);
    vi.spyOn(storage, "set").mockImplementation(async (key, value) => {
      await save(key, value);
      if (key.startsWith("skill-update:recovery:")) existing.content += " concurrent edit";
    });
    await expect(repository.reinstall(review)).rejects.toThrow("changed outside");
    expect(existing.opens).toBe(0);
    expect((await repository.recoveries())[0]?.before).toEqual(review.files);
    expect((await repository.recoveries())[0]?.state).toBe("pending");
  });

  it("keeps a failed reinstall recoverable after restart and refuses another reinstall until recovery", async () => {
    const { repository, connection, bundle, existing, reference, root, storage, lock, config } = await fixture();
    existing.content += " canary"; root.file("personal.md", "preserve me");
    const review = await repository.inspect(connection, bundle);
    existing.onOpen = () => expect([...storage.records.keys()].some((key) => key.startsWith("skill-update:recovery:"))).toBe(true);
    reference.failClose = true;
    await expect(repository.reinstall(review)).rejects.toThrow("Close failed");
    const restarted = new SkillRepository(storage, lock, config);
    await expect(restarted.reinstall(await restarted.inspect(connection, bundle))).rejects.toThrow("unfinished");
    reference.failClose = false;
    const backup = (await restarted.recoveries())[0]!;
    await restarted.restore(backup.id);
    expect((await restarted.inspect(connection, bundle)).files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(review.files.map(({ path, sha256 }) => ({ path, sha256 })));
  });

  it("serializes duplicate reinstall attempts and preserves external changes during restore", async () => {
    const { repository, connection, bundle, existing } = await fixture();
    existing.content += " canary";
    const review = await repository.inspect(connection, bundle);
    const results = await Promise.allSettled([repository.reinstall(review), repository.reinstall(review)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await repository.recoveries()).toHaveLength(1);
    existing.content += " subsequent personal edit";
    await expect(repository.restore((await repository.recoveries())[0]!.id)).rejects.toThrow("changed outside");
    expect(existing.content).toContain("subsequent personal edit");
  });

  it("restores older backups without an operation label", async () => {
    const { repository, connection, bundle, storage, existing } = await fixture();
    const original = existing.content;
    const id = await repository.apply(await repository.inspect(connection, bundle));
    const backup = (await repository.recoveries())[0]!;
    delete backup.operation;
    await storage.set("skill-update:recovery:" + id, backup);
    await repository.restore(id);
    expect(existing.content).toBe(original);
  });
});

describe("skill payload validation", () => {
  it.each(["about", "intro", "untrusted"])("validates the %s update URL together with its pinned skill header", async page => {
    const updateUrl = page === "untrusted" ? "https://other.test/about#updates" : `https://kanban.giveit2.me/${page}#updates`;
    const ledger = { skillRevision: "2", readFormats: ["unversioned", "1"], writeFormats: ["unversioned", "1"], newDocumentFormat: "unversioned", formatField: "Ledger-Format", updateUrl };
    const metadata = { version: ledger.skillRevision, "read-formats": ledger.readFormats.join(","), "write-formats": ledger.writeFormats.join(","), "new-document-format": ledger.newDocumentFormat, "update-url": updateUrl };
    const content = `---\nname: implementation-ledger\nmetadata:\n${Object.entries(metadata).map(([key, value]) => `  ${key}: "${value}"`).join("\n")}\n---\n`;
    const target = await files({ "SKILL.md": content });
    const bundle: SkillBundle = { schema: 1, name: "implementation-ledger", version: (await skillHash("implementation-ledger/SKILL.md" + content)).slice(0, 12), files: target, known: [], ledger,
      source: { repository: "https://github.com/KOR-Believer/alpha-kanban", commit: "a".repeat(40), kind: "commit" } };
    if (page === "untrusted") await expect(validateBundle(bundle, bundle.version)).rejects.toThrow("Invalid skill provenance");
    else {
      expect(await validateBundle(bundle, bundle.version)).toBe(bundle);
      bundle.ledger!.updateUrl = `https://kanban.giveit2.me/${page === "about" ? "intro" : "about"}#updates`;
      await expect(validateBundle(bundle, bundle.version)).rejects.toThrow("Invalid skill provenance");
    }
  });

  it("pins the complete payload including the trusted old-file registry", async () => {
    const { bundle, digest } = await fixture();
    expect(await validateBundle(bundle, bundle.version, digest)).toBe(bundle);
    const forged = structuredClone(bundle); forged.known[0]!.files[0]!.sha256 = "f".repeat(64);
    await expect(validateBundle(forged, forged.version, digest)).rejects.toThrow("Invalid");
    forged.files[0]!.content += "tampered";
    await expect(validateBundle(forged, forged.version)).rejects.toThrow("Invalid");
  });
  it("rejects traversal, drive paths, special names, duplicates and file-directory collisions", async () => {
    for (const path of ["../SKILL.md", "/SKILL.md", "C:/SKILL.md", "a\\b", ".hidden", "a/../b", "con.txt", "a."]) expect(safeSkillPath(path)).toBe(false);
    const { bundle } = await fixture();
    for (const path of ["skill.md", "references", "../../evil"]) {
      const invalid = structuredClone(bundle);
      invalid.files.push({ path, content: "", sha256: await skillHash("") });
      await expect(validateBundle(invalid, bundle.version)).rejects.toThrow("Invalid");
    }
    expect(isLedgerSkill("---\nname: other\n---\nname: implementation-ledger")).toBe(false);
  });
});

describe("PWA-bound skill consent", () => {
  const a = "a".repeat(16), b = "b".repeat(16), c = "c".repeat(16);
  async function approved() {
    const value = await fixture();
    const review = await value.repository.inspect(value.connection, value.bundle);
    const id = await value.repository.approveAppUpdate(review, a, b);
    return { ...value, id, review };
  }
  it("does not write on approval, the old app, cancellation, or without consent", async () => {
    const { repository, bundle, id, existing } = await approved();
    const load = vi.fn(async () => bundle);
    expect(await repository.completeAppUpdate(a, load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled(); expect(existing.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
    await repository.cancelAppUpdate(id);
    expect(await repository.completeAppUpdate(b, load)).toBeUndefined();
    expect(existing.opens).toBe(0);
  });
  it("backs up and updates exactly once after the approved app starts, including concurrent windows", async () => {
    const { repository, bundle, existing, storage, lock, config, id } = await approved();
    const restarted = new SkillRepository(storage, lock, config);
    const results = await Promise.all([restarted.completeAppUpdate(b, async () => bundle), repository.completeAppUpdate(b, async () => bundle)]);
    expect(results.map((result) => result?.state)).toEqual(["applied", "applied"]);
    expect(existing.writes).toBe(1); expect(await repository.recoveries()).toHaveLength(1);
    await repository.acknowledgeAppUpdate(id);
    expect(await restarted.completeAppUpdate(b, async () => bundle)).toBeUndefined();
    await repository.restore(results[0]!.recoveryId!);
    expect(existing.content).toBe(skill + "old");
    expect(await restarted.completeAppUpdate(b, async () => bundle)).toBeUndefined();
  });
  it("waits for resume and protects the entire consent cancellation against a late prepare message", async () => {
    const { repository, storage, id } = await approved();
    const get = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key) => {
      expect(appActivity.prepare()).toBe(false);
      return get(key);
    });
    appActivity.prepare();
    const cancelled = repository.cancelAppUpdate(id);
    await Promise.resolve();
    expect(storage.get).not.toHaveBeenCalled();
    appActivity.resume();
    await cancelled;
    expect(storage.records.has("skill-update:app-update")).toBe(false);
  });
  it.each(["content", "mtime", "extra", "permission", "connection", "build", "payload", "compatibility"])("preserves the installation when %s changes after consent", async (kind) => {
    const { repository, bundle, existing, root, storage, lock, config } = await approved();
    if (kind === "content") existing.content += " personal";
    if (kind === "mtime") existing.mtime++;
    if (kind === "extra") root.file("personal.md", "my rules");
    if (kind === "permission") root.write = "denied";
    if (kind === "connection") await repository.disconnect();
    const restarted = new SkillRepository(storage, lock, { ...config, ...(kind === "payload" ? { digest: "f".repeat(64) } : {}), ...(kind === "compatibility" ? { compatible: false } : {}) });
    const result = await restarted.completeAppUpdate(kind === "build" ? c : b, async () => bundle);
    expect(result?.state).toBe("blocked"); expect(existing.opens).toBe(0);
    expect(await repository.recoveries()).toHaveLength(0);
    root.write = "granted";
    expect((await repository.completeAppUpdate(b, async () => bundle))?.state).toBe("blocked");
    expect(existing.opens).toBe(0);
  });
  it("stops before touching files when durable consent or the backup cannot be stored", async () => {
    const { repository, bundle, connection, existing, storage } = await fixture();
    const review = await repository.inspect(connection, bundle);
    const set = storage.set.bind(storage);
    vi.spyOn(storage, "set").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    await expect(repository.approveAppUpdate(review, a, b)).rejects.toThrow("Full");
    expect(await repository.appUpdate()).toBeUndefined();
    await repository.approveAppUpdate(review, a, b);
    vi.spyOn(storage, "set").mockImplementation(async (key, value) => {
      if (key.startsWith("skill-update:recovery:")) throw new DOMException("Full", "QuotaExceededError");
      return set(key, value);
    });
    expect((await repository.completeAppUpdate(b, async () => bundle))?.state).toBe("blocked");
    expect(existing.opens).toBe(0);
  });
  it("keeps partial backups, never retries an interrupted write and allows explicit restoration", async () => {
    const { repository, bundle, existing, reference, storage, lock, config } = await approved();
    reference.failClose = true;
    const result = await repository.completeAppUpdate(b, async () => bundle);
    expect(result?.state).toBe("blocked");
    expect((await repository.recoveries())[0]?.state).toBe("pending");
    const writes = existing.writes;
    reference.failClose = false;
    const restarted = new SkillRepository(storage, lock, config);
    await restarted.completeAppUpdate(b, async () => bundle);
    expect(existing.writes).toBe(writes);
    await restarted.restore(result!.recoveryId!);
    expect(existing.content).toBe(skill + "old");
    expect(reference.content).toBe("old rules");
  });
  it("does not retry when a page ended after claiming the operation", async () => {
    const { repository, bundle, storage, existing } = await approved();
    const intent = await repository.appUpdate();
    await storage.set("skill-update:app-update", { ...intent, state: "writing" });
    expect((await repository.completeAppUpdate(b, async () => bundle))?.state).toBe("blocked");
    expect(existing.opens).toBe(0);
  });
  it("rejects custom and incompatible installations before storing consent", async () => {
    const { repository, bundle, connection, existing, storage, lock, config } = await fixture();
    existing.content += " my rule";
    await expect(repository.approveAppUpdate(await repository.inspect(connection, bundle), a, b)).rejects.toThrow("Personal");
    const unknown = new SkillRepository(storage, lock, { ...config, compatible: undefined });
    await expect(unknown.approveAppUpdate(await unknown.inspect(connection, bundle), a, b)).rejects.toThrow("compatibility");
    expect(await repository.appUpdate()).toBeUndefined(); expect(existing.opens).toBe(0);
  });
});
