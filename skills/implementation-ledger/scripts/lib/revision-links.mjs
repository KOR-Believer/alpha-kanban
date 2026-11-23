/** Shared by the standalone authoring tool and the browser. All paths are Git tree paths. */
export const revisionProtocol = "web+akgit";
const fullOid = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
const controls = /[\u0000-\u001f\u007f]/;
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase());

function validPath(path) {
  return typeof path === "string" && path.length > 0 && !controls.test(path) && !path.includes("\\")
    && path.split("/").every(part => part && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

export function validRepoHint(repo) {
  if (typeof repo !== "string" || repo.length > 1024) return false;
  const slash = repo.indexOf("/");
  if (slash < 1) return false;
  const host = repo.slice(0, slash);
  return /^(?:[a-z\d-]+\.)+[a-z\d-]+(?::\d{1,5})?$/.test(host)
    && validPath(repo.slice(slash + 1)) && !/[\s%\\?#@]/.test(repo);
}

export function normalizeGitRemote(value) {
  try {
    let input = value.trim();
    if (/^[^/@:]+@[^/:]+:/.test(input)) input = "ssh://" + input.replace(/^([^@]+@[^:]+):/, "$1/");
    const url = new URL(input);
    if (!["ssh:", "https:", "http:", "git:"].includes(url.protocol) || !url.hostname.includes(".") || url.search || url.hash) return;
    const port = (url.protocol === "ssh:" && url.port === "22") || (url.protocol === "git:" && url.port === "9418") ? "" : url.port;
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    if (!path || /[\s%\\]/.test(path) || path.split("/").some(part => part === "." || part === "..")) return;
    return url.hostname.toLowerCase() + (port ? ":" + port : "") + "/" + path;
  } catch { return; }
}

export function revisionLines(anchor) {
  const match = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(anchor ?? "");
  if (!match) return;
  const start = Number(match[1]), end = Number(match[2] ?? start);
  if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start) return { start, end };
}

function checked({ commit, path, repo, anchor }) {
  if (!fullOid.test(commit) || !validPath(path) || (repo !== undefined && !validRepoHint(repo))
    || (anchor !== undefined && (typeof anchor !== "string" || !anchor || controls.test(anchor)))) {
    throw new Error("Invalid Git revision link.");
  }
  if (/^L\d+(?:-L?\d+)?$/.test(anchor ?? "") && !revisionLines(anchor)) throw new Error("Invalid Git line range.");
  return { commit: commit.toLowerCase(), path, ...(repo && { repo }), ...(anchor && { anchor }) };
}

export function formatRevisionLink(input) {
  const { commit, path, repo, anchor } = checked(input);
  return revisionProtocol + ":/" + commit + "/" + path.split("/").map(encode).join("/")
    + (repo ? "?repo=" + encode(repo) : "") + (anchor ? "#" + encode(anchor) : "");
}

export function revisionWebUrl(input) {
  const { repo, commit, path, anchor } = checked(input);
  if (!repo) return;
  const [host, ...parts] = repo.split("/");
  if (!(host === "github.com" && parts.length === 2 || host === "gitlab.com" && parts.length >= 2)) return;
  const webAnchor = host === "gitlab.com" && revisionLines(anchor) ? anchor.replace("-L", "-") : anchor;
  return "https://" + host + "/" + parts.map(encode).join("/") + (host === "gitlab.com" ? "/-/blob/" : "/blob/")
    + commit + "/" + path.split("/").map(encode).join("/")
    + (host === "github.com" && /\.(?:md|markdown)$/i.test(path) && revisionLines(anchor) ? "?plain=1" : "") + (webAnchor ? "#" + encode(webAnchor) : "");
}

function treePath(raw) {
  const parts = raw.split("/").map(decodeURIComponent);
  if (parts.some(part => part.includes("/"))) throw new Error("Invalid encoded path separator.");
  return parts.join("/");
}

export function parseRevisionLink(source) {
  if (typeof source !== "string" || source.length > 16384 || controls.test(source)) return;
  try {
    const local = /^web\+akgit:\/([a-f\d]+)\/([^?#]+)(?:\?repo=([^&#]+))?(?:#(.+))?$/i.exec(source);
    if (local) return checked({ commit: local[1], path: treePath(local[2]), repo: local[3] && decodeURIComponent(local[3]), anchor: local[4] && decodeURIComponent(local[4]) });
    const web = /^https:\/\/(?:(github\.com)\/([^/?#]+\/[^/?#]+)\/blob\/|(gitlab\.com)\/([^?#]+?)\/-\/blob\/)([a-f\d]+)\/([^?#]+)(\?plain=1)?(?:#(.+))?$/i.exec(source);
    if (!web) return;
    let anchor = web[8] && decodeURIComponent(web[8]);
    if (web[7] && (!web[1] || !/\.(?:md|markdown)$/i.test(web[6]) || !revisionLines(anchor))) return;
    if (web[3] && /^L\d+-\d+$/.test(anchor ?? "")) anchor = anchor.replace("-", "-L");
    return checked({ repo: (web[1] || web[3]).toLowerCase() + "/" + treePath(web[2] || web[4]), commit: web[5], path: treePath(web[6]), anchor });
  } catch { return; }
}

export function revisionCitation(input, { label, published = false, webLabel = "웹 원문" } = {}) {
  const target = checked(input);
  const href = formatRevisionLink(target);
  const web = published ? revisionWebUrl(target) : undefined;
  const caption = label ?? [target.repo, target.path + (target.anchor ? "#" + target.anchor : ""), target.commit.slice(0, 8)].filter(Boolean).join(" · ");
  const markdownLabel = text => {
    if (typeof text !== "string" || !text.trim() || controls.test(text)) throw new Error("Use a single-line link label.");
    return text.replace(/[\\[\]*_`<>!&~]/g, ch => "\\" + ch);
  };
  const markdown = "[" + markdownLabel(caption) + "](" + href + ")" + (web ? " · [" + markdownLabel(webLabel) + "](" + web + ")" : "");
  return { target, href, ...(web && { web }), markdown };
}
