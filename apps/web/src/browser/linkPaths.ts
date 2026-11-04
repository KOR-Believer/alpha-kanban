// Paths here describe the author's link, never the physical path of a browser handle.
export class LocalLinkError extends Error {
  constructor(readonly code: "invalid" | "permission" | "folder" | "missing" | "storage" | "changed", message: string) { super(message); }
}

export type LinkPath = { path: string; fragment: string; absolute: boolean };
const invalid = () => new LocalLinkError("invalid", "This local link has an unsupported or invalid path.");

export function normalizeLink(href: string, documentPath: string): LinkPath {
  let raw = href.trim();
  let fragment = "";
  const hash = raw.indexOf("#");
  try { if (hash >= 0) { fragment = decodeURIComponent(raw.slice(hash + 1)); raw = raw.slice(0, hash); } }
  catch { throw invalid(); }
  raw = raw.split("?")[0]!;
  if (/^file:/i.test(raw)) {
    // Keep UNC hosts as path components; never make a network request for a file URL.
    const network = /^file:\/\/[^/]/i.test(raw) && !/^file:\/\/localhost\//i.test(raw);
    raw = raw.replace(/^file:\/\/localhost(?=\/)/i, "file://").replace(/^file:(?:\/\/)?/i, "");
    if (network) raw = "//" + raw;
    raw = raw.replace(/^\/(?=[a-z]:[\/\\])/i, "");
  } else if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^[a-z]:[\/\\]/i.test(raw)) throw invalid();
  if (/%(?:2f|5c)/i.test(raw)) throw invalid();
  try { raw = decodeURIComponent(raw); } catch { throw invalid(); }
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) throw invalid();
  raw = raw.replace(/\\/g, "/");
  const drive = /^[a-z]:\//i.test(raw) ? raw.slice(0, 2).toUpperCase() : "";
  const unc = !drive && raw.startsWith("//");
  const absolute = Boolean(drive || raw.startsWith("/"));
  const root = drive ? drive + "/" : unc ? "//" : absolute ? "/" : "./";
  const input = absolute ? raw.slice(drive ? 3 : unc ? 2 : 1) : documentPath.split("/").slice(0, -1).join("/") + "/" + raw;
  const parts: string[] = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (absolute) throw invalid();
      else parts.push(part);
    } else parts.push(part);
  }
  if (!parts.length || (unc && parts.length < 3) || parts.at(-1) === "..") throw invalid();
  return { path: root + parts.join("/"), fragment, absolute };
}

export function folderPrefixes(path: string): string[] {
  const result: string[] = [];
  let index = path.lastIndexOf("/");
  while (index > 0) {
    const prefix = path.slice(0, index);
    // Do not offer a UNC server, a drive root, or a parent traversal as a folder name.
    if (prefix !== "." && !prefix.endsWith("/..") && prefix !== "./.." && !/^[a-z]:$/i.test(prefix) && (!path.startsWith("//") || prefix.slice(2).includes("/"))) result.push(prefix);
    index = path.lastIndexOf("/", index - 1);
  }
  if (path.startsWith("./") && !path.startsWith("./../")) result.push(".");
  else if (/^[a-z]:\//i.test(path)) result.push(path.slice(0, 3));
  else if (path.startsWith("/") && !path.startsWith("//")) result.push("/");
  return result;
}

export function relativeToPrefix(path: string, prefix: string): string | undefined {
  const boundary = prefix.endsWith("/") ? prefix : prefix + "/";
  if (!path.startsWith(boundary)) return;
  const relative = path.slice(boundary.length);
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return;
  return relative;
}

export async function readLinkedFile(root: FileSystemDirectoryHandle, path: string): Promise<{ file: File; handle: FileSystemFileHandle }> {
  if (!path || path.split("/").some((part) => !part || part === "." || part === ".." || /[\\:\u0000-\u001f]/.test(part))) throw invalid();
  try {
    if (await root.queryPermission({ mode: "read" }) !== "granted") throw new LocalLinkError("permission", "Allow access to the saved link folder, or choose another folder.");
    // Check the root separately so a removed folder is not reported as a missing file.
    const probe = root.values(); await probe.next(); await probe.return?.();
  } catch (error) {
    if (error instanceof LocalLinkError) throw error;
    throw new LocalLinkError(error instanceof Error && error.name === "NotAllowedError" ? "permission" : "folder", "The saved link folder is unavailable. Choose its new location.");
  }
  try {
    const parts = path.split("/");
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(parts.at(-1)!);
    const resolved = await root.resolve(handle);
    if (!resolved || resolved.join("/") !== path) throw invalid();
    return { handle, file: await handle.getFile() };
  } catch (error) {
    if (error instanceof LocalLinkError) throw error;
    if (error instanceof Error && error.name === "NotAllowedError") throw new LocalLinkError("permission", "Allow access to the saved link folder, or choose another folder.");
    throw new LocalLinkError("missing", "The file is missing at this location. Check the remaining path or choose another folder.");
  }
}
