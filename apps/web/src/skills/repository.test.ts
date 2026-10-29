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
  const config = { version: bundle.version, digest };
  const repository = new SkillRepository(storage, lock, config);
  const connection = await repository.connect(root.handle());
  return { before, bundle, digest, root, existing, reference, storage, lock, config, repository, connection };
}
afterEach(() => { vi.restoreAllMocks(); appActivity.resume(); });

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

describe("skill payload validation", () => {
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
