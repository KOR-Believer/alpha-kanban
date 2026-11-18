import { previewKind, type PreviewKind } from "../../browser/projectFiles";

export const PREVIEW_LIMITS = { textBytes: 512 * 1024, lines: 10_000, lineLength: 4_000, imageBytes: 50 * 1024 * 1024, imagePixels: 100_000_000, pdfBytes: 100 * 1024 * 1024, htmlBytes: 2 * 1024 * 1024, resourceBytes: 10 * 1024 * 1024, totalResourceBytes: 32 * 1024 * 1024, resources: 100 };
export type FilePreviewData = { kind: PreviewKind; mime: string; text?: string; truncated?: boolean };
export async function inspectPreview(file: File): Promise<FilePreviewData> {
  let kind = previewKind(file.name);
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const prefix = new TextDecoder().decode(bytes);
  if (kind === "pdf") {
    if (!prefix.slice(0, 1024).includes("%PDF-")) throw new Error("This file does not contain a readable PDF. Download it to open with another app.");
    if (file.size > PREVIEW_LIMITS.pdfBytes) throw new Error("This file is too large to preview. Download it to open with another app.");
    return { kind, mime: "application/pdf" };
  }
  if (kind === "image") {
    if (file.size > PREVIEW_LIMITS.imageBytes) throw new Error("This file is too large to preview. Download it to open with another app.");
    const mime = bytes[0] === 137 && prefix.slice(1, 4) === "PNG" ? "image/png" : bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg"
      : prefix.startsWith("GIF8") ? "image/gif" : prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP" ? "image/webp"
      : /<svg[\s>]/i.test(prefix) ? "image/svg+xml" : undefined;
    if (!mime) throw new Error("This image could not be displayed. Download it to open with another app.");
    return { kind, mime };
  }
  if (kind === "file" && (file.type.startsWith("text/") || (!/\.(?:zip|gz|7z|rar|pdf|woff2?|ttf|exe|dll|bin|mp[34]|mov|docx?|xlsx?|pptx?)$/i.test(file.name) && bytes.length > 0 && !bytes.some(byte => byte === 0 || byte < 9 || (byte > 13 && byte < 32))))) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true }); kind = "text"; } catch { /* Keep unknown binary as a download. */ }
  }
  if (kind === "text" || kind === "html") {
    const limit = kind === "html" ? PREVIEW_LIMITS.htmlBytes : PREVIEW_LIMITS.textBytes;
    if (kind === "html" && file.size > limit) throw new Error("This file is too large to preview. Download it to open with another app.");
    let text: string;
    try {
      const source = new Uint8Array(await file.slice(0, limit).arrayBuffer());
      if (source.includes(0)) throw new Error("binary");
      text = new TextDecoder("utf-8", { fatal: true }).decode(source, { stream: file.size > limit });
    } catch { throw new Error("This file is not readable UTF-8 text. Download it to open with another app."); }
    const lines = text.split(/\r?\n/), truncated = file.size > limit || lines.length > PREVIEW_LIMITS.lines || lines.some(line => line.length > PREVIEW_LIMITS.lineLength);
    return { kind, mime: kind === "html" ? "text/html" : "text/plain", text: kind === "html" ? text : lines.slice(0, PREVIEW_LIMITS.lines).map(line => line.slice(0, PREVIEW_LIMITS.lineLength)).join("\n"), truncated };
  }
  return { kind, mime: file.type || "application/octet-stream" };
}
