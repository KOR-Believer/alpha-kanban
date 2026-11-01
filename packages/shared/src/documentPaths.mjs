// Portable path arithmetic. Never consults the host filesystem or guesses a repo.
export class ReferenceError extends Error {
  constructor(code, message) { super(message); this.name = "DocumentReferenceError"; this.code = code; }
}
const fail = (code, message) => { throw new ReferenceError(code, message); };

export function absolutePath(value) {
  if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) fail("INVALID_PATH", "Expected an absolute path without control characters.");
  let style, root, rest;
  if (/^[A-Za-z]:[\\/]/.test(value)) { style = "windows"; root = value.slice(0, 2).toUpperCase(); rest = value.slice(3).replaceAll("\\", "/"); }
  else if (/^(?:\\\\|\/\/)[^/\\]+[\/\\][^/\\]+/.test(value)) {
    style = "windows";
    const parts = value.replaceAll("\\", "/").slice(2).split("/");
    root = "//" + parts.shift() + "/" + parts.shift(); rest = parts.join("/");
  } else if (value.startsWith("/") && !value.startsWith("//")) { style = "posix"; root = "/"; rest = value.slice(1); }
  else fail("INVALID_PATH", "Drive-relative, device and non-absolute roots are unsupported.");
  if (/^(\/\/\?|\/\/\.)/.test(root)) fail("INVALID_PATH", "Device paths are unsupported.");
  const parts = [];
  for (const part of rest.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) fail("PATH_ESCAPE", "A path escapes its filesystem root."); parts.pop(); }
    else {
      if (style === "windows" && (/[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail("INVALID_PATH", "Ambiguous Windows path component.");
      parts.push(part);
    }
  }
  return { style, root, parts, path: root === "/" ? "/" + parts.join("/") : root + (parts.length ? "/" + parts.join("/") : "/") };
}

export function pathKey(value) {
  const parsed = absolutePath(value);
  return parsed.style === "windows" ? parsed.path.toLowerCase() : parsed.path;
}
export function within(root, target) {
  const ar = absolutePath(root), bt = absolutePath(target);
  if (ar.style !== bt.style || (ar.style === "windows" ? ar.root.toLowerCase() !== bt.root.toLowerCase() : ar.root !== bt.root)) return false;
  const a = pathKey(root).replace(/\/$/, ""), b = pathKey(target).replace(/\/$/, "");
  return b === a || b.startsWith(a + "/");
}
export function relativePath(fromDirectory, to) {
  const a = absolutePath(fromDirectory), b = absolutePath(to);
  const equal = (x, y) => a.style === "windows" ? x.toLowerCase() === y.toLowerCase() : x === y;
  if (a.style !== b.style || !equal(a.root, b.root)) return null;
  let common = 0;
  while (common < a.parts.length && common < b.parts.length && equal(a.parts[common], b.parts[common])) common++;
  return [...a.parts.slice(common).map(() => ".."), ...b.parts.slice(common)].join("/") || ".";
}
export function parentPath(value) {
  const p = absolutePath(value); p.parts.pop();
  return p.root === "/" ? "/" + p.parts.join("/") : p.root + "/" + p.parts.join("/");
}
export function resolvePath(base, value) {
  if (/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(value)) return absolutePath(value).path;
  const p = absolutePath(base);
  if (p.style === "posix" && value.includes("\\")) fail("AMBIGUOUS_PATH", "A POSIX relative path contains backslashes.");
  return absolutePath(p.path.replace(/\/$/, "") + "/" + (p.style === "windows" ? value.replaceAll("\\", "/") : value)).path;
}
export function projectPath(value) {
  if (typeof value !== "string" || /[\\\0\r\n]/.test(value) || value.includes(":") || !value.split("/").every((p) => p && p !== "." && p !== "..")) {
    fail("INVALID_PATH", "Use an explicit project-relative path with / separators and no dot segments.");
  }
  return value;
}

export function localUrlPath(value) {
  // Markdown network-path URLs are web resources; UNC must use file:// or backslashes.
  if (value.startsWith("//")) return null;
  if (/^file:/i.test(value)) {
    let url;
    try { url = new URL(value); } catch { fail("INVALID_FILE_URL", "Invalid file URL."); }
    if (url.username || url.password || url.port) fail("INVALID_FILE_URL", "File URL credentials and ports are unsupported.");
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { fail("INVALID_ENCODING", "Invalid URL encoding."); }
    if (/%(?:2f|5c|00)/i.test(url.pathname)) fail("AMBIGUOUS_PATH", "Encoded separators and NUL are unsupported.");
    return absolutePath(url.hostname && url.hostname !== "localhost" ? "//" + url.hostname + pathname
      : /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname).path;
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return null;
  if (/%(?:2f|5c|00)/i.test(value)) fail("AMBIGUOUS_PATH", "Encoded separators and NUL are unsupported.");
  try { return decodeURIComponent(value); } catch { fail("INVALID_ENCODING", "Invalid URL encoding."); }
}

export function mappedPath(value, mappings) {
  const matches = mappings.filter((m) => within(m.oldRoot, value)).sort((a, b) => absolutePath(b.oldRoot).parts.length - absolutePath(a.oldRoot).parts.length);
  if (!matches.length) return null;
  const best = matches[0];
  if (matches[1] && pathKey(best.oldRoot) === pathKey(matches[1].oldRoot) && pathKey(best.currentRoot) !== pathKey(matches[1].currentRoot)) {
    fail("MAPPING_CONFLICT", "One old root maps to multiple current roots.");
  }
  return resolvePath(best.currentRoot, relativePath(best.oldRoot, value));
}

export function movePath(value, moves) {
  const matches = moves.filter((m) => within(m.from, value));
  if (matches.length > 1) fail("OVERLAPPING_MOVE", "Move sources overlap.");
  return matches.length ? resolvePath(matches[0].to, relativePath(matches[0].from, value)) : absolutePath(value).path;
}

const encodePart = (part) => encodeURIComponent(part).replace(/%40/g, "@").replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export function encodedPath(value, originalRaw = "", originalDecoded = "") {
  const old = originalRaw.split("/");
  const decoded = originalDecoded.split("/");
  return value.split("/").map((part) => {
    const at = decoded.indexOf(part);
    // Reuse a component's original percent spelling; never carry Markdown escapes into a new context.
    let matches = false;
    try { matches = at >= 0 && decodeURIComponent(old[at] ?? "") === part; } catch { /* Re-encode safely. */ }
    return matches && old[at] && !/[\\<>\s]/.test(old[at]) && !/[()]/.test(old[at]) ? old[at] : encodePart(part);
  }).join("/");
}
export function fileUrl(value) {
  const p = absolutePath(value);
  const suffix = p.parts.map(encodePart).join("/");
  if (p.root.startsWith("//")) return "file:" + p.root.split("/").map(encodePart).join("/") + "/" + suffix;
  return p.style === "windows" ? "file:///" + p.root + "/" + suffix : "file:///" + suffix;
}
