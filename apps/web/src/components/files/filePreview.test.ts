// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { inspectPreview, PREVIEW_LIMITS } from "./previewModel";
import { prepareHtml } from "./htmlResources";

describe("bounded file previews", () => {
  it("recognizes actual PDF/image bytes with missing or mismatching MIME", async () => {
    expect(await inspectPreview(new File(["%PDF-1.4\n"], "a.PDF", { type: "text/plain" }))).toMatchObject({ kind: "pdf", mime: "application/pdf" });
    expect(await inspectPreview(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "a.SVG"))).toMatchObject({ kind: "image", mime: "image/svg+xml" });
    await expect(inspectPreview(new File(["not a PDF"], "a.pdf"))).rejects.toThrow("PDF");
    await expect(inspectPreview(new File(["not an image"], "a.png"))).rejects.toThrow("image");
  });
  it("never interprets binary as HTML/text and bounds large text", async () => {
    expect(await inspectPreview(new File([new Uint8Array([0, 255, 1, 2])], "unknown"))).toMatchObject({ kind: "file" });
    expect(await inspectPreview(new File(["PK\x03\x04"], "data.zip"))).toMatchObject({ kind: "file" });
    await expect(inspectPreview(new File([new Uint8Array([0, 255])], "bad.txt"))).rejects.toThrow("UTF-8");
    const huge = await inspectPreview(new File(["long line".repeat(PREVIEW_LIMITS.textBytes)], "huge.txt"));
    expect(huge.truncated).toBe(true); expect(huge.text!.length).toBeLessThanOrEqual(PREVIEW_LIMITS.lineLength);
    expect(await inspectPreview(new File(["plain text"], "unknown"))).toMatchObject({ kind: "text", text: "plain text" });
  });
  it("prepares bounded resource bytes without creating parent DOM nodes or Blob URLs", async () => {
    const created = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test/${crypto.randomUUID()}`), revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const read = vi.fn(async (_source: string, href: string) => {
      if (href.includes("missing")) throw new Error("missing");
      return { path: "docs/" + href, file: new File([href.endsWith("css") ? 'body { background:url("bg.svg"); }' : "fixture"], href) };
    });
    try {
      const result = await prepareHtml('<base href="file:///private"><link rel="stylesheet" href="style.css"><script src="app.js"></script><img src="missing.png"><img src="https://example.test/external.png">', "docs/index.html", read, new AbortController().signal);
      expect(read.mock.calls.map(call => call[1])).toEqual(["style.css", "bg.svg", "app.js", "missing.png"]);
      expect(result.html).not.toContain("file:///private"); expect(result.html).toContain("https://example.test/external.png");
      expect(result.failures).toEqual(["missing.png"]); expect(result.resources).toHaveLength(3);
      expect(result.resources.map(resource => resource.blob.type)).toEqual(["image/svg+xml", "text/css", "text/javascript"]);
      expect(result.html).toContain("ak-preview-resource:1:end");
      expect(created).not.toHaveBeenCalled(); expect(revoked).not.toHaveBeenCalled();
      result.dispose(); expect(result.resources).toHaveLength(0);
    } finally { vi.restoreAllMocks(); }
  });
  it("aborts pending resource preparation without keeping parent Blob URLs", async () => {
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:one"), revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const controller = new AbortController();
    const read = vi.fn(async (_source: string, href: string) => { if (href === "b.js") controller.abort(); return { path: href, file: new File(["x"], href) }; });
    try {
      await expect(prepareHtml('<script src="a.js"></script><script src="b.js"></script>', "index.html", read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
      expect(created).not.toHaveBeenCalled(); expect(revoked).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
  it("resolves CSS imports without exposing arbitrary local text as a resource", async () => {
    const read = vi.fn(async (_source: string, href: string) => ({ path: "screens/" + href, file: new File([href === "main.css" ? '@import url(theme.css) screen; /* url(ignored.png) */ .a { content: "url(also-ignored.png)"; }' : "body { color: purple; }"], href) }));
    const result = await prepareHtml('<link rel="stylesheet" href="main.css"><link rel="stylesheet" href="../.ak.user"><script src="../.env"></script><img src="secret.txt">', "screens/index.html", read, new AbortController().signal);
    expect(read.mock.calls.map(call => call[1])).toEqual(["main.css", "theme.css"]);
    expect(result.failures).toEqual(["../.ak.user", "../.env", "secret.txt"]);
    expect(await result.resources[1]!.blob.text()).toContain('@import url(ak-preview-resource:0:end) screen;');
    result.dispose();
  });
  it("keeps app scripts/connect policy strict and confines HTML execution to an opaque sandbox", () => {
    const publicPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../public-browser");
    const headers = readFileSync(resolve(publicPath, "_headers"), "utf8");
    const app = headers.split("/file-preview.html")[0]!;
    expect(app).toContain("script-src 'self';"); expect(app).toContain("connect-src 'self';"); expect(app).toContain("frame-src 'self' blob:");
    for (const route of ["/file-preview.html", "/file-preview\n"]) {
      const specific = headers.split(route)[1]!;
      expect(specific).toContain("! Content-Security-Policy"); expect(specific).toContain("sandbox allow-scripts");
    }
    const host = readFileSync(resolve(publicPath, "file-preview.js"), "utf8");
    expect(host).toContain("event.source !== parent"); expect(host).toContain("event.origin !== expectedOrigin"); expect(host).toContain("event.data.token !== token");
    expect(host).not.toMatch(/indexedDB|showDirectoryPicker|requestPermission/);
  });
});
