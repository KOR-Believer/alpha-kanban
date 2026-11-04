import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbStorage } from "./storage";

describe("browser operational storage", () => {
  it("commits discovered identity pairs together and aborts the entire batch on failure", async () => {
    const storage = new IndexedDbStorage("batch-" + crypto.randomUUID());
    await storage.setMany([{ key: "document:kept", value: "original" }, { key: "document-path:p:kept", value: "kept" }]);
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value, key) {
      if (key === "document-path:p:new") throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, value, key);
    });
    try {
      await expect(storage.setMany([{ key: "document:kept", value: "changed" }, { key: "document:new", value: "new" }, { key: "document-path:p:new", value: "new" }])).rejects.toMatchObject({ name: "QuotaExceededError" });
    } finally { put.mockRestore(); }
    expect(await storage.get("document:kept")).toBe("original");
    expect(await storage.get("document:new")).toBeUndefined();
    expect(await storage.get("document-path:p:kept")).toBe("kept");
  });
  it("persists recovery and order records across repository instances and isolates prefixes", async () => {
    const name = "test-" + crypto.randomUUID();
    const storage = new IndexedDbStorage(name);
    await storage.set("recovery:1", { before: "원본", intended: "결과" });
    await storage.set("boardOrder", { keys: ["d_1#T-01"] });
    const restored = new IndexedDbStorage(name);
    expect(await restored.entries("recovery:")).toEqual([{ key: "recovery:1", value: { before: "원본", intended: "결과" } }]);
    expect(await restored.get("boardOrder")).toEqual({ keys: ["d_1#T-01"] });
    await restored.delete("recovery:1");
    expect(await storage.entries("recovery:")).toEqual([]);
  });

  it("keeps all durable record categories when reopening without a migration", async () => {
    const name = "preservation-" + crypto.randomUUID();
    const before = new IndexedDbStorage(name);
    const fixtures = {
      "connection:c1": { id: "c1", name: "workspace", kind: "root" },
      "project:p1": { id: "p1", connectionId: "c1", lastOpenedAt: "2026-10-18" },
      "document:d1": { id: "d1", workspaceId: "p1", path: "docs/02_tickets.md" },
      "document-path:p1:docs/02_tickets.md": "d1", lastWorkspace: "p1",
      boardOrder: { keys: ["d1#AKP-01"] }, "recovery:r1": { before: "원본", intended: "결과", intendedHash: "hash" },
      "link-mapping:v1:map:p1:%2Fold": { id: "mapping1", scopeId: "p1", prefix: "/old", label: "local-folder", remotes: ["origin=example.com/team/repo"] },
      "link-mapping:v1:document:linked%3Amapping1:docs%2Fa.md": { id: "ld_1" },
    };
    for (const [key, value] of Object.entries(fixtures)) await before.set(key, value);
    const after = new IndexedDbStorage(name);
    for (const [key, value] of Object.entries(fixtures)) expect(await after.get(key)).toEqual(value);
  });

  it("refuses newer schemas without deleting or downgrading their records", async () => {
    const name = "future-" + crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => request.result.createObjectStore("records").put("kept", "recovery:future");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const old = new IndexedDbStorage(name);
    await expect(old.set("recovery:future", "overwritten")).rejects.toMatchObject({ name: "VersionError" });
    const result = await new Promise<unknown>((resolve) => {
      const request = indexedDB.open(name, 2);
      request.onsuccess = () => {
        const read = request.result.transaction("records").objectStore("records").get("recovery:future");
        read.onsuccess = () => { resolve(read.result); request.result.close(); };
      };
    });
    expect(result).toBe("kept");
  });

  it("surfaces a failed storage write without clearing an existing connection or recovery", async () => {
    const storage = new IndexedDbStorage("quota-" + crypto.randomUUID());
    await storage.set("connection:kept", { id: "kept" });
    await storage.set("recovery:kept", { before: "original" });
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("Full", "QuotaExceededError"); });
    try { await expect(storage.set("recovery:kept", "changed")).rejects.toMatchObject({ name: "QuotaExceededError" }); }
    finally { put.mockRestore(); }
    expect(await storage.get("connection:kept")).toEqual({ id: "kept" });
    expect(await storage.get("recovery:kept")).toEqual({ before: "original" });
  });
});
