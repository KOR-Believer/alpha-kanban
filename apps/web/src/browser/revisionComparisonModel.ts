import { imageSize } from "image-size";
import { inspectPreview, PREVIEW_LIMITS } from "../components/files/previewModel";
import { previewKind } from "./projectFiles";

export const COMPARE_PIXEL_LIMIT = 24_000_000;
export const largeImage = "This image exceeds the comparison pixel limit.";
const largeText = "This text exceeds the comparison limit.";
const invalidImage = "The image dimensions could not be read.";

export type ComparisonSide =
  | { kind: "text"; file: File; text: string }
  | { kind: "image"; file: File; mime: string; width: number; height: number }
  | { kind: "notice"; message: string; file?: File; width?: number; height?: number };

export async function inspectComparisonFile(file: File): Promise<ComparisonSide> {
  const notice = (message: string): ComparisonSide => ({ kind: "notice", file, message });
  let kind = previewKind(file.name);
  try {
    if (kind === "image") {
      const { mime } = await inspectPreview(file);
      // Probe dimensions before assigning an image URL, including for highly compressed images.
      const header = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
      const size = imageSize(header);
      const turned = (size.orientation ?? 1) >= 5;
      const width = turned ? size.height : size.width, height = turned ? size.width : size.height;
      if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return notice(invalidImage);
      if (width * height > COMPARE_PIXEL_LIMIT) return { kind: "notice", file, width, height, message: largeImage };
      return { kind: "image", file, mime, width, height };
    }
    if (/\.markdown$/i.test(file.name)) kind = "markdown";
    if (kind === "file") kind = (await inspectPreview(file)).kind;
    if (kind !== "text" && kind !== "markdown" && kind !== "html") return notice("A visual comparison is unavailable for this file type.");
    if (file.size > PREVIEW_LIMITS.textBytes) return notice(largeText);
    // Read exact bytes: the normal source preview clips lines and normalizes CRLF.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    if (text.includes("\0")) return notice("This file cannot be compared as UTF-8 text.");
    const lines = text.split(/\r?\n/);
    if (lines.length > PREVIEW_LIMITS.lines || lines.some(line => line.length > PREVIEW_LIMITS.lineLength)) return notice(largeText);
    return { kind: "text", file, text };
  } catch (error) {
    if (error instanceof DOMException && ["NotReadableError", "NotAllowedError"].includes(error.name)) return notice("The file could not be read. Reopen the comparison to try again.");
    if (kind === "image") return notice(file.size > PREVIEW_LIMITS.imageBytes ? "This image is too large to preview." : invalidImage);
    return notice("This file cannot be compared as UTF-8 text.");
  }
}

export function limitImagePair(before: ComparisonSide, after: ComparisonSide): ComparisonSide {
  if (before.kind === "image" && after.kind === "image" && before.width * before.height + after.width * after.height > COMPARE_PIXEL_LIMIT)
    return { kind: "notice", file: after.file, width: after.width, height: after.height, message: "These images exceed the pixel limit when displayed together." };
  return after;
}
