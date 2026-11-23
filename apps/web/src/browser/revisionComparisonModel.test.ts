import { describe, expect, it } from "vitest";
import { inspectComparisonFile, limitImagePair } from "./revisionComparisonModel";
import { PREVIEW_LIMITS } from "../components/files/previewModel";

describe("Git file comparison", () => {
  it("compares the exact saved text, including BOM, CRLF, trailing spaces and the final line ending", async () => {
    const text = "\uFEFFconst x = 1;  \r\nlast";
    for (const path of ["rule.ts", "notes.md", "notes.markdown", "demo.html"]) {
      const parsed = await inspectComparisonFile(new File([text], path));
      expect(parsed).toMatchObject({ kind: "text", text });
    }
  });
  it("never presents clipped or binary input as a complete text diff", async () => {
    for (const file of [
      new File(["x".repeat(PREVIEW_LIMITS.textBytes + 1)], "large.md"),
      new File(["a\n".repeat(PREVIEW_LIMITS.lines + 1)], "lines.txt"),
      new File(["a".repeat(PREVIEW_LIMITS.lineLength + 1)], "long.ts"),
      new File([new Uint8Array([0, 97])], "invalid.ts"),
      new File([new Uint8Array([0xff, 0xff])], "invalid.md"),
      new File(["%PDF-1.7"], "document.pdf"),
    ]) expect(await inspectComparisonFile(file)).toMatchObject({ kind: "notice", file });
  });
  it("bounds declared image dimensions and both sides together before displaying either URL", async () => {
    function gif(width: number, height: number) {
      const bytes = Uint8Array.from(Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"));
      const view = new DataView(bytes.buffer);
      view.setUint16(6, width, true); view.setUint16(8, height, true);
      return new File([bytes], "photo.gif");
    }
    const small = await inspectComparisonFile(gif(2, 3));
    const large = await inspectComparisonFile(gif(4000, 4000));
    const enormous = await inspectComparisonFile(gif(60000, 60000));
    expect(small).toMatchObject({ kind: "image", width: 2, height: 3 });
    expect(enormous).toMatchObject({ kind: "notice", width: 60000, height: 60000 });
    expect(limitImagePair(large, large)).toMatchObject({ kind: "notice", width: 4000, height: 4000 });
    expect(limitImagePair(enormous, small)).toBe(small);
    expect(limitImagePair(large, small)).toBe(small);
  });
});
