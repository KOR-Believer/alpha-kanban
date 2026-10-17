import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbStorage } from "./storage";

describe("browser operational storage", () => {
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
});
