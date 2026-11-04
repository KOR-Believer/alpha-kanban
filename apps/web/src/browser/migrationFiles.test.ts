import { describe, expect, it, vi } from "vitest";
import { readDocumentMetadata } from "@alpha-kanban/shared/documentMetadata";
import { forEachMigrationFile, MIGRATION_READ_CONCURRENCY, readMigrationFile } from "./migrationFiles";

const id = "11111111-1111-4111-8111-111111111111";
const body = "\n## Content\n" + "Large body.\n".repeat(20_000);
describe("maintenance header reads", () => {
  it.each([
    `# Title\nDocument-ID: ${id}\nOwner: @alice\n`,
    `\uFEFF---\r\nvalue: ${"한글".repeat(3_000)}\r\n---\r\n# Title\r\nDocument-ID: ${id}\r\n`,
    `# Title\n${"\n".repeat(4_077)}Document-ID: ${id}\n`,
    `# Title\nDocument-ID: ${id}\n${"\n".repeat(8_100)}Document-ID: ${id}\n`,
    `# Title\nOwner : @alice\nDocument-ID: ${id}\n`,
    `No title\nDocument-ID: ${id}\n`,
    `# Title\n\n\`\`\`md\nDocument-ID: ${id}\n\`\`\`\n`,
  ])("keeps full-reader metadata semantics across chunk boundaries (%#)", async (header) => {
    const source = header + body, file = new File([source], "example.md");
    let bytes = 0;
    const slice = file.slice.bind(file);
    vi.spyOn(file, "slice").mockImplementation((start, end) => { const part = slice(start, end); bytes += part.size; return part; });
    const result = await readMigrationFile(file, false);
    expect(readDocumentMetadata(result)).toEqual(readDocumentMetadata(source));
    expect(bytes).toBeLessThan(file.size / 2);
  });
  it("reads to EOF when the header never ends and preserves invalid UTF-8 rejection", async () => {
    const source = "---\nvalue: " + "x".repeat(12_000);
    expect(await readMigrationFile(new File([source], "open.md"), false)).toBe(source);
    const invalid = new File([new Uint8Array([0xff])], "invalid.md");
    await expect(readMigrationFile(invalid, false)).rejects.toThrow();
    await expect(readMigrationFile(invalid, true)).rejects.toThrow();
  });
  it("cancels before reading another chunk", async () => {
    const controller = new AbortController(), file = new File(["# Title\n" + "\n".repeat(20_000)], "example.md");
    const slice = file.slice.bind(file);
    const spy = vi.spyOn(file, "slice").mockImplementation((start, end) => { controller.abort(); return slice(start, end); });
    await expect(readMigrationFile(file, false, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("bounded maintenance I/O", () => {
  async function* entries() { for (let i = 0; i < 30; i++) yield i; }
  it("overlaps reads within a fixed bound and drains them on failure", async () => {
    let active = 0, peak = 0, completed = 0;
    await expect(forEachMigrationFile(entries(), async (i) => {
      active++; peak = Math.max(peak, active);
      try { await new Promise(resolve => setTimeout(resolve, 2)); if (i === 0) throw new Error("Read failed"); }
      finally { active--; completed++; }
    })).rejects.toThrow("Read failed");
    expect(active).toBe(0); expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThanOrEqual(MIGRATION_READ_CONCURRENCY);
    expect(completed).toBe(MIGRATION_READ_CONCURRENCY);
  });
  it("stops scheduling after cancellation, without abandoning active reads", async () => {
    const controller = new AbortController(); let active = 0, started = 0;
    await expect(forEachMigrationFile(entries(), async () => {
      active++; started++;
      await new Promise(resolve => setTimeout(resolve, 2)); controller.abort(); active--;
    }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(active).toBe(0); expect(started).toBeLessThanOrEqual(MIGRATION_READ_CONCURRENCY);
  });
});
